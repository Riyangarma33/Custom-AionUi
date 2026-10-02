/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Undo } from '@icon-park/react';
import classNames from 'classnames';
import React from 'react';
import { useTranslation } from 'react-i18next';

export interface RevertDockProps {
  rolledBackCount: number;
  onRestore: () => void;
  className?: string;
}

const RevertDock: React.FC<RevertDockProps> = ({ rolledBackCount, onRestore, className }) => {
  const { t } = useTranslation();

  return (
    <div
      data-testid='revert-dock'
      className={classNames(
        'flex items-center justify-between px-12px py-6px mb-8px rounded-8px text-12px transition-all select-none',
        className
      )}
      style={{
        background: 'var(--color-fill-2)',
        border: '1px solid var(--color-border-2)',
      }}
    >
      <div className='flex items-center gap-6px min-w-0 text-t-secondary'>
        <Undo theme='outline' size='14' className='flex-shrink-0' />
        <span className='truncate font-medium' data-testid='revert-dock-count'>
          {t('messages.revert.dock.rolledBackCount', {
            count: rolledBackCount,
            defaultValue: `${rolledBackCount} rolled back message(s)`,
          })}
        </span>
      </div>
      <button
        type='button'
        data-testid='revert-dock-restore-btn'
        onClick={onRestore}
        className='ml-12px px-8px py-2px rounded-4px font-medium cursor-pointer transition-colors text-primary hover:bg-3 border-none bg-transparent flex-shrink-0'
      >
        {t('messages.revert.dock.restore', { defaultValue: 'Restore message' })}
      </button>
    </div>
  );
};

export default React.memo(RevertDock);
