/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useDraggable } from '@dnd-kit/core';
import { Drag } from '@icon-park/react';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import ConversationRow from './ConversationRow';
import type { ConversationRowProps } from './types';

/**
 * A project-group conversation row that can be dragged onto a folder (or back
 * onto the project header to leave a folder).
 *
 * Only the hover-revealed leading handle is an activator, so clicking the row
 * keeps its normal meaning — the same affordance pattern as
 * `SortableConversationRow`.
 */
const DraggableConversationRow: React.FC<ConversationRowProps> = (props) => {
  const { t } = useTranslation();
  const dragData = useMemo(
    () => ({ type: 'project-conversation', conversation: props.conversation }),
    [props.conversation]
  );
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: props.conversation.id,
    disabled: props.batchMode,
    data: dragData,
  });

  const dragHandle = (
    <span
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      role='button'
      aria-label={t('conversation.history.dragToFolder')}
      data-testid={`conversation-folder-drag-handle-${props.conversation.id}`}
      className={`absolute inset-0 flex-center text-t-secondary transition-opacity ${
        isDragging ? 'opacity-100 cursor-grabbing' : 'opacity-0 group-hover:opacity-100 cursor-grab'
      }`}
      style={{ lineHeight: 0, background: 'var(--color-fill-3)', borderRadius: 4, touchAction: 'none' }}
      onClick={(event) => event.stopPropagation()}
    >
      <Drag theme='outline' size='13' fill='currentColor' />
    </span>
  );

  return (
    <div
      ref={setNodeRef}
      className='conversation-drag-wrapper select-none [&.conversation-drag-wrapper+&.conversation-drag-wrapper]:mt-2px'
      onDragStart={(event) => event.preventDefault()}
      style={{
        // With a DragOverlay the source stays in the list. Hide its contents
        // during the drag so it cannot double-expose text beneath the overlay.
        opacity: isDragging ? 0 : undefined,
      }}
    >
      <ConversationRow {...props} dragHandle={dragHandle} />
    </div>
  );
};

export default DraggableConversationRow;
