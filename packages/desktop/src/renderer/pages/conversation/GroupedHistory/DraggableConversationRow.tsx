/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Drag } from '@icon-park/react';
import React from 'react';
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
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({
    id: props.conversation.id,
    disabled: props.batchMode,
    data: {
      type: 'project-conversation',
      conversation: props.conversation,
    },
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
      className='conversation-drag-wrapper [&.conversation-drag-wrapper+&.conversation-drag-wrapper]:mt-2px'
      style={{
        transform: CSS.Transform.toString(transform),
        opacity: isDragging ? 0.56 : undefined,
        position: 'relative',
        zIndex: isDragging ? 1 : undefined,
      }}
    >
      <ConversationRow {...props} dragHandle={dragHandle} />
    </div>
  );
};

export default DraggableConversationRow;
