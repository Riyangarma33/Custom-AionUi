/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Button, Input, Progress, Radio, Spin, Tag } from '@arco-design/web-react';
import { ListCheckbox, Plus, Search } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import { ipcBridge } from '@/common';
import { getRelativeSpecPath } from '@/common/types/specs';
import { NewSpecModal } from './NewSpecModal';
import { SpecDetailPanel } from './SpecDetailPanel';

interface SpecsListPanelProps {
  projectId: string;
  isMobile?: boolean;
}

type FilterStatus = 'all' | 'active' | 'completed';

export const SpecsListPanel: React.FC<SpecsListPanelProps> = ({ projectId, isMobile }) => {
  const { t } = useTranslation();
  const [selectedSpecId, setSelectedSpecId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);

  const { data: specs, isLoading, mutate } = useSWR(
    projectId ? `project-specs/${projectId}` : null,
    async () => {
      return ipcBridge.project.specs.list.invoke({ project_id: projectId });
    }
  );

  if (selectedSpecId) {
    return (
      <SpecDetailPanel
        projectId={projectId}
        specId={selectedSpecId}
        onBack={() => {
          setSelectedSpecId(null);
          void mutate();
        }}
        isMobile={isMobile}
      />
    );
  }

  const filteredSpecs = (specs || []).filter((s) => {
    // Status filter
    if (filterStatus === 'active' && s.current_phase === 'completed') {
      return false;
    }
    if (filterStatus === 'completed' && s.current_phase !== 'completed') {
      return false;
    }
    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return s.title.toLowerCase().includes(q) || s.id.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className='flex flex-col h-full bg-1'>
      {/* Top Header Controls */}
      <div className='flex flex-col gap-8px p-12px border-b border-[var(--bg-3)] shrink-0'>
        <div className='flex items-center justify-between gap-8px'>
          <span className='font-semibold text-14px text-t-primary'>
            {t('specs.titleHeader', { defaultValue: 'Specifications' })}
          </span>
          <Button
            type='primary'
            size='small'
            icon={<Plus theme='outline' size='14' />}
            onClick={() => setIsNewModalOpen(true)}
          >
            {t('specs.newSpecBtn', { defaultValue: 'New Spec' })}
          </Button>
        </div>

        {/* Filter & Search Bar */}
        <div className='flex items-center gap-6px'>
          <Radio.Group
            type='button'
            size='mini'
            value={filterStatus}
            onChange={(val) => setFilterStatus(val as FilterStatus)}
          >
            <Radio value='all'>{t('common.all', { defaultValue: 'All' })}</Radio>
            <Radio value='active'>{t('specs.filterActive', { defaultValue: 'Active' })}</Radio>
            <Radio value='completed'>{t('specs.filterCompleted', { defaultValue: 'Done' })}</Radio>
          </Radio.Group>

          <Input
            size='mini'
            prefix={<Search theme='outline' size='12' />}
            placeholder={t('specs.searchPlaceholder', { defaultValue: 'Search specs...' })}
            value={searchQuery}
            onChange={setSearchQuery}
            allowClear
            className='flex-1 min-w-0'
          />
        </div>
      </div>

      {/* Spec Cards List */}
      <div className='flex-1 min-h-0 overflow-y-auto p-12px flex flex-col gap-8px'>
        {isLoading && (
          <div className='flex items-center justify-center p-24px'>
            <Spin loading />
          </div>
        )}

        {!isLoading && filteredSpecs.length === 0 && (
          <div className='text-center py-36px text-t-secondary flex flex-col items-center gap-8px'>
            <ListCheckbox theme='outline' size='28' className='opacity-40' />
            <span className='text-13px'>
              {searchQuery
                ? t('specs.noMatchingSpecs', { defaultValue: 'No specifications match your search' })
                : t('specs.emptyState', { defaultValue: 'No specifications yet. Create one to begin Spec-Driven Development.' })}
            </span>
            {!searchQuery && (
              <Button type='outline' size='small' onClick={() => setIsNewModalOpen(true)}>
                {t('specs.createFirstSpec', { defaultValue: 'Create First Spec' })}
              </Button>
            )}
          </div>
        )}

        {filteredSpecs.map((spec) => {
          const percent =
            spec.total_tasks > 0 ? Math.round((spec.completed_tasks / spec.total_tasks) * 100) : 0;

          return (
            <div
              key={spec.id}
              role='button'
              tabIndex={0}
              aria-label={`Specification: ${spec.title}`}
              onClick={() => setSelectedSpecId(spec.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setSelectedSpecId(spec.id);
                }
              }}
              className='p-10px rounded-8px border border-[var(--bg-3)] bg-fill-0 hover:border-primary-6 hover:bg-fill-1 cursor-pointer transition-all flex flex-col gap-6px shadow-sm'
            >
              {/* Header row: title and badges */}
              <div className='flex items-start justify-between gap-8px'>
                <span className='font-medium text-13px text-t-primary truncate' title={spec.title}>
                  {spec.title}
                </span>
                <Tag size='mini' color={spec.spec_type === 'bugfix' ? 'gold' : 'arcoblue'} className='shrink-0'>
                  {spec.spec_type.toUpperCase()}
                </Tag>
              </div>

              {/* Progress & wave info */}
              <div className='flex items-center justify-between text-11px text-t-secondary'>
                <span>
                  {spec.completed_tasks}/{spec.total_tasks} {t('specs.tasksLabel', { defaultValue: 'tasks' })} ({percent}%)
                </span>
                <Tag size='mini' color='blue' className='capitalize'>
                  {spec.current_phase}
                </Tag>
              </div>

              <Progress percent={percent} size='mini' status={percent === 100 ? 'success' : 'normal'} />

              {/* Footer info: location & date */}
              <div className='flex items-center justify-between text-10px text-t-secondary pt-2px min-w-0'>
                <span className='font-mono opacity-70 truncate max-w-160px' title={getRelativeSpecPath(spec)}>
                  {getRelativeSpecPath(spec)}
                </span>
                <span className='shrink-0'>{new Date(spec.updated_at).toLocaleDateString()}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* New Spec Wizard Modal */}
      <NewSpecModal
        visible={isNewModalOpen}
        projectId={projectId}
        onClose={() => setIsNewModalOpen(false)}
        onCreated={(newSpec) => {
          void mutate();
          setSelectedSpecId(newSpec.summary.id);
        }}
      />
    </div>
  );
};
