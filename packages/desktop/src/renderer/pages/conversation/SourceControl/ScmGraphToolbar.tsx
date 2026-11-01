/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import { BranchTwo, Down, FolderCode, Refresh } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import type { ScmBranchRef, ScmRepository } from './scmModel';

export const LocateHeadIcon: React.FC<{ size?: number; className?: string }> = ({ size = 14, className }) => (
  <svg
    width={size}
    height={size}
    viewBox='0 0 16 16'
    fill='none'
    stroke='currentColor'
    strokeWidth='1.5'
    className={className}
    aria-hidden='true'
  >
    <circle cx='8' cy='8' r='6' />
    <circle cx='8' cy='8' r='2.5' fill='currentColor' />
  </svg>
);

const MenuDivider: React.FC = () => <div className='h-1px bg-[var(--color-border-2)] my-4px mx-8px' />;

export type ScmGraphToolbarProps = {
  repositories: ScmRepository[];
  selectedRepoId: string;
  onSelectRepo: (repoId: string) => void;
  branches: ScmBranchRef[];
  currentBranch?: string;
  selectedBranch: string;
  onSelectBranch: (branch: string) => void;
  onLocateHead: () => void;
  onRefresh: () => void;
  loading: boolean;
};

export const ScmGraphToolbar: React.FC<ScmGraphToolbarProps> = ({
  repositories,
  selectedRepoId,
  onSelectRepo,
  branches,
  currentBranch,
  selectedBranch,
  onSelectBranch,
  onLocateHead,
  onRefresh,
  loading,
}) => {
  const { t } = useTranslation();

  const selectedRepo = repositories.find((r) => r.repo_id === selectedRepoId) ?? repositories[0];
  const repoLabel = selectedRepo?.pe_name || selectedRepo?.label || selectedRepoId;

  // Repo dropdown list
  const repoMenu = (
    <Menu selectedKeys={[selectedRepoId]} onClickMenuItem={onSelectRepo}>
      {repositories.map((repo) => (
        <Menu.Item key={repo.repo_id}>
          <div className='flex items-center gap-6px text-12px'>
            <FolderCode theme='outline' size='14' className='text-t-tertiary flex-shrink-0' />
            <span className='truncate font-medium'>{repo.pe_name || repo.label}</span>
            {repo.is_submodule && (
              <span className='px-4px py-0.5px rd-2px bg-[var(--color-fill-2)] text-t-tertiary text-10px'>
                submodule
              </span>
            )}
            {repo.head?.name && (
              <span className='text-t-tertiary text-11px font-mono ms-auto'>({repo.head.name})</span>
            )}
          </div>
        </Menu.Item>
      ))}
    </Menu>
  );

  // Branch filter dropdown list
  const branchMenu = (
    <Menu selectedKeys={[selectedBranch]} onClickMenuItem={onSelectBranch}>
      <Menu.Item key='current'>
        <div className='flex items-center gap-6px text-12px'>
          <BranchTwo theme='outline' size='14' className='text-t-tertiary flex-shrink-0' />
          <span>{t('conversation.explorer.scm.currentBranch', 'Current Branch')}</span>
          {currentBranch && <span className='text-t-tertiary text-11px font-mono'>({currentBranch})</span>}
        </div>
      </Menu.Item>
      <Menu.Item key='all'>
        <div className='flex items-center gap-6px text-12px'>
          <BranchTwo theme='outline' size='14' className='text-t-tertiary flex-shrink-0' />
          <span>{t('conversation.explorer.scm.allBranches', 'All Branches')}</span>
        </div>
      </Menu.Item>
      {branches.length > 0 && <MenuDivider />}
      {branches.map((b) => (
        <Menu.Item key={b.name}>
          <div className='flex items-center gap-6px text-12px'>
            <BranchTwo theme='outline' size='14' className='text-t-tertiary flex-shrink-0' />
            <span className='font-mono truncate'>{b.name}</span>
            {b.is_current && (
              <span className='px-4px py-0.5px rd-2px bg-[var(--color-primary-light-1)] text-[var(--color-primary-6)] text-10px ms-auto'>
                HEAD
              </span>
            )}
          </div>
        </Menu.Item>
      ))}
    </Menu>
  );

  const branchDisplayLabel =
    selectedBranch === 'current'
      ? currentBranch
        ? `${t('conversation.explorer.scm.currentBranch', 'Current')}: ${currentBranch}`
        : t('conversation.explorer.scm.currentBranch', 'Current Branch')
      : selectedBranch === 'all'
        ? t('conversation.explorer.scm.allBranches', 'All Branches')
        : selectedBranch;

  return (
    <div
      data-scm-graph-toolbar
      className='flex-shrink-0 flex items-center justify-between gap-6px px-8px py-3px border-b border-[var(--color-border-1)] bg-[var(--color-bg-2)] min-h-28px text-12px'
    >
      <div className='flex items-center gap-6px min-w-0 flex-1'>
        {/* Repo selector dropdown chip (shown when multi-repo or for clarity) */}
        {repositories.length > 1 && (
          <Dropdown droplist={repoMenu} trigger='click' position='bl'>
            <button
              type='button'
              data-scm-graph-repo-chip
              className='flex items-center gap-4px px-6px py-1px rd-4px border border-[var(--color-border-2)] bg-[var(--color-bg-1)] hover:bg-[var(--color-fill-2)] text-t-primary text-11px max-w-130px transition-colors cursor-pointer'
              title={repoLabel}
            >
              <FolderCode theme='outline' size='12' className='text-t-tertiary flex-shrink-0' />
              <span className='truncate'>{repoLabel}</span>
              <Down theme='outline' size='10' className='text-t-tertiary flex-shrink-0' />
            </button>
          </Dropdown>
        )}

        {/* Branch filter dropdown chip */}
        <Dropdown droplist={branchMenu} trigger='click' position='bl'>
          <button
            type='button'
            data-scm-graph-branch-chip
            className='flex items-center gap-4px px-6px py-1px rd-4px border border-[var(--color-border-2)] bg-[var(--color-bg-1)] hover:bg-[var(--color-fill-2)] text-t-primary text-11px max-w-160px transition-colors cursor-pointer'
            title={branchDisplayLabel}
          >
            <BranchTwo theme='outline' size='12' className='text-t-tertiary flex-shrink-0' />
            <span className='truncate'>{branchDisplayLabel}</span>
            <Down theme='outline' size='10' className='text-t-tertiary flex-shrink-0' />
          </button>
        </Dropdown>
      </div>

      <div className='flex items-center gap-2px flex-shrink-0'>
        {/* Locate HEAD button */}
        <Tooltip content={t('conversation.explorer.scm.locateHead', 'Locate HEAD')} mini position='br'>
          <Button
            type='text'
            size='mini'
            data-scm-graph-locate-head
            className='flex items-center justify-center w-22px h-22px p-0 text-t-tertiary hover:text-t-primary'
            icon={<LocateHeadIcon />}
            onClick={onLocateHead}
            aria-label={t('conversation.explorer.scm.locateHead', 'Locate HEAD')}
          />
        </Tooltip>

        {/* Refresh button */}
        <Tooltip content={t('conversation.explorer.scm.refresh', 'Refresh')} mini position='br'>
          <Button
            type='text'
            size='mini'
            loading={loading}
            data-scm-graph-refresh
            className='flex items-center justify-center w-22px h-22px p-0 text-t-tertiary hover:text-t-primary'
            icon={<Refresh theme='outline' size='14' />}
            onClick={onRefresh}
            aria-label={t('conversation.explorer.scm.refresh', 'Refresh')}
          />
        </Tooltip>
      </div>
    </div>
  );
};
