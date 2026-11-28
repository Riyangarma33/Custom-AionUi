/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { ConversationFolder } from '@/common/config/clientSettings';
import type { TChatConversation } from '@/common/config/storage';
import {
  filterChangedMoveIds,
  getConversationGroupId,
  getMoveTargets,
  MOVE_TO_FOLDER_MENU_KEY,
  moveToGroupMenuKey,
  parseMoveToGroupMenuKey,
  PROJECT_ROOT_MOVE_KEY,
  resolveWorkspaceFolders,
  sanitizeConversationFolders,
} from '@/renderer/pages/conversation/GroupedHistory/utils/conversationFolders';

const conversation = (id: string, extra: Record<string, unknown>, modified_at = 100): TChatConversation =>
  ({
    id,
    name: id,
    type: 'acp',
    created_at: modified_at,
    modified_at,
    extra,
  }) as unknown as TChatConversation;

const folder = (overrides: Partial<ConversationFolder> = {}): ConversationFolder => ({
  group_id: 'g1',
  workspace: '/ws',
  parent_id: null,
  name: 'Folder',
  order_key: 1024,
  ...overrides,
});

describe('getConversationGroupId', () => {
  it('reads a non-empty string group_id', () => {
    expect(getConversationGroupId(conversation('c1', { group_id: 'g1' }))).toBe('g1');
  });

  it('treats missing, empty and non-string values as no folder', () => {
    expect(getConversationGroupId(conversation('c1', {}))).toBeNull();
    expect(getConversationGroupId(conversation('c2', { group_id: '' }))).toBeNull();
    expect(getConversationGroupId(conversation('c3', { group_id: 42 }))).toBeNull();
    expect(getConversationGroupId(conversation('c4', { group_id: null }))).toBeNull();
  });
});

