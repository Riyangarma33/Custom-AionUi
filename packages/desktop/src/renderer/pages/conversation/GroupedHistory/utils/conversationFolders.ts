/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConversationFolder } from '@/common/config/clientSettings';
import type { TChatConversation } from '@/common/config/storage';

import type { ConversationMoveTarget, ResolvedConversationFolder } from '../types';

/** Key in the user-scoped `client_preferences` KV (generic, no backend change). */
export const CONVERSATION_FOLDERS_SETTING_KEY = 'sidebar.conversationFolders';

/**
 * Sentinel destination id for "move back to the project root". Folder ids are
 * UUIDs minted by {@link createConversationFolderId}, so this can never collide
 * with a real folder; both move surfaces (desktop submenu, mobile sheet) key
 * their root entry with it.
 */
export const PROJECT_ROOT_MOVE_KEY = '__project_root__';

/**
 * Arco menu key for the "Move to folder" affordance: the flat mobile item and the
 * desktop submenu share it, while each desktop destination is encoded as
 * `moveToFolder:<group_id>` (`__project_root__` for the root) so one
 * `onClickMenuItem` can dispatch both without a per-folder handler.
 */
export const MOVE_TO_FOLDER_MENU_KEY = 'moveToFolder';
const MOVE_TO_GROUP_MENU_PREFIX = `${MOVE_TO_FOLDER_MENU_KEY}:`;

export const moveToGroupMenuKey = (group_id: string | null): string =>
  `${MOVE_TO_GROUP_MENU_PREFIX}${group_id ?? PROJECT_ROOT_MOVE_KEY}`;

/** `undefined` when the key is not a move destination (any other menu item). */
export const parseMoveToGroupMenuKey = (key: string): string | null | undefined => {
  if (!key.startsWith(MOVE_TO_GROUP_MENU_PREFIX)) return undefined;
  const raw = key.slice(MOVE_TO_GROUP_MENU_PREFIX.length);
  return raw === PROJECT_ROOT_MOVE_KEY ? null : raw;
};

/**
 * Visual nesting cap for the first release. `parent_id` is always persisted,
 * so lifting this cap later is a render-time change with no migration — but the
 * resolver below still **walks** the parent chain and demotes anything deeper
 * than this to the project root, so a hand-edited KV blob cannot produce a
 * depth-2 row.
 */
export const CONVERSATION_FOLDER_MAX_DEPTH = 1;

const ORDER_KEY_GAP = 1024;
const MAX_NAME_LENGTH = 200;

/**
 * Collapse-state key for a folder row. Shares the panel's existing
 * `collapsedSections` storage rather than introducing a second collapse model.
 */
export const conversationFolderSectionKey = (group_id: string): string => `folder:${group_id}`;

/**
 * Read the folder membership key off a conversation. `null` means "directly
 * under the project row", i.e. today's rendering, so no backfill is needed.
 */
export const getConversationGroupId = (conversation: TChatConversation): string | null => {
  const extra = conversation.extra as { group_id?: unknown } | undefined;
  const value = extra?.group_id;
  return typeof value === 'string' && value.length > 0 ? value : null;
};

/**
 * Destinations for a conversation: the project root first, then the folders of
 * **its own** workspace (folders never span projects), in catalog order — the
 * order the mobile action sheet has always used. The entry matching the
 * conversation's current `group_id` is flagged `isCurrent` so every surface
 * disables it rather than offering a no-op move.
 *
 * Shared by both move surfaces (desktop row-menu submenu, mobile action sheet)
 * so membership logic lives in exactly one place.
 */
export const getMoveTargets = (
  conversation: TChatConversation,
  folderCatalog: ConversationFolder[],
  projectRootLabel: string
): ConversationMoveTarget[] => {
  const workspace = conversation.extra?.workspace;
  const currentGroupId = getConversationGroupId(conversation);
  const folders = folderCatalog.filter((folder) => folder.workspace === workspace);

  return [
    { groupId: null, label: projectRootLabel, isCurrent: currentGroupId === null },
    ...folders.map((folder) => ({
      groupId: folder.group_id,
      label: folder.name,
      isCurrent: currentGroupId === folder.group_id,
    })),
  ];
};

/**
 * Defensive parse of the KV payload. The catalog is user-editable JSON, so
 * every field is validated and invalid/dangling entries are dropped rather than
 * allowed to poison the render.
 */
export const sanitizeConversationFolders = (raw: unknown): ConversationFolder[] => {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const folders: ConversationFolder[] = [];

  raw.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const candidate = item as Partial<Record<keyof ConversationFolder, unknown>>;

    const group_id = typeof candidate.group_id === 'string' ? candidate.group_id.trim() : '';
    const workspace = typeof candidate.workspace === 'string' ? candidate.workspace.trim() : '';
    const rawName = typeof candidate.name === 'string' ? candidate.name.trim() : '';
    const name = rawName.slice(0, MAX_NAME_LENGTH);

    if (!group_id || !workspace || !name) return;
    if (seen.has(group_id)) return;
    seen.add(group_id);

    const parentRaw = candidate.parent_id;
    const parent_id =
      typeof parentRaw === 'string' && parentRaw.trim().length > 0 && parentRaw !== group_id ? parentRaw : null;

    const orderRaw = candidate.order_key;
    const order_key =
      typeof orderRaw === 'number' && Number.isFinite(orderRaw) ? orderRaw : (index + 1) * ORDER_KEY_GAP;

    folders.push({ group_id, workspace, parent_id, name, order_key });
  });

  return folders;
};

