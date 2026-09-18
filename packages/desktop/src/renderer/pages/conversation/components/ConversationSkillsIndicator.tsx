/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { mcpService } from '@/common/adapter/ipcBridge';
import type { IConversationMcpStatus, IMcpServer, TChatConversation } from '@/common/config/storage';
import type { UpdateConversationRuntimeBindingsRequest } from '@/common/types/platform/acpTypes';
import AionModal from '@/renderer/components/base/AionModal';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { refreshConversationCache } from '@/renderer/pages/conversation/utils/conversationCache';
import { iconColors } from '@/renderer/styles/colors';
import { Button, Input, Message, Spin, Switch, Tag } from '@arco-design/web-react';
import { Connection, Lightning, Search } from '@icon-park/react';
import classNames from 'classnames';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import styles from './ConversationSkillsIndicator.module.css';

type ConversationSkillsIndicatorProps = {
  conversation: TChatConversation | undefined;
};

type ConversationBindingExtra = {
  teamId?: string;
  skills?: string[];
  mcp_server_ids?: string[];
  mcp_statuses?: IConversationMcpStatus[];
  session_mcp_servers?: unknown[];
};

type FilterTabKey = 'all' | 'skills' | 'mcp' | 'active';

/**
 * Interactive "MCP Servers & Skills" control panel for an active conversation
 * (Phase 2A). Reads the per-conversation MCP server / skill bindings from
 * `conversation.extra` and lets the user toggle each entry. Applying the
 * selection calls the atomic runtime-bindings endpoint: the backend persists
 * the new binding (extra + assistant snapshot in one transaction) and then
 * restarts the cached agent runtime, so the change applies to the running
 * session while the chat history is kept.
 */