describe('sanitizeConversationFolders', () => {
  it('returns an empty catalog for non-array payloads', () => {
    expect(sanitizeConversationFolders(undefined)).toEqual([]);
    expect(sanitizeConversationFolders(null)).toEqual([]);
    expect(sanitizeConversationFolders({ group_id: 'g1' })).toEqual([]);
  });

  it('drops invalid entries, dedupes ids and assigns fallback order keys', () => {
    const result = sanitizeConversationFolders([
      folder({ group_id: 'g1', name: '  Work  ' }),
      folder({ group_id: 'g1', name: 'Duplicate' }),
      { group_id: '', workspace: '/ws', name: 'Missing id' },
      { group_id: 'g2', workspace: '/ws', name: '' },
      'not-an-object',
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({ group_id: 'g1', name: 'Work', parent_id: null, order_key: 1024 })
    );
  });

  it('drops self-parenting', () => {
    const [result] = sanitizeConversationFolders([folder({ group_id: 'g1', parent_id: 'g1' })]);
    expect(result.parent_id).toBeNull();
  });
});

describe('resolveWorkspaceFolders', () => {
  const ws = '/ws';

  it('returns the conversations unchanged when the catalog has no folders for the workspace', () => {
    const conversations = [conversation('c1', { workspace: ws, custom_workspace: true })];
    const result = resolveWorkspaceFolders(ws, [], conversations);

    expect(result.folders).toEqual([]);
    expect(result.rootConversations).toEqual(conversations);
  });

  it('buckets conversations by group_id and keeps unresolved memberships at the root', () => {
    const conversations = [
      conversation('root', { workspace: ws, custom_workspace: true }),
      conversation('in-folder', { workspace: ws, custom_workspace: true, group_id: 'g1' }),
      conversation('orphan', { workspace: ws, custom_workspace: true, group_id: 'missing' }),
    ];

    const result = resolveWorkspaceFolders(ws, [folder({ group_id: 'g1' })], conversations);

    expect(result.rootConversations.map((c) => c.id)).toEqual(['root', 'orphan']);
    expect(result.folders).toHaveLength(1);
    expect(result.folders[0].conversations.map((c) => c.id)).toEqual(['in-folder']);
  });

  it('keeps empty folders in the tree (catalog is authoritative)', () => {
    const result = resolveWorkspaceFolders(ws, [folder({ group_id: 'g1' })], []);
    expect(result.folders).toHaveLength(1);
    expect(result.folders[0].conversations).toEqual([]);
  });

  it('walks parent_id but demotes anything deeper than one level to the root', () => {
    const catalog = [
      folder({ group_id: 'a', name: 'A', parent_id: null, order_key: 1 }),
      folder({ group_id: 'b', name: 'B', parent_id: 'a', order_key: 2 }),
      folder({ group_id: 'c', name: 'C', parent_id: 'b', order_key: 3 }),
    ];

    const result = resolveWorkspaceFolders(ws, catalog, []);

    // A and demoted C sit at the top level; B is A's only child.
    expect(result.folders.map((f) => f.group_id)).toEqual(['a', 'c']);
    expect(result.folders[0].children.map((f) => f.group_id)).toEqual(['b']);
    expect(result.folders[0].children[0].children).toEqual([]);
  });

  it('treats parent cycles as root folders', () => {
    const catalog = [
      folder({ group_id: 'a', parent_id: 'b', order_key: 1 }),
      folder({ group_id: 'b', parent_id: 'a', order_key: 2 }),
    ];

    const result = resolveWorkspaceFolders(ws, catalog, []);
    expect(result.folders.map((f) => f.group_id).sort()).toEqual(['a', 'b']);
    expect(result.folders.every((f) => f.children.length === 0)).toBe(true);
  });

  it('ignores folders belonging to another workspace when resolving parents', () => {
    const catalog = [
      folder({ group_id: 'a', workspace: '/other', parent_id: null }),
      folder({ group_id: 'b', workspace: ws, parent_id: 'a' }),
    ];

    const result = resolveWorkspaceFolders(ws, catalog, []);
    expect(result.folders.map((f) => f.group_id)).toEqual(['b']);
    expect(result.folders[0].parent_id).toBeNull();
  });
});

describe('getMoveTargets', () => {
  const workspace = '/ws';
  const catalog = [
    folder({ group_id: 'g1', workspace, name: 'Work', order_key: 1024 }),
    folder({ group_id: 'g2', workspace, name: 'Personal', order_key: 2048 }),
    folder({ group_id: 'g3', workspace: '/other', name: 'Elsewhere' }),
  ];

  it('lists the project root first, then the workspace folders in catalog order', () => {
    const targets = getMoveTargets(conversation('c1', { workspace }), catalog, 'Project root');

    expect(targets.map((t) => t.groupId)).toEqual([null, 'g1', 'g2']);
    expect(targets.map((t) => t.label)).toEqual(['Project root', 'Work', 'Personal']);
    // A root conversation has nothing left at the root, so that entry is the no-op.
    expect(targets.map((t) => t.isCurrent)).toEqual([true, false, false]);
  });

  it("marks the conversation's own folder as current and leaves the root selectable", () => {
    const targets = getMoveTargets(conversation('c2', { workspace, group_id: 'g2' }), catalog, 'Project root');

    expect(targets.map((t) => t.isCurrent)).toEqual([false, false, true]);
  });

  it('scopes destinations to the conversation workspace', () => {
    const targets = getMoveTargets(conversation('c3', { workspace: '/empty' }), catalog, 'Project root');

    expect(targets).toEqual([{ groupId: null, label: 'Project root', isCurrent: true }]);
  });

  it('returns only the root entry for an empty catalog', () => {
    // The desktop submenu hides itself in this case; the mobile sheet still shows
    // the single (disabled) root entry, exactly as before.
    expect(getMoveTargets(conversation('c4', { workspace }), [], 'Project root')).toEqual([
      { groupId: null, label: 'Project root', isCurrent: true },
    ]);
  });

  it('leaves nothing current when the membership points at a missing folder', () => {
    // Orphaned group_id: the row renders at the project root, and moving to the
    // root is a real write that clears the stale value - so it must stay enabled.
    const targets = getMoveTargets(conversation('c5', { workspace, group_id: 'gone' }), catalog, 'Project root');

    expect(targets.every((t) => !t.isCurrent)).toBe(true);
  });

  it('keys the root destination with the shared sentinel', () => {
    expect(PROJECT_ROOT_MOVE_KEY).toBe('__project_root__');
    expect(getMoveTargets(conversation('c6', { workspace }), catalog, 'Project root')[0].groupId).toBeNull();
  });
});

describe('filterChangedMoveIds (P5 half 2 no-op guard)', () => {
  const ws = '/ws';

  it('keeps ids whose membership actually changes', () => {
    const conversations = [
      conversation('root', { workspace: ws }),
      conversation('in-g1', { workspace: ws, group_id: 'g1' }),
    ];
    // root -> folder g1 is a real change; g1 -> g1 is a no-op.
    expect(filterChangedMoveIds(conversations, ['root'], 'g1')).toEqual(['root']);
    expect(filterChangedMoveIds(conversations, ['in-g1'], null)).toEqual(['in-g1']);
  });

  it('drops ids already at the destination (drag onto the current folder / own header)', () => {
    const conversations = [
      conversation('root', { workspace: ws }),
      conversation('in-g1', { workspace: ws, group_id: 'g1' }),
    ];
    // Dropping a folder member on its own folder, or a root chat on its own
    // project header, must produce an empty write set → performMove stays inert.
    expect(filterChangedMoveIds(conversations, ['in-g1'], 'g1')).toEqual([]);
    expect(filterChangedMoveIds(conversations, ['root'], null)).toEqual([]);
  });

  it('reduces a mixed batch to only the changed ids, preserving order', () => {
    const conversations = [
      conversation('a', { workspace: ws }),
      conversation('b', { workspace: ws, group_id: 'g1' }),
      conversation('c', { workspace: ws, group_id: 'g2' }),
    ];
    // Move a,b,c all into g1: b is already there (dropped), a and c change (kept).
    expect(filterChangedMoveIds(conversations, ['c', 'b', 'a'], 'g1')).toEqual(['c', 'a']);
  });

  it('keeps an unknown id — it cannot be proven a no-op', () => {
    const conversations = [conversation('b', { workspace: ws, group_id: 'g1' })];
    // 'ghost' is not in the loaded list: keep it so a legitimate move is never
    // silently dropped (backend is the source of truth; write is touch-free).
    expect(filterChangedMoveIds(conversations, ['ghost', 'b'], 'g1')).toEqual(['ghost']);
  });

  it('treats empty/missing/non-string group_id as the project root', () => {
    const conversations = [
      conversation('empty', { workspace: ws, group_id: '' }),
      conversation('number', { workspace: ws, group_id: 42 }),
      conversation('null', { workspace: ws, group_id: null }),
    ];
    // All three already resolve to "no folder" (null), so a move to the root is a
    // no-op for each; a move into a real folder changes all of them.
    expect(filterChangedMoveIds(conversations, ['empty', 'number', 'null'], null)).toEqual([]);
    expect(filterChangedMoveIds(conversations, ['empty', 'number', 'null'], 'g1')).toEqual([
      'empty',
      'number',
      'null',
    ]);
  });

  it('keeps a move that clears an orphaned group_id (still a real write)', () => {
    // Mirrors getMoveTargets "leaves nothing current when the membership points at
    // a missing folder": the row renders at the root but extra still carries the
    // stale id, so clearing it to null is a genuine change.
    const conversations = [conversation('orphan', { workspace: ws, group_id: 'gone' })];
    expect(filterChangedMoveIds(conversations, ['orphan'], null)).toEqual(['orphan']);
  });

  it('returns an empty set for an empty request', () => {
    expect(filterChangedMoveIds([conversation('a', { workspace: ws })], [], null)).toEqual([]);
    expect(filterChangedMoveIds([], ['a'], null)).toEqual(['a']);
  });
});

describe('move-to-folder menu keys', () => {
  it('round-trips every destination the row-menu submenu renders', () => {
    // Regression guard for the desktop submenu: `onClickMenuItem` only receives a
    // string, so the encode/parse pair must return exactly the destination the
    // entry was rendered for (null = project root, otherwise the folder id).
    const ids = [null, 'g1', 'b3f0f6f2-3f1e-4d6a-9a72-c2a0e4f9d1aa'];
    expect(ids.map((id) => parseMoveToGroupMenuKey(moveToGroupMenuKey(id)))).toEqual(ids);
  });

  it('does not claim other menu items', () => {
    expect(parseMoveToGroupMenuKey(MOVE_TO_FOLDER_MENU_KEY)).toBeUndefined();
    expect(parseMoveToGroupMenuKey('archive')).toBeUndefined();
    expect(parseMoveToGroupMenuKey('pin')).toBeUndefined();
  });

  it('keeps the flat item key distinct from the encoded destinations', () => {
    // The mobile sheet is dispatched on `moveToFolder` itself; an encoded folder
    // must never be mistaken for it.
    expect(moveToGroupMenuKey('g1')).not.toBe(MOVE_TO_FOLDER_MENU_KEY);
    expect(parseMoveToGroupMenuKey(MOVE_TO_FOLDER_MENU_KEY)).toBeUndefined();
  });
});
