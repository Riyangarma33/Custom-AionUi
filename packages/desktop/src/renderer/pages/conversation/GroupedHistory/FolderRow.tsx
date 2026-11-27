/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useDroppable } from '@dnd-kit/core';
import { Dropdown, Menu } from '@arco-design/web-react';
import { Delete, EditOne, FolderClose, FolderOpen, MoreOne } from '@icon-park/react';
import classNames from 'classnames';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { ResolvedConversationFolder } from './types';

type FolderRowProps = {
  folder: ResolvedConversationFolder;
  /** Nesting depth used purely for indentation; capped by the resolver. */
  depth?: number;
  expanded: boolean;
  /** Sidebar collapsed (icon rail): hide the header, keep members rendered. */
  siderCollapsed: boolean;
  isMobile: boolean;
  onToggle: () => void;
  onRename: (folder: ResolvedConversationFolder) => void;
  onDelete: (folder: ResolvedConversationFolder) => void;
  children?: React.ReactNode;
};

/**
 * A conversation-folder row beneath a project group (Phase 3.12, Track A).
 *
 * It is a drop target for chats dragged out of / within the project. Mounting a
 * droppable even when drag is disabled is harmless — no draggables exist in that
 * case.
 */
const FolderRow: React.FC<FolderRowProps> = ({
  folder,
  depth = 0,
  expanded,
  siderCollapsed,
  isMobile,
  onToggle,
  onRename,
  onDelete,
  children,
}) => {
  const { t } = useTranslation();
  // Stable identity: an inline `data` object would make dnd-kit tear down and
  // re-register the droppable on every render (each `isOver` flip), which drops
  // the cached rect for a frame and can lose the drop exactly over long folders.
  const dropData = useMemo(
    () => ({ type: 'folder', groupId: folder.group_id, workspace: folder.workspace }),
    [folder.group_id, folder.workspace]
  );
  const { setNodeRef, isOver } = useDroppable({
    id: `folder:${folder.group_id}`,
    data: dropData,
  });

  if (siderCollapsed) {
    // Collapsed sidebar: no room for a folder header, show its chats inline.
    return <div className='min-w-0'>{children}</div>;
  }

  const indentClass = depth <= 0 ? 'ps-24px' : 'ps-44px';

  const menu = (
    <Menu
      onClickMenuItem={(key, event) => {
        // Phase 3.12e P1: Arco portals the droplist to document.body, but React
        // synthetic events bubble through the COMPONENT tree — so a menu-item click
        // otherwise reaches the header div's onClick and toggles collapse (a rename
        // made an expanded folder's chats "vanish"). Halting here keeps the trigger
        // span's guard symmetric for the items. Closing is unaffected: Dropdown
        // clones this Menu and calls its own close logic after this handler.
        // Same pattern as ExplorerPanel's context menu (which documents why the
        // halt lives here rather than on a wrapper div around <Menu>).
        event?.stopPropagation?.();
        if (key === 'rename') onRename(folder);
        else if (key === 'delete') onDelete(folder);
      }}
    >
      <Menu.Item key='rename'>
        <span className='flex items-center gap-8px'>
          <EditOne theme='outline' size='14' />
          {t('conversation.history.renameFolder')}
        </span>
      </Menu.Item>
      <Menu.Item key='delete'>
        <span className='flex items-center gap-8px'>
          <Delete theme='outline' size='14' />
          {t('conversation.history.deleteFolder')}
        </span>
      </Menu.Item>
    </Menu>
  );

  return (
    <div
      ref={setNodeRef}
      className={classNames(
        'min-w-0 rd-8px transition-colors',
        // Highlight the WHOLE folder while a chat is dragged over it. The header
        // alone is often scrolled out of view inside a long folder, so the old
        // header-only highlight gave no feedback where the pointer actually was.
        isOver && 'bg-[rgba(var(--primary-6),0.08)] outline outline-1 outline-dashed outline-[rgb(var(--primary-6))]'
      )}
    >
      <div
        role='button'
        tabIndex={0}
        aria-label={folder.name}
        data-testid={`conversation-folder-row-${folder.group_id}`}
        className={classNames(
          'flex items-center gap-6px h-34px pe-8px cursor-pointer hover:bg-fill-3 rd-8px transition-colors min-w-0 group/folder',
          indentClass
        )}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onToggle();
          }
        }}
      >
        <span className='size-18px flex items-center justify-center shrink-0 text-t-tertiary'>
          {expanded ? (
            <FolderOpen theme='outline' size={14} fill='currentColor' className='line-height-0' />
          ) : (
            <FolderClose theme='outline' size={14} fill='currentColor' className='line-height-0' />
          )}
        </span>
        <span className='flex-1 min-w-0 truncate text-13px text-t-secondary' title={folder.name}>
          {folder.name}
        </span>
        <span className='shrink-0 text-11px leading-none text-t-tertiary tabular-nums'>
          {folder.conversations.length}
        </span>
        <Dropdown
          droplist={menu}
          trigger='click'
          position='br'
          getPopupContainer={() => document.body}
          unmountOnExit={false}
        >
          <span
            role='button'
            tabIndex={0}
            aria-label={t('conversation.history.folderActions')}
            className={classNames(
              'flex-center size-18px cursor-pointer transition-colors text-t-secondary hover:text-t-primary rd-4px sider-action-btn',
              isMobile ? 'flex' : 'hidden group-hover/folder:flex'
            )}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <MoreOne theme='outline' size={13} fill='currentColor' className='block leading-none' />
          </span>
        </Dropdown>
      </div>
      {expanded && <div className='min-w-0'>{children}</div>}
    </div>
  );
};

export default FolderRow;
