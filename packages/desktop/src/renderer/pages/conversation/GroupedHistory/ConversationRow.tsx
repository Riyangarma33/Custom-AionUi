/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useAgentLogos } from '@/renderer/utils/model/agentLogo';
import ThemedLogo from '@/renderer/components/agent/ThemedLogo';
import FlexFullContainer from '@/renderer/components/layout/FlexFullContainer';
import { usePresetAssistantInfo } from '@/renderer/hooks/agent/usePresetAssistantInfo';
import { CronJobIndicator } from '@/renderer/pages/cron';
import { resolveConversationLeadingMark } from '@/renderer/pages/conversation/utils/conversationAssistantIdentity';
import { cleanupSiderTooltips, getSiderTooltipProps } from '@/renderer/utils/ui/siderTooltip';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { Checkbox, Dropdown, Menu, Spin, Tooltip } from '@arco-design/web-react';
import {
  Attention,
  EditOne,
  Export,
  FolderClose,
  FolderOpen,
  Inbox,
  MessageOne,
  MoreOne,
  Pushpin,
  Robot,
  Timer,
} from '@icon-park/react';
import ForkBranchIcon from '@renderer/components/base/ForkBranchIcon';
import classNames from 'classnames';
import React from 'react';
import { useTranslation } from 'react-i18next';

import type { ConversationRowProps } from './types';
import { MOVE_TO_FOLDER_MENU_KEY, moveToGroupMenuKey, parseMoveToGroupMenuKey } from './utils/conversationFolders';
import { isConversationPinned } from './utils/groupingHelpers';