const ConversationSkillsIndicator: React.FC<ConversationSkillsIndicatorProps> = ({ conversation }) => {
  const { t } = useTranslation();
  const { layout } = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;

  const [open, setOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTabKey>('all');

  // Draft selections are null while the modal is closed / after a successful
  // apply; when set they hold the full desired list (not a delta).
  const [draftMcp, setDraftMcp] = useState<string[] | null>(null);
  const [draftSkills, setDraftSkills] = useState<string[] | null>(null);

  const extra = ((conversation?.extra ?? {}) as ConversationBindingExtra) ?? {};
  const currentMcpIds = useMemo(() => extra.mcp_server_ids ?? [], [extra.mcp_server_ids]);
  const currentSkills = useMemo(() => extra.skills ?? [], [extra.skills]);
  const teamId = extra.teamId;

  // Track runtime restart state so we can display spinner feedback
  const { data: runtimeStatus } = useSWR(
    conversation?.id ? `conversation-runtime-${conversation.id}` : null,
    async () => {
      if (!conversation?.id) return null;
      return ipcBridge.conversation.ensureRuntime.invoke({ conversation_id: conversation.id });
    },
    { revalidateOnFocus: false, dedupingInterval: 5000 }
  );
  const runtimeRestarting = runtimeStatus?.status === 'restarting';

  // Read available MCP servers and skill catalog from system (cached, revalidated on focus)
  const { data: mcpServers, isLoading: isLoadingMcp } = useSWR('mcp-servers-list', () =>
    mcpService.listServers.invoke()
  );
  const { data: skillIndex, isLoading: isLoadingSkills } = useSWR('skills-index-list', () =>
    ipcBridge.fs.listAvailableSkills.invoke()
  );
  const isLoadingCatalog = (isLoadingMcp && !mcpServers) || (isLoadingSkills && !skillIndex);

  const draftMcpIds = draftMcp ?? currentMcpIds;
  const draftSkillNames = draftSkills ?? currentSkills;

  const statusById = useMemo(() => {
    const map = new Map<string, IConversationMcpStatus>();
    for (const status of extra.mcp_statuses ?? []) {
      if (status.id) {
        map.set(status.id, status);
      }
    }
    return map;
  }, [extra.mcp_statuses]);

  // Merge active items with system catalog so active entries always remain visible
  const combinedMcp = useMemo(() => {
    const list = [...(mcpServers ?? [])];
    const knownIds = new Set(list.map((s) => s.id));
    for (const id of draftMcpIds) {
      if (!knownIds.has(id)) {
        list.push({
          id,
          name: id,
          description: '',
          builtin: false,
        } as IMcpServer);
      }
    }
    return list;
  }, [mcpServers, draftMcpIds]);

  const combinedSkills = useMemo(() => {
    const list = [...(skillIndex ?? [])];
    const knownNames = new Set(list.map((s) => s.name));
    for (const name of draftSkillNames) {
      if (!knownNames.has(name)) {
        list.push({
          name,
          description: '',
          location: '',
          is_auto_inject: false,
          is_custom: true,
          source: 'custom',
        });
      }
    }
    return list;
  }, [skillIndex, draftSkillNames]);

  // Track draft diff
  const hasMcpChanges =
    draftMcp !== null &&
    (draftMcp.length !== currentMcpIds.length || draftMcp.some((id) => !currentMcpIds.includes(id)));
  const hasSkillChanges =
    draftSkills !== null &&
    (draftSkills.length !== currentSkills.length || draftSkills.some((name) => !currentSkills.includes(name)));
  const hasChanges = hasMcpChanges || hasSkillChanges;

  const pendingAddedMcp = draftMcp ? draftMcp.filter((id) => !currentMcpIds.includes(id)).length : 0;
  const pendingRemovedMcp = draftMcp ? currentMcpIds.filter((id) => !draftMcp.includes(id)).length : 0;
  const pendingAddedSkills = draftSkills ? draftSkills.filter((name) => !currentSkills.includes(name)).length : 0;
  const pendingRemovedSkills = draftSkills ? currentSkills.filter((name) => !draftSkills.includes(name)).length : 0;
  const pendingCount = pendingAddedMcp + pendingRemovedMcp + pendingAddedSkills + pendingRemovedSkills;

  const handleOpen = () => {
    setDraftMcp(null);
    setDraftSkills(null);
    setSearchQuery('');
    setActiveTab('all');
    setOpen(true);
  };

  const handleClose = () => {
    if (applying) return;
    setOpen(false);
    setSearchQuery('');
    setActiveTab('all');
    setDraftMcp(null);
    setDraftSkills(null);
  };

  const handleReset = () => {
    setDraftMcp(null);
    setDraftSkills(null);
  };

  const handleApply = async () => {
    if (!conversation?.id || !hasChanges) return;
    setApplying(true);
    try {
      const payload: UpdateConversationRuntimeBindingsRequest = {};
      if (hasMcpChanges) {
        payload.mcp_server_ids = draftMcpIds;
      }
      if (hasSkillChanges) {
        payload.skills = draftSkillNames;
      }
      const res = await ipcBridge.conversation.updateRuntimeBindings.invoke({
        conversation_id: conversation.id,
        ...payload,
      });
      refreshConversationCache(conversation.id);

      if (res.restart_pending) {
        Message.info(t('conversation.bindings.restartPending'));
      } else if (res.restarted) {
        Message.success(t('conversation.bindings.applied'));
      } else if (res.restart_error) {
        Message.warning(`${t('conversation.bindings.restartFailed')}: ${res.restart_error}`);
      } else {
        Message.success(t('conversation.bindings.appliedNextOpen'));
      }
      handleClose();
    } catch (error) {
      Message.error({
        content: `${t('conversation.bindings.applyFailed')}: ${(error as Error)?.message ?? ''}`.trim(),
        duration: 6000,
      });
    } finally {
      setApplying(false);
    }
  };

  const toggleMcp = (id: string) => {
    setDraftMcp(draftMcpIds.includes(id) ? draftMcpIds.filter((item) => item !== id) : [...draftMcpIds, id]);
  };

  const toggleSkill = (name: string) => {
    setDraftSkills(
      draftSkillNames.includes(name)
        ? draftSkillNames.filter((item) => item !== name)
        : [...draftSkillNames, name]
    );
  };

  const statusColor = (status: IConversationMcpStatus | undefined) => {
    if (!status) return 'var(--color-text-3)';
    if (status.status === 'loaded') return 'rgb(var(--success-6))';
    if (status.status === 'failed') return 'rgb(var(--danger-6))';
    return 'rgb(var(--warning-6))';
  };

  // Search and Filter computation
  const query = searchQuery.trim().toLowerCase();

  const filteredMcp = useMemo(() => {
    if (activeTab === 'skills') return [];
    return combinedMcp.filter((server) => {
      if (activeTab === 'active' && !draftMcpIds.includes(server.id)) return false;
      if (!query) return true;
      return (
        server.name.toLowerCase().includes(query) ||
        (server.description && server.description.toLowerCase().includes(query))
      );
    });
  }, [combinedMcp, activeTab, draftMcpIds, query]);

  const filteredSkills = useMemo(() => {
    if (activeTab === 'mcp') return [];
    return combinedSkills.filter((skill) => {
      if (activeTab === 'active' && !draftSkillNames.includes(skill.name)) return false;
      if (!query) return true;
      return (
        skill.name.toLowerCase().includes(query) ||
        (skill.description && skill.description.toLowerCase().includes(query))
      );
    });
  }, [combinedSkills, activeTab, draftSkillNames, query]);

  const allMcpCount = combinedMcp.length;
  const allSkillsCount = combinedSkills.length;
  const activeMcpCount = draftMcpIds.length;
  const activeSkillsCount = draftSkillNames.length;
  const totalActiveCount = activeMcpCount + activeSkillsCount;

  const filterTabs = [
    { key: 'all' as const, label: t('conversation.bindings.filterAll', 'All'), count: allMcpCount + allSkillsCount },
    { key: 'skills' as const, label: t('conversation.bindings.filterSkills', 'Skills'), count: allSkillsCount },
    { key: 'mcp' as const, label: t('conversation.bindings.filterMcp', 'MCP'), count: allMcpCount },
    { key: 'active' as const, label: t('conversation.bindings.filterActive', 'Active'), count: totalActiveCount },
  ];

  const hasAnyResults = filteredMcp.length > 0 || filteredSkills.length > 0;
  const mcpCount = currentMcpIds.length;
  const skillsCount = currentSkills.length;

  const modalFooter = (
    <div className='flex items-center justify-between gap-12px w-full'>
      <div className='min-w-0 flex-1 text-start'>
        {hasChanges ? (
          <div className='text-12px text-primary font-medium flex items-center gap-4px flex-wrap'>
            <span>
              {t('conversation.bindings.pendingChanges', {
                count: pendingCount,
                defaultValue: `${pendingCount} change(s) pending`,
              })}
            </span>
            <span className='text-11px text-t-secondary opacity-80'>
              · {t('conversation.bindings.restartNotice', { defaultValue: 'session restarts briefly, history kept' })}
            </span>
          </div>
        ) : (
          <span className='text-12px text-t-secondary'>
            {t('conversation.bindings.applyHint', {
              defaultValue: 'Changes take effect on your next message',
            })}
          </span>
        )}
      </div>
      <div className='flex items-center gap-8px shrink-0'>
        {hasChanges && (
          <Button
            size='small'
            onClick={handleReset}
            disabled={applying || runtimeRestarting}
            data-testid='bindings-reset-btn'
          >
            {t('conversation.bindings.reset', { defaultValue: 'Reset' })}
          </Button>
        )}
        <Button size='small' onClick={handleClose} disabled={applying}>
          {t('common.cancel', { defaultValue: 'Cancel' })}
        </Button>
        <Button
          type='primary'
          size='small'
          loading={applying}
          disabled={!hasChanges || applying || runtimeRestarting}
          onClick={handleApply}
          data-testid='bindings-apply-btn'
        >
          {t('conversation.bindings.apply', { defaultValue: 'Apply changes' })}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <button
        type='button'
        onClick={handleOpen}
        className='inline-flex items-center gap-4px rounded-full px-8px py-2px bg-2 hover:bg-fill-3 active:scale-95 cursor-pointer border-none outline-none transition-all'
        data-testid='skills-indicator'
        aria-label={t('conversation.bindings.title', 'Session Tools & Skills')}
        title={t('conversation.bindings.title', 'Session Tools & Skills')}
      >
        {runtimeRestarting || applying ? (
          <Spin size={12} />
        ) : (
          <Lightning theme='filled' size={14} fill={iconColors.primary} strokeWidth={2} style={{ lineHeight: 0 }} />
        )}
        <span className='text-13px text-t-primary font-medium lh-[1]' data-testid='skills-indicator-count'>
          {skillsCount}
        </span>
        <span className='text-11px text-t-secondary lh-[1] opacity-75'>· MCP {mcpCount}</span>
      </button>

      <AionModal
        visible={open}
        onCancel={handleClose}
        variant='standard'
        style={{
          width: isMobile ? 'calc(100vw - 24px)' : '580px',
          maxHeight: isMobile ? '86vh' : '700px',
        }}
        header={{
          title: t('conversation.bindings.title', 'Session Tools & Skills'),
          subtitle: t(
            'conversation.bindings.subtitle',
            'Configure active MCP servers and skills for this conversation.'
          ),
          showClose: true,
        }}
        footer={modalFooter}
      >
        <div className='flex flex-col gap-12px h-full' data-testid='bindings-panel'>
          {teamId ? (
            <div className='p-16px rounded-8px bg-fill-2 text-13px text-t-secondary leading-relaxed'>
              {t('conversation.bindings.teamHint')}
            </div>
          ) : (
            <>
              {/* Search & Segmented Filter Bar */}
              <div className='flex flex-col gap-8px shrink-0 pb-2px'>
                <Input
                  prefix={<Search size={14} fill='currentColor' />}
                  allowClear
                  placeholder={t('conversation.bindings.searchPlaceholder', 'Filter skills or MCP servers...')}
                  value={searchQuery}
                  onChange={setSearchQuery}
                  className='w-full !rounded-8px'
                  data-testid='bindings-search-input'
                />
                <div className={styles.tabsTrack}>
                  {filterTabs.map((tab) => {
                    const isSelected = activeTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        type='button'
                        onClick={() => setActiveTab(tab.key)}
                        className={classNames(
                          styles.tabBtn,
                          isSelected && styles.tabBtnActive
                        )}
                      >
                        <span>{tab.label}</span>
                        <span className={styles.tabCount}>({tab.count})</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Content area: Spinner while catalog loading, or scrollable list */}
              {isLoadingCatalog ? (
                <div className='py-48px flex flex-col items-center justify-center gap-10px'>
                  <Spin size={20} />
                  <span className='text-12px text-t-secondary'>{t('common.loading', 'Loading...')}</span>
                </div>
              ) : (
                <div
                  className='flex-1 min-h-0 overflow-y-auto pr-2px flex flex-col gap-16px'
                  style={{ maxHeight: isMobile ? '48vh' : '390px' }}
                >
                  {!hasAnyResults ? (
                    <div className='py-36px flex flex-col items-center justify-center text-center gap-10px'>
                      <span className='text-t-secondary text-13px'>
                        {t('conversation.bindings.noResults', 'No matching skills or MCP servers found')}
                      </span>
                      {query && (
                        <Button size='mini' onClick={() => setSearchQuery('')}>
                          {t('conversation.bindings.clearSearch', 'Clear search')}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* MCP Section */}
                      {filteredMcp.length > 0 && (
                        <div>
                          <div className='text-12px font-600 text-t-secondary mb-8px flex items-center gap-6px'>
                            <Connection theme='outline' size={14} fill={iconColors.primary} strokeWidth={3} />
                            <span>
                              {t('conversation.bindings.mcpSection', 'MCP servers')} ({filteredMcp.length})
                            </span>
                          </div>
                          <div className='flex flex-col gap-6px'>
                            {filteredMcp.map((server: IMcpServer) => {
                              const isEnabled = draftMcpIds.includes(server.id);
                              const status = statusById.get(server.id);
                              const tools = server.tools?.length ?? 0;
                              return (
                                <div
                                  key={server.id}
                                  onClick={() => toggleMcp(server.id)}
                                  className={classNames(
                                    styles.itemCard,
                                    isEnabled && styles.itemCardActive
                                  )}
                                  data-testid={`binding-row-mcp-${server.id}`}
                                >
                                  <div className='flex items-start gap-10px min-w-0 flex-1'>
                                    <div
                                      className={classNames(
                                        'mt-2px shrink-0',
                                        isEnabled ? 'text-primary' : 'text-t-secondary opacity-70 group-hover:opacity-100'
                                      )}
                                    >
                                      <Connection size={16} />
                                    </div>
                                    <div className='min-w-0 flex-1'>
                                      <div className='flex items-center gap-6px flex-wrap'>
                                        <span className='text-13px font-600 text-t-primary'>{server.name}</span>
                                        {server.builtin ? (
                                          <Tag size='small' className='!text-11px !h-18px !px-4px !leading-16px'>
                                            builtin
                                          </Tag>
                                        ) : null}
                                        <span className='inline-flex items-center gap-4px text-11px text-t-secondary opacity-80'>
                                          <span
                                            className='w-6px h-6px rounded-full shrink-0'
                                            style={{ background: statusColor(status) }}
                                          />
                                          {status?.status === 'failed' && status.reason
                                            ? status.reason
                                            : status
                                              ? t(
                                                  `conversation.bindings.status${status.status.charAt(0).toUpperCase()}${status.status.slice(1)}`
                                                )
                                              : ''}
                                        </span>
                                        {tools > 0 && (
                                          <span className='text-11px text-t-secondary opacity-80'>
                                            · {t('conversation.bindings.toolsCount', { count: tools })}
                                          </span>
                                        )}
                                        {isEnabled && (
                                          <Tag
                                            size='small'
                                            color='green'
                                            className='!text-11px !h-18px !px-4px !leading-16px'
                                          >
                                            {t('conversation.bindings.activeTag', 'Active')}
                                          </Tag>
                                        )}
                                      </div>
                                      {server.description && (
                                        <p className='text-12px text-t-secondary mt-3px mb-0 leading-relaxed line-clamp-2'>
                                          {server.description}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <div className='shrink-0 pt-1px' onClick={(e) => e.stopPropagation()}>
                                    <Switch
                                      size='small'
                                      checked={isEnabled}
                                      onChange={() => toggleMcp(server.id)}
                                      disabled={applying || runtimeRestarting}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Skills Section */}
                      {filteredSkills.length > 0 && (
                        <div>
                          <div className='text-12px font-600 text-t-secondary mb-8px flex items-center gap-6px'>
                            <Lightning theme='outline' size={14} fill={iconColors.primary} strokeWidth={3} />
                            <span>
                              {t('conversation.bindings.skillsSection', 'Skills')} ({filteredSkills.length})
                            </span>
                          </div>
                          <div className='flex flex-col gap-6px'>
                            {filteredSkills.map((skill) => {
                              const isEnabled = draftSkillNames.includes(skill.name);
                              return (
                                <div
                                  key={skill.name}
                                  onClick={() => toggleSkill(skill.name)}
                                  className={classNames(
                                    styles.itemCard,
                                    isEnabled && styles.itemCardActive
                                  )}
                                  data-testid={`binding-row-skill-${skill.name}`}
                                >
                                  <div className='flex items-start gap-10px min-w-0 flex-1'>
                                    <div
                                      className={classNames(
                                        'mt-2px shrink-0',
                                        isEnabled ? 'text-primary' : 'text-t-secondary opacity-70 group-hover:opacity-100'
                                      )}
                                    >
                                      <Lightning size={16} />
                                    </div>
                                    <div className='min-w-0 flex-1'>
                                      <div className='flex items-center gap-6px flex-wrap'>
                                        <span className='text-13px font-600 text-t-primary'>{skill.name}</span>
                                        {isEnabled && (
                                          <Tag
                                            size='small'
                                            color='green'
                                            className='!text-11px !h-18px !px-4px !leading-16px'
                                          >
                                            {t('conversation.bindings.activeTag', 'Active')}
                                          </Tag>
                                        )}
                                      </div>
                                      {skill.description && (
                                        <p className='text-12px text-t-secondary mt-3px mb-0 leading-relaxed line-clamp-2'>
                                          {skill.description}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <div className='shrink-0 pt-1px' onClick={(e) => e.stopPropagation()}>
                                    <Switch
                                      size='small'
                                      checked={isEnabled}
                                      onChange={() => toggleSkill(skill.name)}
                                      disabled={applying || runtimeRestarting}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </AionModal>
    </>
  );
};

export default ConversationSkillsIndicator;
