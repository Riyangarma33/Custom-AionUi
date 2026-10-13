/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Button, Input, Message, Modal, Spin, Tag } from '@arco-design/web-react';
import { Check, Edit, Left, PreviewOpen } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type { SpecDetail, SpecPhase } from '@/common/types/specs';
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

export const SpecDetailPanel: React.FC<SpecDetailPanelProps> = ({
  projectId,
  specId,
  onBack,
  isMobile,
}) => {
  const { t } = useTranslation();
  const [spec, setSpec] = useState<SpecDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<SpecSubTab>('tasks');

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
          <div className='p-16px flex flex-col gap-12px text-13px text-t-primary'>
            <div className='rounded-8px border border-[var(--bg-3)] p-12px flex flex-col gap-6px'>
              <span className='font-semibold text-14px'>{t('specs.metadata', { defaultValue: 'Spec Metadata' })}</span>
              <div className='flex items-center justify-between text-12px text-t-secondary'>
                <span>Location:</span>
                <span className='font-mono'>{spec.summary.directory_path}</span>
              </div>
              <div className='flex items-center justify-between text-12px text-t-secondary'>
                <span>Workflow:</span>
                <span>{spec.summary.workflow}</span>
              </div>
              <div className='flex items-center justify-between text-12px text-t-secondary'>
                <span>Progress:</span>
                <span>
                  {spec.summary.completed_tasks} of {spec.summary.total_tasks} tasks completed
                </span>
              </div>
              <div className='flex items-center justify-between text-12px text-t-secondary'>
                <span>Linked Conversation:</span>
                <span>{spec.summary.linked_conversation_id || 'None'}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
