/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Drawer, Spin } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type { SpecDetail } from '@/common/types/specs';
import { SpecTaskBoard } from './SpecTaskBoard';

interface SpecTaskDrawerProps {
  visible: boolean;
  onClose: () => void;
  projectId: string;
  specId: string;
}

export const SpecTaskDrawer: React.FC<SpecTaskDrawerProps> = ({
  visible,
  onClose,
  projectId,
  specId,
}) => {
  const { t } = useTranslation();
  const [spec, setSpec] = useState<SpecDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !projectId || !specId) return;
    let alive = true;
    const fetchSpec = async () => {
      setLoading(true);
      try {
        const data = await ipcBridge.project.specs.get.invoke({ project_id: projectId, spec_id: specId });
        if (alive) {
          setSpec(data);
        }
      } catch (e) {
        console.error('Failed to load spec in drawer:', e);
      } finally {
        if (alive) setLoading(false);
      }
    };
    void fetchSpec();
    return () => {
      alive = false;
    };
  }, [visible, projectId, specId]);

  return (
    <Drawer
      visible={visible}
      onCancel={onClose}
      onOk={onClose}
      title={spec?.summary.title || t('specs.activeSpec', { defaultValue: 'Active Specification' })}
      width={460}
      footer={null}
    >
      {loading || !spec ? (
        <div className='flex items-center justify-center h-full p-24px'>
          <Spin loading />
        </div>
      ) : (
        <SpecTaskBoard
          projectId={projectId}
          spec={spec}
          onSpecUpdated={setSpec}
        />
      )}
    </Drawer>
  );
};
