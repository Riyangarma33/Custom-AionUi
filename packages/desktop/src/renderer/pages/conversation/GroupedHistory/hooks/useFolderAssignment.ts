/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';

type GroupIdPatch = Partial<TChatConversation['extra']>;

/**
 * Persist a conversation's folder membership in `extra.group_id`.
 *
 * Mirrors `persistSortOrder` in `useDragAndDrop.ts`: the backend merges top-level
 * `extra` keys, so writing a single key never clobbers the rest of the blob.
 * `group_id: null` clears the membership (a JSON `null` is preserved by the
 * merge, unlike removing the key).
 *
 * NOTE: `merge_extra` is a legacy frontend-only flag — Rust merges
 * unconditionally — but it is sent for parity with the proven sort-order path.
 */
export const persistConversationGroupId = async (
  conversation_id: string,
  group_id: string | null
): Promise<boolean> => {
  try {
    await ipcBridge.conversation.update.invoke({
      id: conversation_id,
      updates: {
        extra: { group_id } as unknown as GroupIdPatch,
      } as Partial<TChatConversation>,
      merge_extra: true,
    });
    return true;
  } catch (error) {
    console.error('[ConversationFolders] Failed to persist group id:', error);
    return false;
  }
};

/**
 * Assign one folder to a list of conversations, **sequentially**.
 *
 * Deliberately not `Promise.all`: each write is a read-modify-write of the same
 * `extra` blob against the same SQLite pool, so a ten-conversation move must not
 * open ten concurrent windows. (Contrast `useDragAndDrop.ts`, where the
 * concurrent reindex is safe only because it touches distinct rows in a bounded
 * pinned list.)
 *
 * Returns the number of conversations that were persisted successfully.
 */
export const assignConversationsToFolder = async (
  conversationIds: string[],
  group_id: string | null
): Promise<number> => {
  let changed = 0;
  for (const conversation_id of conversationIds) {
    // Intentional sequential await — see the doc comment above.
    const ok = await persistConversationGroupId(conversation_id, group_id);
    if (ok) changed += 1;
  }
  return changed;
};

/** Convenience hook wrapper (kept for the folder-assignment entry point). */
export const useFolderAssignment = () => ({
  persistConversationGroupId,
  assignConversationsToFolder,
});
