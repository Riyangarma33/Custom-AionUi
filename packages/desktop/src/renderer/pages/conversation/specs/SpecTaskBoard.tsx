/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Button, Checkbox, Message, Modal, Tag, Tooltip } from '@arco-design/web-react';
import { CheckOne, SendOne } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { ipcBridge } from '@/common';
import type { SpecDetail, SpecTask, SpecWave, TaskStatus } from '@/common/types/specs';
import { emitter } from '@/renderer/utils/emitter';
import { requestConversationSendBoxPrefill } from '@/renderer/hooks/chat/useSendBoxDraft';

interface SpecTaskBoardProps {
  projectId: string;
  spec: SpecDetail;
  onSpecUpdated: (spec: SpecDetail) => void;
  isMobile?: boolean;
}

export const SpecTaskBoard: React.FC<SpecTaskBoardProps> = ({
  projectId,
  spec,
  onSpecUpdated,
  isMobile,
}) => {
  const { t } = useTranslation();
  const { id: routeConvId } = useParams<{ id?: string }>();
  const activeConversationId = routeConvId || spec.summary.linked_conversation_id;
  const [patchingTaskId, setPatchingTaskId] = useState<string | null>(null);
  const [selectedMobileTask, setSelectedMobileTask] = useState<SpecTask | null>(null);

  const handleToggleTaskStatus = async (task: SpecTask) => {
    const nextStatus: TaskStatus = task.status === 'completed' ? 'todo' : 'completed';
    setPatchingTaskId(task.id);
    try {
      const updated = await ipcBridge.project.specs.patchTask.invoke({
        project_id: projectId,
        spec_id: spec.summary.id,
        task_id: task.id,
        status: nextStatus,
        expected_mtime: spec.file_mtimes['tasks.md'] || spec.mtime,
      });
      onSpecUpdated(updated);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes('concurrent_modification')) {
        Modal.warning({
          title: t('specs.conflictTitle', { defaultValue: 'File Changed on Disk' }),
          content: t('specs.conflictMessage', {
            defaultValue: 'tasks.md was modified by another process. Please reload to see the latest checklist.',
          }),
          okText: t('common.reload', { defaultValue: 'Reload' }),
          onOk: async () => {
            const reloaded = await ipcBridge.project.specs.get.invoke({
              project_id: projectId,
              spec_id: spec.summary.id,
            });
            onSpecUpdated(reloaded);
          },
        });
      } else {
        Message.error(errorMsg);
      }
    } finally {
      setPatchingTaskId(null);
    }
  };

  const handleRunTask = (task: SpecTask) => {
    const prompt = `Execute task ${task.id} (${task.title}) from specification "${spec.summary.title}" (ID: ${spec.summary.id}). Verify against relevant acceptance criteria.`;
    if (activeConversationId) {
      requestConversationSendBoxPrefill(activeConversationId, prompt, { mode: 'replace' });
    }
    emitter.emit('sendbox.fill', prompt);
    emitter.emit('guid.prefill', { prompt, autoSend: false });
    Message.info(t('specs.taskSentToChat', { defaultValue: 'Task sent to chat input' }));
  };

  const handleRunWave = (wave: SpecWave) => {
    const prompt = `Execute Wave ${wave.number} (${wave.title}) from specification "${spec.summary.title}" (ID: ${spec.summary.id}). Work through unfinished tasks in sequence.`;
    if (activeConversationId) {
      requestConversationSendBoxPrefill(activeConversationId, prompt, { mode: 'replace' });
    }
    emitter.emit('sendbox.fill', prompt);
    emitter.emit('guid.prefill', { prompt, autoSend: false });
    Message.info(t('specs.waveSentToChat', { defaultValue: 'Wave sent to chat input' }));
  };

  const handleRunAll = () => {
    const prompt = `Execute all remaining tasks from specification "${spec.summary.title}" (ID: ${spec.summary.id}) wave by wave.`;
    if (activeConversationId) {
      requestConversationSendBoxPrefill(activeConversationId, prompt, { mode: 'replace' });
    }
    emitter.emit('sendbox.fill', prompt);
    emitter.emit('guid.prefill', { prompt, autoSend: false });
    Message.info(t('specs.allTasksSentToChat', { defaultValue: 'All tasks sent to chat' }));
  };

  const renderStatusBadge = (status: TaskStatus) => {
    switch (status) {
      case 'completed':
        return (
          <Tag color='green' size='mini' className='flex items-center gap-2px !px-4px'>
            <CheckOne theme='filled' size='11' />
            <span>{t('specs.statusDone', { defaultValue: 'DONE' })}</span>
          </Tag>
        );
      case 'in_progress':
        return (
          <Tag color='arcoblue' size='mini' className='animate-pulse !px-4px'>
            {t('specs.statusInProgress', { defaultValue: 'IN PROGRESS' })}
          </Tag>
        );
      case 'todo':
      default:
        return (
          <Tag color='gray' size='mini' className='!px-4px'>
            {t('specs.statusTodo', { defaultValue: 'TODO' })}
          </Tag>
        );
    }
  };

  return (
    <div className='flex flex-col gap-10px p-10px overflow-y-auto max-h-full'>
      {/* Board top actions */}
      <div className='flex items-center justify-between gap-6px pb-8px border-b border-[var(--bg-3)] shrink-0'>
        <div className='flex items-baseline gap-6px min-w-0 flex-1'>
          <span className='font-semibold text-13px text-t-primary truncate'>
            {t('specs.taskChecklist', { defaultValue: 'Tasks' })}
          </span>
          <span className='text-11px text-t-secondary whitespace-nowrap'>
            {spec.summary.completed_tasks}/{spec.summary.total_tasks} (
            {spec.summary.total_tasks > 0
              ? Math.round((spec.summary.completed_tasks / spec.summary.total_tasks) * 100)
              : 0}
            %)
          </span>
        </div>
        <Button
          type='secondary'
          size='mini'
          className='shrink-0 !h-22px !px-8px !text-11px !rounded-4px !bg-fill-2 hover:!bg-fill-3 flex items-center gap-4px border border-[var(--bg-3)] transition-colors'
          icon={<SendOne theme='outline' size='12' className='text-primary-6' />}
          onClick={handleRunAll}
        >
          <span className='text-t-primary hover:text-primary-6 font-medium'>
            {t('specs.runAllTasks', { defaultValue: 'Run All' })}
          </span>
        </Button>
      </div>

      {/* Waves list */}
      {spec.waves.length === 0 ? (
        <div className='text-center py-24px text-t-secondary text-13px'>
          {t('specs.noTasks', { defaultValue: 'No tasks found in tasks.md' })}
        </div>
      ) : (
        spec.waves.map((wave) => {
          const waveCompleted = wave.tasks.filter((t) => t.status === 'completed').length;
          const waveTotal = wave.tasks.length;
          const wavePercent = waveTotal > 0 ? Math.round((waveCompleted / waveTotal) * 100) : 0;

          return (
            <div key={wave.number} className='rounded-8px border border-[var(--bg-3)] bg-fill-0 p-8px flex flex-col gap-6px'>
              {/* Wave Header */}
              <div className='flex items-center justify-between gap-6px'>
                <div className='flex items-center gap-6px min-w-0 flex-1'>
                  <span className='font-medium text-12px text-t-primary truncate' title={wave.title}>
                    {wave.title}
                  </span>
                  <Tag size='mini' color={wavePercent === 100 ? 'green' : 'gray'} className='shrink-0'>
                    {waveCompleted}/{waveTotal} · {wavePercent}%
                  </Tag>
                </div>
                <Button
                  type='secondary'
                  size='mini'
                  className='shrink-0 !h-22px !px-6px !text-11px !rounded-4px !bg-fill-2 hover:!bg-fill-3 flex items-center gap-4px border border-[var(--bg-3)] transition-colors'
                  icon={<SendOne theme='outline' size='12' className='text-primary-6' />}
                  onClick={() => handleRunWave(wave)}
                >
                  <span className='text-t-primary hover:text-primary-6 font-medium'>
                    {t('specs.runWave', { defaultValue: 'Run Wave' })}
                  </span>
                </Button>
              </div>

              {/* Tasks in wave */}
              <div className='flex flex-col gap-6px'>
                {wave.tasks.map((task) => {
                  const isPatching = patchingTaskId === task.id;
                  const isCompleted = task.status === 'completed';

                  return (
                    <div
                      key={task.id}
                      className={`flex flex-col p-8px rounded-6px border transition-colors ${
                        isCompleted
                          ? 'border-[var(--bg-2)] bg-[var(--bg-1)] opacity-70'
                          : 'border-[var(--bg-3)] bg-fill-1 hover:border-primary-6'
                      } ${isMobile ? 'min-h-48px' : 'min-h-36px'}`}
                      style={{ marginLeft: `${task.indent * 10}px` }}
                      onClick={() => {
                        if (isMobile) {
                          setSelectedMobileTask(task);
                        }
                      }}
                    >
                      {/* Top row: Checkbox, ID, Status Badge & Run Button */}
                      <div className='flex items-center justify-between gap-6px'>
                        <div className='flex items-center gap-6px min-w-0'>
                          <Checkbox
                            checked={isCompleted}
                            disabled={isPatching}
                            onChange={() => handleToggleTaskStatus(task)}
                            className='shrink-0'
                          />
                          <span className='text-11px font-mono text-t-secondary font-semibold shrink-0'>
                            {task.id}
                          </span>
                        </div>

                        <div className='flex items-center gap-4px shrink-0'>
                          {renderStatusBadge(task.status)}
                          {!isMobile && (
                            <Tooltip content={t('specs.runTaskTooltip', { defaultValue: 'Send task prompt to chat' })} mini>
                              <Button
                                type='text'
                                size='mini'
                                className='!p-2px text-t-secondary hover:text-primary-6'
                                icon={<SendOne theme='outline' size='13' />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRunTask(task);
                                }}
                              />
                            </Tooltip>
                          )}
                        </div>
                      </div>

                      {/* Content row: Title & refs with clean indent matching checkbox */}
                      <div className='mt-4px pl-22px flex flex-col gap-2px'>
                        <div
                          className={`text-12px leading-snug break-words ${
                            isCompleted ? 'line-through text-t-secondary' : 'text-t-primary font-medium'
                          }`}
                        >
                          {task.title}
                        </div>
                        {task.refs && task.refs.length > 0 && (
                          <div className='flex items-center gap-4px flex-wrap mt-2px'>
                            {task.refs.map((r) => (
                              <Tag key={r} size='mini' color='blue'>
                                {r}
                              </Tag>
                            ))}
                          </div>
                        )}
                        {task.description && (
                          <span className='text-11px text-t-secondary mt-2px whitespace-pre-line leading-normal opacity-80'>
                            {task.description}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      {/* Mobile Action Sheet Modal */}
      {selectedMobileTask && (
        <Modal
          visible={Boolean(selectedMobileTask)}
          title={selectedMobileTask.title}
          footer={null}
          onCancel={() => setSelectedMobileTask(null)}
          className='mobile-task-actions-modal'
        >
          <div className='flex flex-col gap-10px py-8px'>
            <div className='text-12px text-t-secondary'>
              Task {selectedMobileTask.id} · Status: {selectedMobileTask.status}
            </div>
            <Button
              type='primary'
              size='large'
              long
              icon={<SendOne theme='outline' size='16' />}
              onClick={() => {
                handleRunTask(selectedMobileTask);
                setSelectedMobileTask(null);
              }}
            >
              {t('specs.runThisTaskInChat', { defaultValue: 'Run this task in chat' })}
            </Button>
            <Button
              type='secondary'
              size='large'
              long
              icon={<CheckOne theme='outline' size='16' />}
              onClick={() => {
                void handleToggleTaskStatus(selectedMobileTask);
                setSelectedMobileTask(null);
              }}
            >
              {selectedMobileTask.status === 'completed'
                ? t('specs.markAsTodo', { defaultValue: 'Mark as Todo' })
                : t('specs.markAsCompleted', { defaultValue: 'Mark as Completed' })}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
};
