/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CollisionDetection, DragEndEvent } from '@dnd-kit/core';
import { PointerSensor, pointerWithin, rectIntersection, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { emitter } from '@/renderer/utils/emitter';
import { useCallback } from 'react';

import {
  assignInitialSortOrders,
  computeSortOrder,
  getConversationSortOrder,
  needsReindex,
  reindexSortOrders,
} from '../utils/sortOrderHelpers';

type UseDragAndDropParams = {
  pinnedConversations: TChatConversation[];
  batchMode: boolean;
  collapsed: boolean;
  /**
   * Folder drop handler. `groupId === null` means the drop landed on the
   * project header ("move back to project root").
   */
  onAssignToFolder: (conversationId: string, workspace: string, groupId: string | null) => void;
};

/**
 * Prefer what the pointer is actually over (folder headers are small targets),
 * then fall back to rectangle intersection for the sortable pinned list.
 */
const folderAwareCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;
  return rectIntersection(args);
};

export const useDragAndDrop = ({
  pinnedConversations,
  batchMode,
  collapsed,
  onAssignToFolder,
}: UseDragAndDropParams) => {
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;

  const isDragEnabled = !batchMode && !collapsed && !isMobile;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const persistSortOrder = useCallback(async (conversation_id: string, sortOrder: number) => {
    try {
      await ipcBridge.conversation.update.invoke({
        id: conversation_id,
        updates: {
          extra: {
            sortOrder,
          } as Partial<TChatConversation['extra']>,
        } as Partial<TChatConversation>,
        merge_extra: true,
      });
    } catch (error) {
      console.error('[DragAndDrop] Failed to persist sort order:', error);
    }
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;

      if (!over || active.id === over.id) return;

      const activeIdStr = String(active.id);
      const overIdStr = String(over.id);

      const activeData = active.data.current as
        | { type?: string; conversation?: TChatConversation }
        | undefined;
      const overData = over.data.current as
        | { type?: string; workspace?: string; groupId?: string }
        | undefined;

      // Project / folder conversation dragged onto a folder or the project header.
      if (activeData?.type === 'project-conversation' && activeData.conversation) {
        if (!overData) return;
        const workspace = activeData.conversation.extra?.workspace;
        // Folders never span project groups; ignore cross-workspace drops.
        if (!workspace || overData.workspace !== workspace) return;

        if (overData.type === 'folder' && overData.groupId) {
          onAssignToFolder(activeData.conversation.id, workspace, overData.groupId);
          return;
        }
        if (overData.type === 'project-root') {
          onAssignToFolder(activeData.conversation.id, workspace, null);
        }
        return;
      }

      // Existing pinned-list reorder.
      // Build pinned items list with sort orders
      const items = pinnedConversations.map((c) => ({
        id: c.id,
        sortOrder: getConversationSortOrder(c),
      }));
      const itemsWithOrder = assignInitialSortOrders(items);

      const oldIndex = itemsWithOrder.findIndex((i) => i.id === activeIdStr);
      const newIndex = itemsWithOrder.findIndex((i) => i.id === overIdStr);

      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(itemsWithOrder, oldIndex, newIndex);
      const before = newIndex > 0 ? reordered[newIndex - 1].sortOrder : undefined;
      const after = newIndex < reordered.length - 1 ? reordered[newIndex + 1].sortOrder : undefined;
      const newSortOrder = computeSortOrder(before, after);

      // Check if reindex needed
      if (needsReindex(reordered.map((i) => ({ sortOrder: i.id === activeIdStr ? newSortOrder : i.sortOrder })))) {
        const finalOrder = reordered.map((i) => ({
          id: i.id,
          sortOrder: i.id === activeIdStr ? newSortOrder : i.sortOrder,
        }));
        const reindexed = reindexSortOrders(finalOrder);
        await Promise.all(reindexed.map((item) => persistSortOrder(item.id, item.sortOrder)));
        emitter.emit('chat.history.refresh');
        return;
      }

      await persistSortOrder(activeIdStr, newSortOrder);
      emitter.emit('chat.history.refresh');
    },
    [pinnedConversations, persistSortOrder, onAssignToFolder]
  );

  return {
    sensors,
    handleDragEnd,
    isDragEnabled,
    collisionDetection: folderAwareCollisionDetection,
  };
};
