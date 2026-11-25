/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ConversationFolder } from '@/common/config/clientSettings';
import type { TChatConversation } from '@/common/config/storage';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { emitter } from '@/renderer/utils/emitter';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  createConversationFolderId,
  getConversationGroupId,
  getNextFolderOrderKey,
  loadConversationFolders,
  saveConversationFolders,
} from '../utils/conversationFolders';
import { assignConversationsToFolder } from './useFolderAssignment';

const MAX_FOLDER_NAME_LENGTH = 200;

const normalizeFolderName = (name: string): string => name.trim().slice(0, MAX_FOLDER_NAME_LENGTH);

export type ConversationFoldersController = {
  folders: ConversationFolder[];
  /** True once the KV round-trip has settled (success or failure). */
  loaded: boolean;
  createFolder: (workspace: string, name: string) => Promise<ConversationFolder | null>;
  renameFolder: (group_id: string, name: string) => Promise<boolean>;
  deleteFolder: (group_id: string) => Promise<boolean>;
  /** Assign conversations to a folder; `null` moves them back to the project root. */
  moveConversations: (conversationIds: string[], group_id: string | null) => Promise<number>;
  /**
   * Re-key the catalog when a workspace path changes. Folders are keyed by the
   * workspace path, so a rename is a key migration, not a no-op. There is no
   * workspace-rename surface in the client-derived panel yet; this is the model
   * operation a future surface must call in the same step that rewrites
   * conversations' `extra.workspace`.
   */
  renameWorkspaceFolders: (oldWorkspace: string, newWorkspace: string) => Promise<boolean>;
};

/**
 * Folder catalog state for the left panel (Phase 3.12, Track A).
 *
 * Loads from the user-scoped `client_preferences` KV once the session is
 * authenticated (the shared layout survives the login transition, so the first
 * mount can legitimately happen on the login screen), keeps an authoritative
 * in-memory copy in a ref (so mutation handlers never read a stale React state),
 * and writes back through the generic `/api/settings/client` endpoint.
 */
