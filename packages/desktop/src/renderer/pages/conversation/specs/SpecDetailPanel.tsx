/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Button, Input, Message, Modal, Progress, Spin, Tag, Tooltip } from '@arco-design/web-react';
import { Check, CheckOne, CloseSmall, Copy, Edit, Left, PreviewOpen } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { useSWRConfig } from 'swr';
import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import { getRelativeSpecPath, type SpecDetail, type SpecPhase } from '@/common/types/specs';
import { copyText } from '@/renderer/utils/ui/clipboard';
import { SpecTaskBoard } from './SpecTaskBoard';
import MarkdownPreview from '@/renderer/pages/conversation/Preview/components/viewers/MarkdownViewer';

interface SpecDetailPanelProps {
  projectId: string;
  specId: string;
  onBack: () => void;
  isMobile?: boolean;
}

type SpecSubTab = 'overview' | 'requirements' | 'design' | 'tasks';

const PHASES: SpecPhase[] = ['requirements', 'design', 'tasks', 'executing', 'completed'];

const formatWorkflow = (workflow: string) => {
  switch (workflow) {
    case 'requirements_first':
      return 'Requirements-First';
    case 'design_first':
      return 'Design-First';
    case 'quick_spec':
      return 'Quick Spec';
    default:
      return workflow;
  }
};

