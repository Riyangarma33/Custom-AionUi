/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ListCheckbox, Right } from '@icon-park/react';
import useSWR from 'swr';
import { ipcBridge } from '@/common';
import RuntimeSelectorPill from '@/renderer/components/agent/RuntimeSelectorPill';
import { SpecTaskDrawer } from './SpecTaskDrawer';

interface SpecHeaderPillProps {
  projectId?: string;
  activeSpecId?: string;
}

export const SpecHeaderPill: React.FC<SpecHeaderPillProps> = ({ projectId, activeSpecId }) => {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: spec } = useSWR(
    projectId && activeSpecId ? `header-spec/${projectId}/${activeSpecId}` : null,
    async () => {
      if (!projectId || !activeSpecId) return null;
      return ipcBridge.project.specs.get.invoke({ project_id: projectId, spec_id: activeSpecId });
    },
    { revalidateOnFocus: true }
  );

  if (!projectId || !activeSpecId || !spec) {
    return null;
  }

  const wave = spec.summary.active_wave;
  const completed = spec.summary.completed_tasks;
  const total = spec.summary.total_tasks;

  return (
    <>
      <RuntimeSelectorPill
        testId='spec-header-pill'
        className='header-spec-btn'
        onClick={() => setDrawerOpen(true)}
        title={spec.summary.title}
        aria-label={`Specification: ${spec.summary.title}`}
        leading={
          <ListCheckbox
            theme='outline'
            size={14}
            className='shrink-0 text-primary-6'
            style={{ lineHeight: 0 }}
          />
        }
        trailing={
          <Right
            theme='outline'
            size={11}
            className='shrink-0 opacity-60 text-t-secondary'
            aria-hidden='true'
          />
        }
      >
        <span className='flex items-center gap-4px min-w-0'>
          <span className='text-12px text-t-primary font-medium truncate max-w-130px'>
            {spec.summary.id}
          </span>
          <span className='text-11px text-t-secondary opacity-75 whitespace-nowrap'>
            · Wave {wave} ({completed}/{total})
          </span>
        </span>
      </RuntimeSelectorPill>

      <SpecTaskDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        projectId={projectId}
        specId={activeSpecId}
      />
    </>
  );
};