/**
 * Load the catalog. The settings service is imported dynamically so this module
 * stays a pure data module (unit-testable without pulling the HTTP bridge in).
 */
export const loadConversationFolders = async (): Promise<ConversationFolder[]> => {
  const { getClientBusinessSetting } = await import('@/renderer/services/clientBusinessSettings');
  const raw = await getClientBusinessSetting(CONVERSATION_FOLDERS_SETTING_KEY);
  return sanitizeConversationFolders(raw);
};

/** Persist the catalog through the generic client-settings KV. */
export const saveConversationFolders = async (folders: ConversationFolder[]): Promise<void> => {
  const { setClientBusinessSetting } = await import('@/renderer/services/clientBusinessSettings');
  await setClientBusinessSetting(CONVERSATION_FOLDERS_SETTING_KEY, folders);
};

export const createConversationFolderId = (): string => {
  const cryptoObj = typeof globalThis !== 'undefined' ? (globalThis.crypto as Crypto | undefined) : undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  return `folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const getNextFolderOrderKey = (catalog: ConversationFolder[], workspace: string): number => {
  const max = catalog
    .filter((folder) => folder.workspace === workspace)
    .reduce((acc, folder) => (folder.order_key > acc ? folder.order_key : acc), 0);
  return max + ORDER_KEY_GAP;
};

/**
 * Resolve a folder's *effective* parent after enforcing the visual depth cap.
 *
 * - Missing parent, self-reference and cycles are treated as root.
 * - Any chain longer than `CONVERSATION_FOLDER_MAX_DEPTH` is demoted to root.
 * - A parent belonging to a different workspace is ignored (folders never span
 *   project groups).
 */
const resolveEffectiveParentId = (
  folder: ConversationFolder,
  byId: Map<string, ConversationFolder>
): string | null => {
  const directParent = folder.parent_id;
  if (!directParent) return null;
  if (directParent === folder.group_id) return null;
  if (!byId.has(directParent)) return null;

  let depth = 0;
  let cursor: string | null = directParent;
  const seen = new Set<string>([folder.group_id]);

  while (cursor) {
    if (seen.has(cursor)) return null;
    seen.add(cursor);

    depth += 1;
    const parentFolder = byId.get(cursor);
    if (!parentFolder || parentFolder.workspace !== folder.workspace) return null;

    cursor = parentFolder.parent_id;
    if (depth > CONVERSATION_FOLDER_MAX_DEPTH) return null;
  }

  return directParent;
};

const sortFolders = (a: ConversationFolder, b: ConversationFolder): number =>
  a.order_key - b.order_key || a.name.localeCompare(b.name);

/**
 * Bucket a workspace's conversations into its folder tree plus the root
 * ("directly under the project row") list.
 *
 * Conversations whose `group_id` points at a folder that is missing or belongs
 * to another workspace fall back to the root, so a wiped/orphaned catalog can
 * never make a chat disappear.
 */
export const resolveWorkspaceFolders = (
  workspace: string,
  catalog: ConversationFolder[],
  conversations: TChatConversation[]
): { rootConversations: TChatConversation[]; folders: ResolvedConversationFolder[] } => {
  const workspaceFolders = catalog.filter((folder) => folder.workspace === workspace);
  if (workspaceFolders.length === 0) {
    return { rootConversations: conversations, folders: [] };
  }

  const byId = new Map(workspaceFolders.map((folder) => [folder.group_id, folder] as const));
  const effectiveParentById = new Map<string, string | null>();
  for (const folder of workspaceFolders) {
    effectiveParentById.set(folder.group_id, resolveEffectiveParentId(folder, byId));
  }

  const folderIds = new Set(workspaceFolders.map((folder) => folder.group_id));
  const conversationsByGroup = new Map<string, TChatConversation[]>();
  const rootConversations: TChatConversation[] = [];

  for (const conversation of conversations) {
    const groupId = getConversationGroupId(conversation);
    if (groupId && folderIds.has(groupId)) {
      const bucket = conversationsByGroup.get(groupId);
      if (bucket) bucket.push(conversation);
      else conversationsByGroup.set(groupId, [conversation]);
    } else {
      rootConversations.push(conversation);
    }
  }

  const buildLevel = (parentId: string | null): ResolvedConversationFolder[] =>
    workspaceFolders
      .filter((folder) => (effectiveParentById.get(folder.group_id) ?? null) === parentId)
      .toSorted(sortFolders)
      .map((folder) => ({
        ...folder,
        parent_id: parentId,
        conversations: conversationsByGroup.get(folder.group_id) ?? [],
        children: buildLevel(folder.group_id),
      }));

  return { rootConversations, folders: buildLevel(null) };
};
