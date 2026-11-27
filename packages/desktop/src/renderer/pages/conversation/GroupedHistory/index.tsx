/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import AionModal from '@/renderer/components/base/AionModal';
import MobileActionSheet, { type MobileActionSheetEntry } from '@/renderer/components/chat/MobileActionSheet';
import { useConversationHistoryContext } from '@/renderer/hooks/context/ConversationHistoryContext';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { useCronJobsMap } from '@/renderer/pages/cron';
import { restrictToVerticalAxis } from '@/renderer/utils/ui/dndModifiers';
import { DndContext, DragOverlay, MeasuringStrategy, useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Button, Dropdown, Empty, Input, Menu, Message, Modal, Tooltip } from '@arco-design/web-react';
import { FolderClose, FolderOpen, FolderPlus, MoreOne, Plus, Right } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import WorkspaceCollapse from '../components/WorkspaceCollapse';
import ConversationRow from './ConversationRow';
import DraggableConversationRow from './DraggableConversationRow';
import FolderRow from './FolderRow';
import SortableConversationRow from './SortableConversationRow';
import { useBatchSelection } from './hooks/useBatchSelection';
import { useConversationActions } from './hooks/useConversationActions';
import { useConversations } from './hooks/useConversations';
import { useDragAndDrop } from './hooks/useDragAndDrop';
import type { ConversationRowProps, ResolvedConversationFolder, WorkspaceGroupedHistoryProps } from './types';
import { conversationFolderSectionKey, getMoveTargets, PROJECT_ROOT_MOVE_KEY } from './utils/conversationFolders';

type FolderModalState = {
  mode: 'create' | 'rename';
  workspace: string;
  groupId?: string;
  name: string;
};

/**
 * A per-project drop target rendered through a render-prop so the droppable ref
 * can be attached to the project's sticky header only (not its whole subtree).
 */
const ProjectDrop: React.FC<{
  workspace: string;
  children: (state: { setHeaderRef: (element: HTMLElement | null) => void; isOver: boolean }) => React.ReactNode;
}> = ({ workspace, children }) => {
  const dropData = useMemo(() => ({ type: 'project-root', workspace }), [workspace]);
  const { setNodeRef, isOver } = useDroppable({
    id: `project:${workspace}`,
    data: dropData,
  });
  return <>{children({ setHeaderRef: setNodeRef, isOver })}</>;
};

