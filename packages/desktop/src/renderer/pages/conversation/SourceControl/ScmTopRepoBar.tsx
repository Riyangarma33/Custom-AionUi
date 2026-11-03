/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Dropdown, Menu } from '@arco-design/web-react';
import { BranchTwo, Down, FolderCode, Link, RightBranchOne } from '@icon-park/react';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { ScmRepository } from './scmModel';
import { groupRepositories, type ScmRepoNode } from './scmRepoTree';

const MenuDivider: React.FC = () => <div className='h-1px bg-[var(--color-border-2)] my-4px mx-8px' />;

export type ScmTopRepoBarProps = {
  repositories: ScmRepository[];
  selectedRepo: ScmRepository;
  onSelectRepo: (repoId: string) => void;
};

export const ScmTopRepoBar: React.FC<ScmTopRepoBarProps> = ({
  repositories,
  selectedRepo,
  onSelectRepo,
}) => {
  const { t } = useTranslation();
  const repoLabel = selectedRepo.pe_name || selectedRepo.label || selectedRepo.repo_id;
  const isSelectedSubmodule = selectedRepo.is_submodule;

  const groups = useMemo(() => groupRepositories(repositories), [repositories]);
  const primaryGroups = useMemo(
    () => groups.filter((g) => g.kind === 'primary' || g.kind === 'orphanWorktree'),
    [groups]
  );
  const orphanSubmoduleGroups = useMemo(
    () => groups.filter((g) => g.kind === 'orphanSubmodule'),
    [groups]
  );

  const countSubmodules = (nodes: ScmRepoNode[]): number =>
    nodes.reduce((acc, node) => acc + 1 + countSubmodules(node.submodules), 0);

  const totalSubmodules = useMemo(() => {
    let count = 0;
    for (const g of primaryGroups) count += countSubmodules(g.submodules);
    for (const g of orphanSubmoduleGroups) count += 1 + countSubmodules(g.submodules);
    return count;
  }, [primaryGroups, orphanSubmoduleGroups]);

  const renderSubmoduleNodes = (nodes: ScmRepoNode[], parentName?: string, depth = 0): React.ReactNode => {
    return nodes.map((subNode) => {
      const sub = subNode.repo;
      const rawName = sub.pe_name || sub.label;
      const displayName =
        depth > 0 && parentName && rawName.startsWith(parentName + '/')
          ? rawName.slice(parentName.length + 1)
          : rawName;

      return (
        <React.Fragment key={sub.repo_id}>
          <Menu.Item key={sub.repo_id}>
            <div
              className='flex items-center gap-6px text-12px'
              style={{ paddingLeft: `${depth * 14}px` }}
            >
              {depth > 0 && (
                <span className='text-t-tertiary font-mono text-11px select-none flex-shrink-0 leading-none'>↳</span>
              )}
              <Link theme='outline' size='12' className='text-t-secondary flex-shrink-0' />
              <span className='truncate text-t-primary'>{displayName}</span>
              {sub.gitlink_diverged && (
                <span className='px-3px py-0.5px rd-2px bg-amber-500/15 text-amber-600 dark:text-amber-400 text-9px font-medium font-mono flex-shrink-0'>
                  diverged
                </span>
              )}
              {sub.head?.name && (
                <span className='text-t-secondary text-11px font-mono ms-auto flex-shrink-0 ps-8px'>
                  ({sub.head.name})
                </span>
              )}
            </div>
          </Menu.Item>
          {subNode.submodules.length > 0 &&
            renderSubmoduleNodes(subNode.submodules, rawName, depth + 1)}
        </React.Fragment>
      );
    });
  };

  const repoMenu = (
    <Menu selectedKeys={[selectedRepo.repo_id]} onClickMenuItem={onSelectRepo} className='min-w-240px max-w-360px max-h-380px overflow-y-auto'>
      {totalSubmodules > 0 && (
        <div className='px-10px pt-6px pb-2px text-10px font-semibold uppercase tracking-wider text-t-tertiary select-none'>
          {t('conversation.explorer.scm.sections.repositories', 'Repositories')}
        </div>
      )}
      {primaryGroups.map((g) => (
        <React.Fragment key={g.repo.repo_id}>
          <Menu.Item key={g.repo.repo_id}>
            <div className='flex items-center gap-6px text-12px'>
              <FolderCode theme='outline' size='14' className='text-t-secondary flex-shrink-0' />
              <span className='truncate font-medium text-t-primary'>{g.repo.pe_name || g.repo.label}</span>
              {g.repo.head?.name && (
                <span className='text-t-secondary text-11px font-mono ms-auto flex-shrink-0 ps-8px'>
                  ({g.repo.head.name})
                </span>
              )}
            </div>
          </Menu.Item>
          {g.worktrees.map((wt) => (
            <Menu.Item key={wt.repo_id}>
              <div className='flex items-center gap-6px text-12px ps-14px'>
                <RightBranchOne theme='outline' size='12' className='text-t-tertiary flex-shrink-0' />
                <span className='truncate text-t-primary'>{wt.pe_name || wt.label}</span>
                {wt.head?.name && (
                  <span className='text-t-secondary text-11px font-mono ms-auto flex-shrink-0 ps-8px'>
                    ({wt.head.name})
                  </span>
                )}
              </div>
            </Menu.Item>
          ))}
        </React.Fragment>
      ))}

      {totalSubmodules > 0 && (
        <>
          <MenuDivider />
          <div className='px-10px pt-6px pb-2px text-10px font-semibold uppercase tracking-wider text-t-tertiary select-none flex items-center justify-between'>
            <span>{t('conversation.explorer.scm.submodule', 'Submodules')}</span>
            <span className='font-mono text-10px opacity-75'>({totalSubmodules})</span>
          </div>
          {primaryGroups.map((g) => renderSubmoduleNodes(g.submodules, g.repo.pe_name || g.repo.label))}
          {orphanSubmoduleGroups.map((g) => (
            <React.Fragment key={g.repo.repo_id}>
              <Menu.Item key={g.repo.repo_id}>
                <div className='flex items-center gap-6px text-12px'>
                  <Link theme='outline' size='12' className='text-t-secondary flex-shrink-0' />
                  <span className='truncate text-t-primary'>{g.repo.pe_name || g.repo.label}</span>
                  {g.repo.head?.name && (
                    <span className='text-t-secondary text-11px font-mono ms-auto flex-shrink-0 ps-8px'>
                      ({g.repo.head.name})
                    </span>
                  )}
                </div>
              </Menu.Item>
              {g.submodules.length > 0 && renderSubmoduleNodes(g.submodules, g.repo.pe_name || g.repo.label, 1)}
            </React.Fragment>
          ))}
        </>
      )}
    </Menu>
  );

  return (
    <div
      data-scm-top-repo-bar
      className='flex-shrink-0 flex items-center justify-between gap-6px px-8px py-4px border-b border-[var(--color-border-2)] bg-[var(--color-bg-2)] min-h-32px'
    >
      <div className='flex items-center gap-6px min-w-0 flex-1 overflow-hidden'>
        <Dropdown droplist={repoMenu} trigger='click' position='bl'>
          <button
            type='button'
            data-scm-top-repo-chip
            className='flex items-center gap-5px px-7px py-2.5px rd-6px border border-[var(--color-border-2)] bg-[var(--color-bg-1)] hover:bg-[var(--color-fill-2)] text-t-primary text-12px font-medium min-w-0 max-w-full flex-shrink transition-colors cursor-pointer overflow-hidden'
            title={repoLabel}
          >
            {isSelectedSubmodule ? (
              <Link theme='outline' size='13' className='text-t-secondary flex-shrink-0' />
            ) : (
              <FolderCode theme='outline' size='13' className='text-t-secondary flex-shrink-0' />
            )}
            <span className='truncate min-w-0 flex-1 text-left'>{repoLabel}</span>
            <Down theme='outline' size='10' className='text-t-tertiary flex-shrink-0' />
          </button>
        </Dropdown>
      </div>
      {selectedRepo.head?.name && (
        <span className='flex items-center gap-3px text-t-secondary text-11px font-mono flex-shrink-0 ps-4px'>
          <BranchTwo theme='outline' size='12' className='flex-shrink-0' />
          <span className='max-w-90px truncate'>{selectedRepo.head.name}</span>
        </span>
      )}
    </div>
  );
};