const ConversationRow: React.FC<ConversationRowProps> = (props) => {
  const {
    conversation,
    isGenerating,
    isWaitingConfirmation,
    hasUnread,
    collapsed,
    tooltipEnabled,
    batchMode,
    checked,
    selected,
    menuVisible,
    dimIcon = false,
    indentLevel = 0,
    dragHandle,
    moveTargets,
  } = props;
  const logos = useAgentLogos();
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const {
    onToggleChecked,
    onConversationClick,
    onOpenMenu,
    onMenuVisibleChange,
    onEditStart,
    onCreateCronTask,
    onArchive,
    onExport,
    onTogglePin,
    onToggleManualUnread,
    onMoveToFolder,
    onMoveToGroup,
    isManualUnread,
    getJobStatus,
  } = props;
  const { t } = useTranslation();
  const { info: assistantInfo } = usePresetAssistantInfo(conversation);
  const isPinned = isConversationPinned(conversation);
  // Fork-lineage badge: present only on forked conversations (extra.fork is
  // server-minted by the fork API). Parent name resolves from the loaded
  // sidebar list; a deleted/unloaded parent degrades to the generic tip.
  const forkLineage = (conversation.extra as { fork?: { parent_conversation_id?: string } } | undefined)?.fork;
  const forkParentName = forkLineage?.parent_conversation_id
    ? props.resolveConversationName?.(forkLineage.parent_conversation_id)
    : undefined;
  const cronStatus = getJobStatus(conversation.id);
  const siderTooltipProps = getSiderTooltipProps(tooltipEnabled);
  const inlineNameTooltipEnabled = !collapsed && !isMobile && !!conversation.name;
  // Desktop "Move to folder" submenu. Only worth rendering when the workspace
  // actually has a folder: with zero folders the sole entry would be a disabled
  // "Project root", which is noise rather than an affordance.
  const desktopMoveTargets = moveTargets ?? [];
  const canMoveToFolder = desktopMoveTargets.some((target) => target.groupId !== null);

  const renderLeadingIcon = () => {
    if (cronStatus !== 'none') {
      return <CronJobIndicator status={cronStatus} size={16} className='flex-shrink-0' />;
    }

    // When the row is pinned or a drag handle is supplied (project-group rows),
    // hovering reveals an overlay on the leading icon. We dim the resting icon on
    // hover so the overlay reads cleanly.
    const pinnedHoverFade = isPinned || dragHandle ? 'group-hover:opacity-0 transition-opacity' : '';
    const composedClass = classNames(pinnedHoverFade);

    const leadingMark = resolveConversationLeadingMark(conversation, assistantInfo, logos);
    if (leadingMark.kind === 'emoji') {
      return (
        <span className={classNames('text-16px leading-none flex-shrink-0', composedClass)}>{leadingMark.value}</span>
      );
    }
    if (leadingMark.kind === 'image') {
      return (
        <ThemedLogo
          src={leadingMark.value}
          alt={leadingMark.label}
          className={classNames('w-16px h-16px rounded-50% flex-shrink-0', composedClass)}
        />
      );
    }
    if (leadingMark.kind === 'assistant_fallback') {
      return (
        <Robot
          theme='outline'
          size='16'
          className={classNames('line-height-0 flex-shrink-0 text-t-secondary', composedClass)}
        />
      );
    }

    return (
      <MessageOne
        theme='outline'
        size='16'
        className={classNames('line-height-0 flex-shrink-0 text-t-secondary', composedClass)}
      />
    );
  };

  const handleRowClick = () => {
    cleanupSiderTooltips();
    if (batchMode) {
      onToggleChecked(conversation);
      return;
    }
    onConversationClick(conversation);
  };

  const handleRowContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    cleanupSiderTooltips();
    if (batchMode) {
      return;
    }
    onOpenMenu(conversation);
  };

  // Waiting on the user takes visual precedence over the generating spinner: a
  // paused turn still streams frames that mark it "generating", so without this
  // the distinct icon would never win.
  const showWaitingConfirmation = isWaitingConfirmation && !batchMode;

  const renderCompletionUnreadDot = () => {
    if (batchMode || !hasUnread || isGenerating || isWaitingConfirmation) {
      return null;
    }

    return (
      <span className='absolute end-8px top-1/2 -translate-y-1/2 flex items-center justify-center group-hover:hidden'>
        <span className='h-8px w-8px rounded-full bg-#2C7FFF shadow-[0_0_0_2px_rgba(44,127,255,0.18)]' />
      </span>
    );
  };

  return (
    <Tooltip
      key={conversation.id}
      {...siderTooltipProps}
      content={conversation.name || t('conversation.welcome.newConversation')}
      position='right'
    >
      <div
        id={'c-' + conversation.id}
        role='button'
        tabIndex={0}
        aria-label={conversation.name}
        className={classNames(
          'chat-history__item h-34px rd-8px flex items-center group cursor-pointer relative overflow-hidden shrink-0 conversation-item [&.conversation-item+&.conversation-item]:mt-2px min-w-0 transition-colors',
          collapsed ? 'justify-center px-0' : 'justify-start gap-8px pe-16px',
          // Indent the row content while keeping the row background full-width:
          // 0 = flat list, 1 = under a project row, 2 = inside a conversation folder.
          !collapsed &&
            (indentLevel >= 2 ? 'ps-50px' : indentLevel === 1 || dimIcon ? 'ps-34px' : 'ps-10px'),
          {
            'hover:bg-fill-3': !batchMode && !selected,
            '!bg-fill-3': selected,
            'bg-[rgba(var(--primary-6),0.08)]': batchMode && checked,
          }
        )}
        onClick={handleRowClick}
        onContextMenu={handleRowContextMenu}
      >
        {batchMode && (
          <span
            className='me-8px flex-center'
            onClick={(event) => {
              event.stopPropagation();
              onToggleChecked(conversation);
            }}
          >
            <Checkbox checked={checked} />
          </span>
        )}
        <span className='size-22px flex items-center justify-center shrink-0 relative'>
          {showWaitingConfirmation ? (
            <Attention
              theme='filled'
              size='16'
              className='line-height-0 flex-shrink-0 text-warning animate-wiggle'
              data-testid={`conversation-waiting-confirmation-${conversation.id}`}
            />
          ) : isGenerating && !batchMode ? (
            <Spin size={16} />
          ) : (
            renderLeadingIcon()
          )}
          {/* Hover overlay on the leading icon: drag handle for sortable pinned
              rows and for draggable project-group rows, pushpin marker otherwise */}
          {!batchMode &&
            !isGenerating &&
            !isWaitingConfirmation &&
            (dragHandle ??
              (isPinned && !isMobile ? (
                <span
                  className='absolute inset-0 flex-center text-t-secondary pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity'
                  style={{ lineHeight: 0 }}
                >
                  <Pushpin theme='outline' size='14' />
                </span>
              ) : null))}
        </span>
        <FlexFullContainer className='h-24px min-w-0 flex-1 collapsed-hidden'>
          <Tooltip
            content={conversation.name}
            disabled={!inlineNameTooltipEnabled}
            trigger='hover'
            popupVisible={inlineNameTooltipEnabled ? undefined : false}
            unmountOnExit
            popupHoverStay={false}
            position='top'
          >
            <div className='chat-history__item-name overflow-hidden text-ellipsis flex items-center gap-4px w-full text-14px font-[500] lh-24px whitespace-nowrap min-w-0 text-t-primary'>
              <span className='block overflow-hidden text-ellipsis whitespace-nowrap min-w-0'>{conversation.name}</span>
              {forkLineage && (
                <Tooltip
                  content={
                    forkParentName
                      ? t('conversation.history.forkedFrom', { name: forkParentName })
                      : t('conversation.history.forkedConversation')
                  }
                  position='top'
                >
                  <span className='flex-shrink-0 line-height-0 text-t-tertiary' data-testid='conversation-fork-badge'>
                    <ForkBranchIcon size={12} />
                  </span>
                </Tooltip>
              )}
            </div>
          </Tooltip>
        </FlexFullContainer>

        {renderCompletionUnreadDot()}
        {!batchMode && (
          <div
            className={classNames(
              'absolute end-8px top-1/2 -translate-y-1/2 items-center justify-end !collapsed-hidden',
              {
                flex: isMobile || menuVisible,
                'hidden group-hover:flex': !isMobile && !menuVisible,
              }
            )}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <Dropdown
              droplist={
                <Menu
                  className='conversation-row-menu'
                  onClickMenuItem={(key) => {
                    if (key === 'pin') {
                      onTogglePin(conversation);
                      return;
                    }
                    if (key === 'toggleManualUnread') {
                      onToggleManualUnread(conversation);
                      return;
                    }
                    if (key === 'rename') {
                      onEditStart(conversation);
                      return;
                    }
                    if (key === 'createCronTask') {
                      onCreateCronTask(conversation);
                      return;
                    }
                    if (key === 'moveToFolder') {
                      onMoveToFolder?.(conversation);
                      return;
                    }
                    const moveToGroup = parseMoveToGroupMenuKey(key);
                    if (moveToGroup !== undefined) {
                      onMoveToGroup?.(conversation, moveToGroup);
                      return;
                    }
                    if (key === 'export') {
                      onExport?.(conversation);
                      return;
                    }
                    if (key === 'archive') {
                      onArchive(conversation);
                    }
                  }}
                >
                  <Menu.Item key='pin'>
                    <div className='flex items-center gap-8px'>
                      <Pushpin theme='outline' size='14' />
                      <span>{isPinned ? t('conversation.history.unpin') : t('conversation.history.pin')}</span>
                    </div>
                  </Menu.Item>
                  <Menu.Item key='toggleManualUnread'>
                    <div className='flex items-center gap-8px'>
                      <Inbox theme='outline' size='14' />
                      <span>
                        {isManualUnread ? t('conversation.history.markAsRead') : t('conversation.history.markAsUnread')}
                      </span>
                    </div>
                  </Menu.Item>
                  <Menu.Item key='rename'>
                    <div className='flex items-center gap-8px'>
                      <EditOne theme='outline' size='14' />
                      <span>{t('conversation.history.rename')}</span>
                    </div>
                  </Menu.Item>
                  <Menu.Item key='createCronTask'>
                    <div className='flex items-center gap-8px'>
                      <Timer theme='outline' size='14' />
                      <span>{t('conversation.history.createCronTask')}</span>
                    </div>
                  </Menu.Item>
                  {onMoveToFolder &&
                    (isMobile ? (
                      <Menu.Item key={MOVE_TO_FOLDER_MENU_KEY}>
                        <div className='flex items-center gap-8px'>
                          <FolderOpen theme='outline' size='14' />
                          <span>{t('conversation.history.moveToFolder')}</span>
                        </div>
                      </Menu.Item>
                    ) : (
                      canMoveToFolder && (
                        // Desktop gets the same destinations as the mobile action sheet,
                        // nested in this menu instead of a full-bleed bottom sheet (whose
                        // `.sheet` CSS has no max-width and is not a desktop idiom). Arco
                        // pops the submenu sideways and routes item clicks through the parent
                        // Dropdown, which closes both popups and clears `menuVisible`.
                        <Menu.SubMenu
                          key={MOVE_TO_FOLDER_MENU_KEY}
                          title={
                            <div className='flex items-center gap-8px'>
                              <FolderOpen theme='outline' size='14' />
                              <span>{t('conversation.history.moveToFolder')}</span>
                            </div>
                          }
                        >
                          {desktopMoveTargets.map((target) => (
                            <Menu.Item key={moveToGroupMenuKey(target.groupId)} disabled={target.isCurrent}>
                              <div className='flex items-center gap-8px min-w-0'>
                                {target.groupId === null ? (
                                  <FolderClose theme='outline' size='14' className='shrink-0' />
                                ) : (
                                  <FolderOpen theme='outline' size='14' className='shrink-0' />
                                )}
                                <span className='block max-w-180px truncate'>{target.label}</span>
                              </div>
                            </Menu.Item>
                          ))}
                        </Menu.SubMenu>
                      )
                    ))}
                  {onExport && (
                    <Menu.Item key='export'>
                      <div className='flex items-center gap-8px'>
                        <Export theme='outline' size='14' />
                        <span>{t('conversation.history.export')}</span>
                      </div>
                    </Menu.Item>
                  )}
                  <Menu.Item key='archive'>
                    <div className='flex items-center gap-8px'>
                      <FolderClose theme='outline' size='14' />
                      <span>{t('conversation.history.archive')}</span>
                    </div>
                  </Menu.Item>
                </Menu>
              }
              trigger='click'
              position='br'
              popupVisible={menuVisible}
              onVisibleChange={(visible) => onMenuVisibleChange(conversation.id, visible)}
              getPopupContainer={() => document.body}
              unmountOnExit={false}
            >
              <span
                data-testid={`conversation-row-menu-${conversation.id}`}
                role='button'
                tabIndex={0}
                aria-label={t('common.more')}
                className={classNames(
                  'flex-center cursor-pointer transition-colors text-t-secondary hover:text-t-primary size-20px rd-4px sider-action-btn',
                  {
                    flex: isMobile || menuVisible,
                    'hidden group-hover:flex': !isMobile && !menuVisible,
                    // P3: 20px chip → 36px hit box, gated on the same isMobile
                    // flag that force-shows the chip (see styles/layout.css).
                    'sider-touch-hit': isMobile,
                  }
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenMenu(conversation);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    onOpenMenu(conversation);
                  }
                }}
              >
                <MoreOne theme='outline' size='14' fill='currentColor' className='block leading-none' />
              </span>
            </Dropdown>
          </div>
        )}
      </div>
    </Tooltip>
  );
};

export default ConversationRow;