const WorkspaceGroupedHistory: React.FC<WorkspaceGroupedHistoryProps> = ({
  onSessionClick,
  collapsed = false,
  tooltipEnabled = false,
  batchMode = false,
  onBatchModeChange,
  afterPinnedContent,
}) => {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const { getJobStatus, markAsRead, setActiveConversation } = useCronJobsMap();
  const { conversationFolders } = useConversationHistoryContext();
  const { folders: folderCatalog, createFolder, renameFolder, deleteFolder, moveConversations } = conversationFolders;

  const [folderModal, setFolderModal] = useState<FolderModalState | null>(null);
  const [folderSaving, setFolderSaving] = useState(false);
  const [moveTarget, setMoveTarget] = useState<TChatConversation | null>(null);
  const [draggedConversation, setDraggedConversation] = useState<TChatConversation | null>(null);

  const {
    conversations,
    isConversationGenerating,
    isConversationWaitingConfirmation,
    hasCompletionUnread,
    isManualUnread,
    markManualUnread,
    clearManualUnread,
    expandedWorkspaces,
    pinnedConversations,
    timelineSections,
    handleToggleWorkspace,
    collapsedSections,
    toggleSection,
  } = useConversations();

  const SectionLabel = useCallback(
    ({ sectionKey, label, trailing }: { sectionKey: string; label: string; trailing?: React.ReactNode }) => {
      const isCollapsed = collapsedSections.has(sectionKey);
      return (
        <div
          className='group/label sider-section-label flex items-center px-12px h-28px select-none sticky top-0 z-10 mt-8px cursor-pointer'
          onClick={() => toggleSection(sectionKey)}
        >
          <span className='text-14px text-t-tertiary sider-section-title group-hover/label:text-t-primary transition-colors font-[500] leading-none'>
            {label}
          </span>
          <span className='ms-2px flex items-center justify-center opacity-0 group-hover/label:opacity-100 transition-opacity text-t-tertiary shrink-0'>
            <Right
              theme='outline'
              size={12}
              className={classNames('transition-transform duration-150', { 'rotate-90': !isCollapsed })}
            />
          </span>
          {trailing && (
            <div className='ms-auto' onClick={(e) => e.stopPropagation()}>
              {trailing}
            </div>
          )}
        </div>
      );
    },
    [collapsedSections, toggleSection]
  );

  // Sync active conversation ref when route changes (for URL navigation)
  // This doesn't trigger state update, avoiding double render
  useEffect(() => {
    if (id) {
      setActiveConversation(id);
    }
  }, [id, setActiveConversation]);

  const {
    selectedConversationIds,
    setSelectedConversationIds,
    selectedCount,
    allSelected,
    toggleSelectedConversation,
    handleToggleSelectAll,
  } = useBatchSelection(batchMode, conversations);

  const {
    renameModalVisible,
    renameModalName,
    setRenameModalName,
    renameLoading,
    dropdownVisibleId,
    handleConversationClick,
    handleArchive,
    handleBatchArchive,
    handleEditStart,
    handleRenameConfirm,
    handleRenameCancel,
    handleTogglePin,
    handleMenuVisibleChange,
    handleOpenMenu,
    handleToggleManualUnread,
    handleCreateCronTask,
    handleArchiveProject,
    archiveProjectTarget,
    archiveProjectLoading,
    handleArchiveProjectCancel,
    handleArchiveProjectConfirm,
  } = useConversationActions({
    batchMode,
    onSessionClick,
    onBatchModeChange,
    selectedConversationIds,
    setSelectedConversationIds,
    toggleSelectedConversation,
    markAsRead,
    markManualUnread,
    clearManualUnread,
    isManualUnread,
  });

  const handleAssignToFolder = useCallback(
    (conversationId: string, workspace: string, groupId: string | null) => {
      void moveConversations([conversationId], groupId);
    },
    [moveConversations]
  );

  const { sensors, handleDragEnd, isDragEnabled, collisionDetection } = useDragAndDrop({
    pinnedConversations,
    batchMode,
    collapsed,
    onAssignToFolder: handleAssignToFolder,
  });

  // Folder dragging only makes sense once a folder exists. Gating on the
  // catalog keeps the panel pixel-identical (no drag handle, no wrapper) when
  // the catalog key is absent — the acceptance criterion for the bucketing commit.
  const isFolderDragEnabled = isDragEnabled && folderCatalog.length > 0;

  // Fork-lineage badge support: resolve a parent conversation's display name
  // from the already-loaded sidebar list (no extra fetch; unresolved = the
  // parent was deleted or not loaded → the badge falls back to a generic tip).
  const conversationNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const conversation of conversations) {
      map.set(conversation.id, conversation.name);
    }
    return map;
  }, [conversations]);
  const resolveConversationName = useCallback(
    (conversationId: string) => conversationNameById.get(conversationId),
    [conversationNameById]
  );

  const handleOpenMoveToFolder = useCallback(
    (conversation: TChatConversation) => {
      handleMenuVisibleChange(conversation.id, false);
      setMoveTarget(conversation);
    },
    [handleMenuVisibleChange]
  );

  /**
   * Desktop row-menu move: the submenu entry already names the destination, so no
   * sheet state is involved. `Dropdown` closes the menu on item activation (the
   * handler returns nothing, and Arco then calls `onVisibleChange(false)`), which
   * clears `menuVisible` and restores hover-only visibility of the `⋮`.
   * `moveConversations` is the same platform-neutral write the sheet and the drag
   * path use (sequential `PATCH …/conversations/<id>` — never parallelized).
   */
  const handleMoveToGroup = useCallback(
    (conversation: TChatConversation, group_id: string | null) => {
      void moveConversations([conversation.id], group_id);
    },
    [moveConversations]
  );

  const getConversationRowProps = useCallback(
    (conversation: TChatConversation, indentLevel: 0 | 1 | 2 = 0): ConversationRowProps => ({
      conversation,
      isGenerating: isConversationGenerating(conversation.id),
      isWaitingConfirmation: isConversationWaitingConfirmation(conversation.id),
      hasUnread: hasCompletionUnread(conversation.id) || isManualUnread(conversation.id),
      isManualUnread: isManualUnread(conversation.id),
      collapsed,
      tooltipEnabled,
      batchMode,
      checked: selectedConversationIds.has(conversation.id),
      selected: id === conversation.id,
      menuVisible: dropdownVisibleId !== null && dropdownVisibleId === conversation.id,
      onToggleChecked: toggleSelectedConversation,
      onConversationClick: handleConversationClick,
      onOpenMenu: handleOpenMenu,
      onMenuVisibleChange: handleMenuVisibleChange,
      onEditStart: handleEditStart,
      onCreateCronTask: handleCreateCronTask,
      onArchive: handleArchive,
      onTogglePin: handleTogglePin,
      onToggleManualUnread: handleToggleManualUnread,
      onMoveToFolder: indentLevel > 0 ? handleOpenMoveToFolder : undefined,
      // Same destination list for both move surfaces: the desktop row menu renders
      // it as a submenu, the mobile sheet as entries. Flat "Conversations" rows
      // (indentLevel 0, no workspace) get neither — there is nothing to move into.
      moveTargets:
        indentLevel > 0
          ? getMoveTargets(conversation, folderCatalog, t('conversation.history.projectRoot'))
          : undefined,
      onMoveToGroup: indentLevel > 0 ? handleMoveToGroup : undefined,
      getJobStatus,
      resolveConversationName,
      dimIcon: indentLevel > 0,
      indentLevel,
    }),
    [
      collapsed,
      tooltipEnabled,
      batchMode,
      isConversationGenerating,
      isConversationWaitingConfirmation,
      hasCompletionUnread,
      isManualUnread,
      selectedConversationIds,
      id,
      dropdownVisibleId,
      toggleSelectedConversation,
      handleConversationClick,
      handleOpenMenu,
      handleMenuVisibleChange,
      handleEditStart,
      handleCreateCronTask,
      handleArchive,
      handleTogglePin,
      handleToggleManualUnread,
      handleOpenMoveToFolder,
      handleMoveToGroup,
      folderCatalog,
      t,
      getJobStatus,
      resolveConversationName,
    ]
  );

  const renderConversation = (conversation: TChatConversation, indentLevel: 0 | 1 | 2 = 0) => {
    const rowProps = getConversationRowProps(conversation, indentLevel);
    if (indentLevel > 0 && isFolderDragEnabled) {
      return <DraggableConversationRow key={conversation.id} {...rowProps} />;
    }
    return <ConversationRow key={conversation.id} {...rowProps} />;
  };

  // Collect all sortable IDs for the pinned section
  const pinnedIds = useMemo(() => pinnedConversations.map((c) => c.id), [pinnedConversations]);

  // Codex-style split: project folders (workspaces) on top, free conversations below.
  // Projects section: collect all workspace groups across timeline sections, ordered by recency.
  const projectGroups = useMemo(() => {
    const seen = new Set<string>();
    const groups: Array<{
      workspace: string;
      displayName: string;
      conversations: TChatConversation[];
      rootConversations: TChatConversation[];
      folders: ResolvedConversationFolder[];
    }> = [];
    for (const section of timelineSections) {
      for (const item of section.items) {
        if (item.type === 'workspace' && item.workspaceGroup && !seen.has(item.workspaceGroup.workspace)) {
          seen.add(item.workspaceGroup.workspace);
          groups.push({
            workspace: item.workspaceGroup.workspace,
            displayName: item.workspaceGroup.display_name,
            conversations: item.workspaceGroup.conversations,
            rootConversations: item.workspaceGroup.rootConversations,
            folders: item.workspaceGroup.folders,
          });
        }
      }
    }
    return groups;
  }, [timelineSections]);

  // Conversations section: keep timeline grouping (today/yesterday/...) but only show non-workspace conversations.
  const conversationOnlySections = useMemo(
    () =>
      timelineSections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => item.type === 'conversation' && item.conversation),
        }))
        .filter((section) => section.items.length > 0),
    [timelineSections]
  );

  // ---- Folder actions -------------------------------------------------------

  const handleOpenCreateFolder = useCallback((workspace: string) => {
    setFolderModal({ mode: 'create', workspace, name: '' });
  }, []);

  const handleOpenRenameFolder = useCallback((folder: ResolvedConversationFolder) => {
    setFolderModal({ mode: 'rename', workspace: folder.workspace, groupId: folder.group_id, name: folder.name });
  }, []);

  const handleOpenDeleteFolder = useCallback(
    (folder: ResolvedConversationFolder) => {
      Modal.confirm({
        title: t('conversation.history.deleteFolderTitle'),
        content: t('conversation.history.deleteFolderConfirm', {
          name: folder.name,
          count: folder.conversations.length,
        }),
        okText: t('common.delete'),
        cancelText: t('common.cancel'),
        okButtonProps: { status: 'danger' },
        onOk: async () => {
          const ok = await deleteFolder(folder.group_id);
          if (ok) Message.success(t('conversation.history.folderDeleted'));
          else Message.error(t('conversation.history.folderDeleteFailed'));
        },
      });
    },
    [deleteFolder, t]
  );

  const handleFolderModalConfirm = useCallback(async () => {
    if (!folderModal) return;
    const name = folderModal.name.trim();
    if (!name) return;
    setFolderSaving(true);
    try {
      if (folderModal.mode === 'create') {
        const created = await createFolder(folderModal.workspace, name);
        if (created) {
          Message.success(t('conversation.history.folderCreated'));
          setFolderModal(null);
        } else {
          Message.error(t('conversation.history.folderCreateFailed'));
        }
      } else if (folderModal.groupId) {
        const ok = await renameFolder(folderModal.groupId, name);
        if (ok) {
          Message.success(t('conversation.history.folderRenamed'));
          setFolderModal(null);
        } else {
          Message.error(t('conversation.history.folderRenameFailed'));
        }
      }
    } finally {
      setFolderSaving(false);
    }
  }, [folderModal, createFolder, renameFolder, t]);

  const renderFolder = (folder: ResolvedConversationFolder, depth = 0): React.ReactNode => {
    const sectionKey = conversationFolderSectionKey(folder.group_id);
    const expanded = !collapsedSections.has(sectionKey);
    return (
      <FolderRow
        key={folder.group_id}
        folder={folder}
        depth={depth}
        expanded={expanded}
        siderCollapsed={collapsed}
        isMobile={isMobile}
        onToggle={() => toggleSection(sectionKey)}
        onRename={handleOpenRenameFolder}
        onDelete={handleOpenDeleteFolder}
      >
        {folder.conversations.map((conversation) => renderConversation(conversation, 2))}
        {folder.children.map((child) => renderFolder(child, depth + 1))}
      </FolderRow>
    );
  };

  // Mobile "Move to folder" action sheet: the shared destination list (project
  // root first, then the conversation workspace's folders, current location
  // disabled) rendered as sheet entries. The desktop row menu consumes the very
  // same list from `getMoveTargets`, so the two surfaces can never disagree about
  // membership or about which entry is a no-op.
  const moveSheetEntries = useMemo<MobileActionSheetEntry[]>(() => {
    const target = moveTarget;
    if (!target) return [];
    return getMoveTargets(target, folderCatalog, t('conversation.history.projectRoot')).map(
      ({ groupId, label, isCurrent }): MobileActionSheetEntry => ({
        key: groupId ?? PROJECT_ROOT_MOVE_KEY,
        icon: groupId === null ? <FolderClose theme='outline' size={16} /> : <FolderOpen theme='outline' size={16} />,
        label,
        variant: 'muted',
        disabled: isCurrent,
        onClick: () => {
          void moveConversations([target.id], groupId);
          setMoveTarget(null);
        },
      })
    );
  }, [moveTarget, folderCatalog, moveConversations, t]);

  if (timelineSections.length === 0 && pinnedConversations.length === 0) {
    return (
      <>
        {afterPinnedContent}
        <div className='py-48px flex-center'>
          <Empty description={t('conversation.history.noHistory')} />
        </div>
      </>
    );
  }

  return (
    <>
      <Modal
        title={t('conversation.history.renameTitle')}
        visible={renameModalVisible}
        onOk={handleRenameConfirm}
        onCancel={handleRenameCancel}
        okText={t('conversation.history.saveName')}
        cancelText={t('conversation.history.cancelEdit')}
        confirmLoading={renameLoading}
        okButtonProps={{ disabled: !renameModalName.trim() }}
        style={{ borderRadius: '12px' }}
        alignCenter
        getPopupContainer={() => document.body}
      >
        <Input
          autoFocus
          value={renameModalName}
          onChange={setRenameModalName}
          onPressEnter={handleRenameConfirm}
          placeholder={t('conversation.history.renamePlaceholder')}
          allowClear
        />
      </Modal>

      {/* Folder create / rename modal. Rendered only while open so closing cannot
          re-render it with the other mode's labels during the exit transition. */}
      {folderModal !== null && (
      <AionModal
        visible
        style={{ width: '400px' }}
        header={{
          title:
            folderModal?.mode === 'create'
              ? t('conversation.history.newFolder')
              : t('conversation.history.renameFolderTitle'),
          showClose: true,
          style: { borderBottom: 'none' },
        }}
        onCancel={() => {
          if (!folderSaving) setFolderModal(null);
        }}
        footer={
          <div className='flex justify-end gap-12px pt-16px'>
            <button
              type='button'
              className='px-24px py-8px rounded-20px text-14px font-medium transition-all'
              style={{
                border: '1px solid var(--color-border-2)',
                backgroundColor: 'var(--color-fill-2)',
                color: 'var(--color-text-1)',
                cursor: folderSaving ? 'not-allowed' : 'pointer',
                opacity: folderSaving ? 0.55 : 1,
              }}
              onClick={() => setFolderModal(null)}
              disabled={folderSaving}
            >
              {t('common.cancel')}
            </button>
            <button
              type='button'
              className='px-24px py-8px rounded-20px text-14px font-medium transition-all'
              style={{
                border: '1px solid rgb(var(--primary-6))',
                backgroundColor: 'transparent',
                color: 'rgb(var(--primary-6))',
                cursor: folderSaving || !folderModal?.name.trim() ? 'not-allowed' : 'pointer',
                opacity: folderSaving || !folderModal?.name.trim() ? 0.55 : 1,
              }}
              onClick={() => void handleFolderModalConfirm()}
              disabled={folderSaving || !folderModal?.name.trim()}
            >
              {folderModal?.mode === 'create' ? t('common.create') : t('common.save')}
            </button>
          </div>
        }
      >
        <Input
          autoFocus
          value={folderModal?.name ?? ''}
          onChange={(value) => setFolderModal((prev) => (prev ? { ...prev, name: value } : prev))}
          onPressEnter={() => void handleFolderModalConfirm()}
          placeholder={t('conversation.history.folderNamePlaceholder')}
          allowClear
        />
      </AionModal>
      )}

      {batchMode && !collapsed && (
        <div className='px-12px pb-8px pt-2px sticky top-0 z-20 bg-[var(--bg-2)]'>
          <div className='rd-8px bg-fill-1 p-10px flex flex-col gap-8px border border-solid border-[rgba(var(--primary-6),0.08)]'>
            <div className='text-12px leading-18px text-t-secondary'>
              {t('conversation.history.selectedCount', { count: selectedCount })}
            </div>
            <div className='grid grid-cols-2 gap-6px'>
              <Button
                className='!w-full !justify-center !min-w-0 !h-30px !px-8px !text-12px whitespace-nowrap'
                size='mini'
                type='secondary'
                onClick={handleToggleSelectAll}
              >
                {allSelected ? t('common.cancel') : t('conversation.history.selectAll')}
              </Button>
              <Button
                className='!w-full !justify-center !min-w-0 !h-30px !px-8px !text-12px whitespace-nowrap'
                size='mini'
                type='primary'
                onClick={handleBatchArchive}
              >
                {t('conversation.history.batchArchive')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 归档项目确认弹窗 — 使用项目自家 AionModal + 圆角线框按钮（归档为非危险态，用主色） */}
      <AionModal
        visible={archiveProjectTarget !== null}
        style={{ width: '400px' }}
        header={{
          title: t('conversation.history.archiveProjectTitle'),
          showClose: true,
          style: { borderBottom: 'none' },
        }}
        onCancel={handleArchiveProjectCancel}
        footer={
          <div className='flex justify-end gap-12px pt-16px'>
            <button
              type='button'
              className='px-24px py-8px rounded-20px text-14px font-medium transition-all'
              style={{
                border: '1px solid var(--color-border-2)',
                backgroundColor: 'var(--color-fill-2)',
                color: 'var(--color-text-1)',
                cursor: archiveProjectLoading ? 'not-allowed' : 'pointer',
                opacity: archiveProjectLoading ? 0.55 : 1,
              }}
              onMouseEnter={(event) => {
                if (!archiveProjectLoading) event.currentTarget.style.backgroundColor = 'var(--color-fill-3)';
              }}
              onMouseLeave={(event) => {
                if (!archiveProjectLoading) event.currentTarget.style.backgroundColor = 'var(--color-fill-2)';
              }}
              onClick={handleArchiveProjectCancel}
              disabled={archiveProjectLoading}
            >
              {t('common.cancel')}
            </button>
            <button
              type='button'
              className='px-24px py-8px rounded-20px text-14px font-medium transition-all'
              style={{
                border: '1px solid rgb(var(--primary-6))',
                backgroundColor: 'transparent',
                color: 'rgb(var(--primary-6))',
                cursor: archiveProjectLoading ? 'not-allowed' : 'pointer',
                opacity: archiveProjectLoading ? 0.55 : 1,
              }}
              onMouseEnter={(event) => {
                if (!archiveProjectLoading) {
                  event.currentTarget.style.backgroundColor = 'rgba(var(--primary-6), 0.08)';
                }
              }}
              onMouseLeave={(event) => {
                if (!archiveProjectLoading) event.currentTarget.style.backgroundColor = 'transparent';
              }}
              onClick={() => void handleArchiveProjectConfirm()}
              disabled={archiveProjectLoading}
            >
              {archiveProjectLoading ? t('conversation.history.archiving') : t('conversation.history.archiveProject')}
            </button>
          </div>
        }
      >
        <div className='text-14px leading-22px text-t-secondary'>
          {t('conversation.history.archiveProjectConfirm', {
            name: archiveProjectTarget?.name ?? '',
            count: archiveProjectTarget?.conversations.length ?? 0,
          })}
        </div>
      </AionModal>

      {/* Mobile-only by design: the sheet's `.sheet` CSS is a full-bleed bottom
          sheet with no max-width, which is not a desktop idiom. Desktop moves go
          through the row-menu submenu (`moveTargets` + `onMoveToGroup`), so
          `moveTarget` is only ever set from the mobile menu item. */}
      {isMobile && (
        <MobileActionSheet
          open={moveTarget !== null}
          onClose={() => setMoveTarget(null)}
          title={t('conversation.history.moveToFolderTitle')}
          entries={moveSheetEntries}
        />
      )}

      <div>
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          modifiers={[restrictToVerticalAxis]}
          onDragStart={({ active }) => {
            const data = active.data.current as { type?: string; conversation?: TChatConversation } | undefined;
            setDraggedConversation(data?.type === 'project-conversation' ? (data.conversation ?? null) : null);
          }}
          onDragEnd={(event) => {
            setDraggedConversation(null);
            void handleDragEnd(event);
          }}
          onDragCancel={() => setDraggedConversation(null)}
          // Droppable rects go stale while the sidebar auto-scrolls during a long
          // drag (e.g. a folder with many chats). Re-measure before every
          // collision check so pointerWithin targets what is actually under the
          // pointer, not where the folder was when the drag started.
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        >
          {/* L1: Pinned section */}
          {pinnedConversations.length > 0 && (
            <div className='min-w-0'>
              {!collapsed && <SectionLabel sectionKey='pinned' label={t('conversation.history.pinnedSection')} />}
              {!collapsedSections.has('pinned') && (
                <SortableContext items={pinnedIds} strategy={verticalListSortingStrategy}>
                  <div className='min-w-0'>
                    {pinnedConversations.map((conversation) => {
                      const props = getConversationRowProps(conversation);
                      return isDragEnabled ? (
                        <SortableConversationRow key={conversation.id} {...props} />
                      ) : (
                        <ConversationRow key={conversation.id} {...props} />
                      );
                    })}
                  </div>
                </SortableContext>
              )}
            </div>
          )}

          {/* Slot 由父级（Sider）填入：例如 Team / CronJob sections，位于「置顶」之后、「项目」之前 */}
          {afterPinnedContent}

          {/* L1: Projects section — workspace folders, peer to conversations */}
          {projectGroups.length > 0 && (
            <div className='min-w-0'>
              {!collapsed && <SectionLabel sectionKey='projects' label={t('conversation.history.projectsSection')} />}
              {!collapsedSections.has('projects') &&
                projectGroups.map((group) => {
                  const projectMenu = (
                    <Menu
                      onClickMenuItem={(key) => {
                        if (key === 'newFolder') {
                          handleOpenCreateFolder(group.workspace);
                        } else if (key === 'archive') {
                          handleArchiveProject(group.displayName, group.conversations);
                        }
                      }}
                    >
                      <Menu.Item key='newFolder'>
                        <span className='flex items-center gap-8px'>
                          <FolderPlus theme='outline' size='14' />
                          {t('conversation.history.newFolder')}
                        </span>
                      </Menu.Item>
                      <Menu.Item key='archive'>
                        <span className='flex items-center gap-8px'>
                          <FolderClose theme='outline' size='14' />
                          {t('conversation.history.archiveProject')}
                        </span>
                      </Menu.Item>
                    </Menu>
                  );
                  return (
                    <ProjectDrop key={group.workspace} workspace={group.workspace}>
                      {({ setHeaderRef, isOver }) => (
                        <div className='min-w-0'>
                          <WorkspaceCollapse
                            expanded={expandedWorkspaces.includes(group.workspace)}
                            onToggle={() => handleToggleWorkspace(group.workspace)}
                            siderCollapsed={collapsed}
                            stickyHeader
                            stickyTop={28}
                            headerRef={setHeaderRef}
                            dropActive={isOver}
                            header={
                              <span className='text-14px font-[500] truncate flex-1 text-t-primary min-w-0'>
                                {group.displayName}
                              </span>
                            }
                            trailing={
                              <span className='flex items-center gap-6px'>
                                <Tooltip content={t('conversation.history.newConversationInProject')} position='top'>
                                  <span
                                    role='button'
                                    tabIndex={0}
                                    aria-label={t('conversation.history.newConversationInProject')}
                                    className={classNames(
                                      'flex-center cursor-pointer transition-colors text-t-secondary hover:text-t-primary size-20px rd-4px sider-action-btn',
                                      isMobile ? 'flex' : 'hidden group-hover:flex'
                                    )}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void navigate('/guid', { state: { workspace: group.workspace } });
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        void navigate('/guid', { state: { workspace: group.workspace } });
                                      }
                                    }}
                                  >
                                    <Plus theme='outline' size='14' fill='currentColor' className='block leading-none' />
                                  </span>
                                </Tooltip>
                                <Dropdown
                                  droplist={projectMenu}
                                  trigger='click'
                                  position='br'
                                  getPopupContainer={() => document.body}
                                  unmountOnExit={false}
                                >
                                  <span
                                    role='button'
                                    tabIndex={0}
                                    aria-label='Project actions'
                                    className={classNames(
                                      'flex-center cursor-pointer transition-colors text-t-secondary hover:text-t-primary size-20px rd-4px sider-action-btn',
                                      isMobile ? 'flex' : 'hidden group-hover:flex'
                                    )}
                                    onClick={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        e.currentTarget.click();
                                      }
                                    }}
                                  >
                                    <MoreOne theme='outline' size='14' fill='currentColor' className='block leading-none' />
                                  </span>
                                </Dropdown>
                              </span>
                            }
                          >
                            <div className={classNames('flex flex-col min-w-0', { 'mt-1px': !collapsed })}>
                              {group.folders.map((folder) => renderFolder(folder))}
                              {group.rootConversations.map((conversation) => renderConversation(conversation, 1))}
                            </div>
                          </WorkspaceCollapse>
                        </div>
                      )}
                    </ProjectDrop>
                  );
                })}
            </div>
          )}

          {/* L1: Conversations section — peer to projects, internally split by timeline */}
          {conversationOnlySections.length > 0 && (
            <div className='min-w-0'>
              {!collapsed && (
                <SectionLabel sectionKey='conversations' label={t('conversation.history.conversationsSection')} />
              )}
              {!collapsedSections.has('conversations') &&
                conversationOnlySections.map((section) => (
                  <div key={section.timeline} className='min-w-0'>
                    {!collapsed && conversationOnlySections.length > 1 && (
                      <div className='flex items-center px-16px h-24px select-none'>
                        <span className='text-12px text-t-secondary font-[500] leading-none'>{section.timeline}</span>
                      </div>
                    )}
                    {section.items.map((item) =>
                      item.type === 'conversation' && item.conversation ? renderConversation(item.conversation) : null
                    )}
                  </div>
                ))}
            </div>
          )}
          <DragOverlay dropAnimation={null}>
            {draggedConversation && (
              <div
                className='flex items-center gap-8px h-34px px-10px rd-8px min-w-0 select-none pointer-events-none'
                style={{
                  width: 244,
                  backgroundColor: 'var(--bg-2)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
                  border: '1px solid var(--color-border-2)',
                }}
              >
                <span className='shrink-0 text-t-secondary line-height-0'>
                  <FolderOpen theme='outline' size={16} />
                </span>
                <span className='truncate min-w-0 text-14px font-[500] text-t-primary'>
                  {draggedConversation.name}
                </span>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>
    </>
  );
};

export default WorkspaceGroupedHistory;