export const useConversationFolders = (conversations: TChatConversation[]): ConversationFoldersController => {
  const { status: authStatus } = useAuth();
  const [folders, setFoldersState] = useState<ConversationFolder[]>([]);
  const [loaded, setLoaded] = useState(false);
  const foldersRef = useRef<ConversationFolder[]>([]);
  const conversationsRef = useRef<TChatConversation[]>(conversations);
  // Workspaces implicated in a *permanent* conversation delete, waiting for the
  // refreshed list to decide whether the workspace is gone for good.
  const pendingDeletedWorkspacesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const applyFolders = useCallback((next: ConversationFolder[]) => {
    foldersRef.current = next;
    setFoldersState(next);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      // Non-browser (tests/SSR): keep the empty catalog.
      setLoaded(true);
      return;
    }
    // Do not probe the KV before the session exists — a 401 here would leave the
    // catalog empty for the whole logged-in session. Logout clears the catalog so
    // a different user never sees the previous user's folders.
    if (authStatus === 'unauthenticated') {
      applyFolders([]);
      setLoaded(true);
      return;
    }
    if (authStatus !== 'authenticated') return;

    let cancelled = false;
    setLoaded(false);
    loadConversationFolders()
      .then((catalog) => {
        if (cancelled) return;
        applyFolders(catalog);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('[ConversationFolders] Failed to load catalog:', error);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [applyFolders, authStatus]);

  const persist = useCallback(
    async (next: ConversationFolder[]): Promise<boolean> => {
      // Optimistic: reflect immediately, then persist. A failed write leaves the
      // in-memory catalog ahead of storage until the next reload — acceptable
      // for UI metadata and consistent with the existing sortOrder behaviour.
      applyFolders(next);
      try {
        await saveConversationFolders(next);
        return true;
      } catch (error) {
        console.error('[ConversationFolders] Failed to persist catalog:', error);
        return false;
      }
    },
    [applyFolders]
  );

  // Track the workspace of permanently deleted conversations. Archiving is
  // deliberately NOT observed: archived conversations disappear from the active
  // list but must keep their catalog entry so placement survives an
  // unarchive round-trip (ratified 3.12c decision).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const unsubscribe = ipcBridge.conversation.listChanged.on((event) => {
      if (event.action !== 'deleted') return;
      const deleted = conversationsRef.current.find(
        (conversation) => conversation.id === event.conversation_id
      );
      const workspace = deleted?.extra?.workspace;
      if (workspace) pendingDeletedWorkspacesRef.current.add(workspace);
    });
    return unsubscribe;
  }, []);

  // Once a refreshed list shows a deleted workspace has no conversations left,
  // garbage-collect its catalog entries. This is the only automatic GC path:
  // workspace rename has no surface in the client-derived panel, and archive
  // must preserve the catalog.
  useEffect(() => {
    if (!loaded) return;
    const pending = pendingDeletedWorkspacesRef.current;
    if (pending.size === 0) return;

    const activeWorkspaces = new Set<string>();
    for (const conversation of conversations) {
      const workspace = conversation.extra?.workspace;
      if (workspace) activeWorkspaces.add(workspace);
    }

    const prunable = Array.from(pending).filter((workspace) => !activeWorkspaces.has(workspace));
    if (prunable.length === 0) return;
    pending.clear();

    const remaining = foldersRef.current.filter((folder) => !prunable.includes(folder.workspace));
    if (remaining.length !== foldersRef.current.length) {
      void persist(remaining);
    }
  }, [conversations, loaded, persist]);

  const createFolder = useCallback(
    async (workspace: string, name: string): Promise<ConversationFolder | null> => {
      const trimmed = normalizeFolderName(name);
      if (!trimmed || !workspace) return null;
      const folder: ConversationFolder = {
        group_id: createConversationFolderId(),
        workspace,
        parent_id: null,
        name: trimmed,
        order_key: getNextFolderOrderKey(foldersRef.current, workspace),
      };
      const ok = await persist([...foldersRef.current, folder]);
      return ok ? folder : null;
    },
    [persist]
  );

  const renameFolder = useCallback(
    async (group_id: string, name: string): Promise<boolean> => {
      const trimmed = normalizeFolderName(name);
      if (!trimmed) return false;
      const next = foldersRef.current.map((folder) =>
        folder.group_id === group_id ? { ...folder, name: trimmed } : folder
      );
      return persist(next);
    },
    [persist]
  );

  const deleteFolder = useCallback(
    async (group_id: string): Promise<boolean> => {
      // Move members back to the project root first (sequential writes), then
      // drop the catalog row. An emptied folder persists; a deleted one does not.
      const memberIds = conversationsRef.current
        .filter((conversation) => getConversationGroupId(conversation) === group_id)
        .map((conversation) => conversation.id);
      if (memberIds.length > 0) {
        await assignConversationsToFolder(memberIds, null);
      }

      const next = foldersRef.current
        .filter((folder) => folder.group_id !== group_id)
        // Orphaned children (only reachable via a hand-edited KV) are promoted
        // to root rather than left dangling.
        .map((folder) => (folder.parent_id === group_id ? { ...folder, parent_id: null } : folder));

      const ok = await persist(next);
      if (ok) emitter.emit('chat.history.refresh');
      return ok;
    },
    [persist]
  );

  const moveConversations = useCallback(
    async (conversationIds: string[], group_id: string | null): Promise<number> => {
      if (conversationIds.length === 0) return 0;
      const changed = await assignConversationsToFolder(conversationIds, group_id);
      if (changed > 0) emitter.emit('chat.history.refresh');
      return changed;
    },
    []
  );

  const renameWorkspaceFolders = useCallback(
    async (oldWorkspace: string, newWorkspace: string): Promise<boolean> => {
      if (!oldWorkspace || !newWorkspace || oldWorkspace === newWorkspace) return false;
      const hasEntries = foldersRef.current.some((folder) => folder.workspace === oldWorkspace);
      if (!hasEntries) return false;
      const next = foldersRef.current.map((folder) =>
        folder.workspace === oldWorkspace ? { ...folder, workspace: newWorkspace } : folder
      );
      return persist(next);
    },
    [persist]
  );

  return {
    folders,
    loaded,
    createFolder,
    renameFolder,
    deleteFolder,
    moveConversations,
    renameWorkspaceFolders,
  };
};