export const SpecDetailPanel: React.FC<SpecDetailPanelProps> = ({
  projectId,
  specId,
  onBack,
  isMobile,
}) => {
  const { t } = useTranslation();
  const { mutate: globalMutate } = useSWRConfig();
  const { id: routeConvId } = useParams<{ id?: string }>();
  const [spec, setSpec] = useState<SpecDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<SpecSubTab>('tasks');

  const isCurrentChatLinked = Boolean(
    routeConvId && spec?.summary.linked_conversation_id && spec.summary.linked_conversation_id === routeConvId
  );

  const handleLinkToCurrentChat = async () => {
    if (!routeConvId || !spec) return;
    try {
      const updated = await ipcBridge.project.specs.linkConversation.invoke({
        project_id: projectId,
        spec_id: spec.summary.id,
        conversation_id: routeConvId,
      });
      await ipcBridge.conversation.update.invoke({
        id: routeConvId,
        updates: {
          extra: {
            active_spec_id: spec.summary.id,
          },
        } as unknown as Partial<TChatConversation>,
      }).catch(() => {});
      setSpec(updated);
      void globalMutate(`project-specs/${projectId}`);
      void globalMutate(`header-spec/${projectId}/${spec.summary.id}`);
      void globalMutate((key) => typeof key === 'string' && key.startsWith(`header-spec/${projectId}`));
      Message.success(t('specs.linkedSuccess', { defaultValue: 'Linked to current conversation' }));
    } catch (err: unknown) {
      Message.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleUnlinkChat = async () => {
    if (!spec) return;
    try {
      const prevLinkedId = spec.summary.linked_conversation_id;
      const updated = await ipcBridge.project.specs.linkConversation.invoke({
        project_id: projectId,
        spec_id: spec.summary.id,
        conversation_id: undefined,
      });
      if (prevLinkedId) {
        await ipcBridge.conversation.update.invoke({
          id: prevLinkedId,
          updates: {
            extra: {
              active_spec_id: null,
            },
          } as unknown as Partial<TChatConversation>,
        }).catch(() => {});
      }
      setSpec(updated);
      void globalMutate(`project-specs/${projectId}`);
      void globalMutate(`header-spec/${projectId}/${spec.summary.id}`);
      void globalMutate((key) => typeof key === 'string' && key.startsWith(`header-spec/${projectId}`));
      Message.success(t('specs.unlinkedSuccess', { defaultValue: 'Conversation unlinked' }));
    } catch (err: unknown) {
      Message.error(err instanceof Error ? err.message : String(err));
    }
  };

  // Markdown Editor state
  const [editMode, setEditMode] = useState(false);
  const [fileContent, setFileContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const activeFilename =
    subTab === 'requirements'
      ? spec?.summary.spec_type === 'bugfix'
        ? 'bugfix.md'
        : 'requirements.md'
      : subTab === 'design'
        ? 'design.md'
        : 'tasks.md';

  const loadSpec = async () => {
    try {
      setLoading(true);
      const data = await ipcBridge.project.specs.get.invoke({ project_id: projectId, spec_id: specId });
      setSpec(data);
    } catch (err: unknown) {
      Message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSpec();
  }, [projectId, specId]);

  useEffect(() => {
    if (!spec) return;
    if (subTab === 'requirements') {
      const content = spec.requirements_md || '';
      setFileContent(content);
      setIsDirty(false);
    } else if (subTab === 'design') {
      const content = spec.design_md || '';
      setFileContent(content);
      setIsDirty(false);
    } else if (subTab === 'tasks') {
      const content = spec.tasks_md || '';
      setFileContent(content);
      setIsDirty(false);
    }
  }, [subTab, spec]);

  const handleSaveFile = async () => {
    if (!spec) return;
    setSaving(true);
    try {
      const updated = await ipcBridge.project.specs.updateFile.invoke({
        project_id: projectId,
        spec_id: spec.summary.id,
        filename: activeFilename,
        content: fileContent,
        expected_mtime: spec.file_mtimes[activeFilename] || spec.mtime,
      });
      setSpec(updated);
      setIsDirty(false);
      Message.success(t('specs.fileSaved', { defaultValue: 'File saved successfully' }));
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes('concurrent_modification')) {
        Modal.warning({
          title: t('specs.conflictTitle', { defaultValue: 'Concurrent Modification Detected' }),
          content: t('specs.conflictMessage', {
            defaultValue: 'This document was changed on disk since it was last read. Reload to avoid overwriting.',
          }),
          okText: t('common.reload', { defaultValue: 'Reload' }),
          onOk: () => void loadSpec(),
        });
      } else {
        Message.error(errorMsg);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleTransitionPhase = async (nextPhase: SpecPhase) => {
    if (!spec) return;
    try {
      const updated = await ipcBridge.project.specs.transitionPhase.invoke({
        project_id: projectId,
        spec_id: spec.summary.id,
        phase: nextPhase,
      });
      setSpec(updated);
      Message.success(t('specs.phaseTransitioned', { defaultValue: 'Phase updated' }));
    } catch (err: unknown) {
      Message.error(err instanceof Error ? err.message : String(err));
    }
  };

  if (loading || !spec) {
    return (
      <div className='flex items-center justify-center h-full p-24px'>
        <Spin loading />
      </div>
    );
  }

  const currentPhaseIndex = PHASES.indexOf(spec.summary.current_phase);

  return (
    <div className='flex flex-col h-full bg-1'>
      {/* Detail Header */}
      <div className='flex flex-col gap-8px p-10px border-b border-[var(--bg-3)] shrink-0'>
        {/* Row 1: Back button + Title + Type tag */}
        <div className='flex items-center gap-6px min-w-0'>
          <Button
            type='text'
            size='mini'
            className='!px-4px !py-2px shrink-0'
            icon={<Left theme='outline' size='16' />}
            onClick={onBack}
            aria-label={t('common.back', { defaultValue: 'Back' })}
          />
          <span className='font-semibold text-13px text-t-primary truncate min-w-0 flex-1' title={spec.summary.title}>
            {spec.summary.title}
          </span>
          <Tag size='mini' color={spec.summary.spec_type === 'bugfix' ? 'gold' : 'arcoblue'} className='shrink-0'>
            {spec.summary.spec_type.toUpperCase()}
          </Tag>
        </div>

        {/* Row 2: Phase progress bar - compact 5-phase segmented pills */}
        <div className='flex items-center justify-between gap-2px bg-fill-1 p-2px rounded-6px'>
          {PHASES.map((phase, idx) => {
            const isCurrent = spec.summary.current_phase === phase;
            const isPast = idx < currentPhaseIndex;
            const shortLabel =
              phase === 'requirements'
                ? 'Reqs'
                : phase === 'design'
                  ? 'Design'
                  : phase === 'tasks'
                    ? 'Tasks'
                    : phase === 'executing'
                      ? 'Exec'
                      : 'Done';

            return (
              <Button
                key={phase}
                type='text'
                size='mini'
                onClick={() => void handleTransitionPhase(phase)}
                title={`${phase.charAt(0).toUpperCase() + phase.slice(1)}${isCurrent ? ' (Current)' : isPast ? ' (Passed)' : ''}`}
                style={
                  isCurrent
                    ? {
                        backgroundColor: 'color-mix(in srgb, var(--primary) 22%, transparent)',
                        color: 'var(--primary)',
                        fontWeight: 600,
                      }
                    : isPast
                      ? {
                          color: 'var(--success)',
                          fontWeight: 500,
                        }
                      : {
                          color: 'var(--text-secondary)',
                          opacity: 0.8,
                        }
                }
                className='flex-1 !h-20px !px-2px !text-10px !rounded-4px !text-center transition-all truncate hover:!bg-fill-2'
              >
                {shortLabel}
              </Button>
            );
          })}
        </div>

        {/* Row 3: Sub Tabs - 4-column responsive segmented control */}
        <div className='flex flex-col gap-4px pt-2px'>
          <div className='grid grid-cols-4 gap-2px bg-fill-1 p-2px rounded-6px w-full'>
            {[
              { key: 'tasks' as SpecSubTab, label: t('specs.tasksTab', { defaultValue: 'Tasks' }) },
              { key: 'requirements' as SpecSubTab, label: t('specs.requirementsTab', { defaultValue: 'Reqs' }) },
              { key: 'design' as SpecSubTab, label: t('specs.designTab', { defaultValue: 'Design' }) },
              { key: 'overview' as SpecSubTab, label: t('specs.overviewTab', { defaultValue: 'Overview' }) },
            ].map(({ key, label }) => {
              const isActive = subTab === key;
              return (
                <Button
                  key={key}
                  type='text'
                  size='mini'
                  onClick={() => setSubTab(key)}
                  className={`!h-24px !px-2px !text-11px !rounded-4px !text-center transition-all truncate ${
                    isActive
                      ? '!bg-2 !text-t-primary !font-medium shadow-xs'
                      : '!text-t-secondary hover:!text-t-primary hover:!bg-fill-2'
                  }`}
                >
                  {label}
                </Button>
              );
            })}
          </div>

          {(subTab === 'requirements' || subTab === 'design') && (
            <div className='flex items-center justify-end gap-6px pt-2px'>
              <Button
                type='text'
                size='mini'
                icon={editMode ? <PreviewOpen theme='outline' size='13' /> : <Edit theme='outline' size='13' />}
                onClick={() => setEditMode(!editMode)}
              >
                {editMode ? t('common.preview', { defaultValue: 'Preview' }) : t('common.edit', { defaultValue: 'Edit' })}
              </Button>
              {editMode && (
                <Button
                  type='primary'
                  size='mini'
                  icon={<Check theme='outline' size='13' />}
                  loading={saving}
                  disabled={!isDirty}
                  onClick={handleSaveFile}
                >
                  {t('common.save', { defaultValue: 'Save' })}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Detail Tab Contents */}
      <div className='flex-1 min-h-0 overflow-y-auto'>
        {subTab === 'tasks' && (
          <SpecTaskBoard
            projectId={projectId}
            spec={spec}
            onSpecUpdated={setSpec}
            isMobile={isMobile}
          />
        )}

        {(subTab === 'requirements' || subTab === 'design') && (
          <div className='h-full flex flex-col p-12px'>
            {editMode ? (
              <Input.TextArea
                value={fileContent}
                onChange={(val) => {
                  setFileContent(val);
                  setIsDirty(true);
                }}
                className='flex-1 font-mono text-12px resize-none h-full'
                placeholder={`Markdown content for ${activeFilename}`}
              />
            ) : (
              <div className='markdown-body p-8px overflow-y-auto flex-1'>
                <MarkdownPreview content={fileContent || `*No ${activeFilename} drafted yet.*`} />
              </div>
            )}
          </div>
        )}

        {subTab === 'overview' && (
          <div className='p-10px flex flex-col gap-10px text-13px text-t-primary'>
            <div className='rounded-8px border border-[var(--bg-3)] bg-fill-0 p-10px flex flex-col gap-8px shadow-xs'>
              <span className='font-semibold text-13px text-t-primary'>{t('specs.metadata', { defaultValue: 'Spec Metadata' })}</span>

              {/* Location */}
              <div className='flex flex-col gap-4px text-12px text-t-secondary'>
                <span className='font-medium text-t-primary'>{t('specs.location', { defaultValue: 'Location' })}:</span>
                <div className='flex items-center gap-6px bg-fill-2 px-8px py-4px rounded-6px border border-[var(--bg-3)] min-w-0'>
                  <span
                    className='font-mono text-11px text-t-primary truncate flex-1 min-w-0 select-all'
                    title={spec.summary.directory_path}
                  >
                    {getRelativeSpecPath(spec.summary)}
                  </span>
                  <Tooltip content={t('common.copy', { defaultValue: 'Copy path' })} mini>
                    <Button
                      type='text'
                      size='mini'
                      className='!p-2px text-t-secondary hover:text-t-primary shrink-0'
                      icon={<Copy theme='outline' size='12' />}
                      onClick={() => {
                        const rel = getRelativeSpecPath(spec.summary);
                        void copyText(rel)
                          .then(() => Message.success(t('common.copied', { defaultValue: 'Copied' })))
                          .catch(() => Message.error(t('common.copyFailed', { defaultValue: 'Failed to copy' })));
                      }}
                    />
                  </Tooltip>
                </div>
              </div>

              {/* Workflow */}
              <div className='flex items-center justify-between text-12px text-t-secondary'>
                <span>{t('specs.workflowLabel', { defaultValue: 'Workflow' })}:</span>
                <Tag size='small' color='arcoblue'>
                  {formatWorkflow(spec.summary.workflow)}
                </Tag>
              </div>

              {/* Current Phase */}
              <div className='flex items-center justify-between text-12px text-t-secondary'>
                <span>{t('specs.phaseLabel', { defaultValue: 'Current Phase' })}:</span>
                <Tag size='small' color='blue' className='capitalize'>
                  {spec.summary.current_phase}
                </Tag>
              </div>

              {/* Progress */}
              {(() => {
                const total = spec.summary.total_tasks;
                const completed = spec.summary.completed_tasks;
                const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
                return (
                  <div className='flex flex-col gap-4px text-12px text-t-secondary pt-2px'>
                    <div className='flex items-center justify-between'>
                      <span>{t('specs.progressLabel', { defaultValue: 'Progress' })}:</span>
                      <span className='font-medium text-t-primary'>
                        {completed} / {total} ({percent}%)
                      </span>
                    </div>
                    <Progress
                      percent={percent}
                      size='mini'
                      status={total > 0 && completed === total ? 'success' : 'normal'}
                    />
                  </div>
                );
              })()}

              {/* Linked Conversation */}
              <div className='flex flex-col gap-4px text-12px text-t-secondary pt-6px border-t border-[var(--bg-3)]'>
                <div className='flex items-center justify-between'>
                  <span>{t('specs.linkedConversation', { defaultValue: 'Linked Chat' })}:</span>
                  <div className='flex items-center gap-4px min-w-0'>
                    {isCurrentChatLinked ? (
                      <Tag size='small' color='green' className='flex items-center gap-2px'>
                        <CheckOne theme='filled' size='11' />
                        <span>{t('specs.currentChat', { defaultValue: 'Current Chat' })}</span>
                      </Tag>
                    ) : spec.summary.linked_conversation_id ? (
                      <span className='font-mono text-11px font-medium text-t-primary truncate max-w-100px' title={spec.summary.linked_conversation_id}>
                        {spec.summary.linked_conversation_id}
                      </span>
                    ) : (
                      <span className='text-11px opacity-60'>{t('common.none', { defaultValue: 'None' })}</span>
                    )}

                    {spec.summary.linked_conversation_id && (
                      <Tooltip content={t('specs.unlinkChatTooltip', { defaultValue: 'Unlink from conversation' })} mini>
                        <Button
                          type='text'
                          size='mini'
                          className='!p-2px text-t-secondary hover:text-red-500 shrink-0'
                          icon={<CloseSmall theme='outline' size='14' />}
                          onClick={handleUnlinkChat}
                        />
                      </Tooltip>
                    )}
                  </div>
                </div>
                {!isCurrentChatLinked && routeConvId && (
                  <Button
                    type='secondary'
                    size='mini'
                    className='!h-22px !mt-4px !text-11px !rounded-4px !bg-fill-2 hover:!bg-fill-3 border border-[var(--bg-3)]'
                    onClick={handleLinkToCurrentChat}
                  >
                    {spec.summary.linked_conversation_id
                      ? t('specs.linkToCurrentChatInstead', { defaultValue: 'Link to this chat instead' })
                      : t('specs.linkToCurrentChat', { defaultValue: 'Link to this chat' })}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
