/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Dropdown, Menu, Message, Spin, Tooltip } from '@arco-design/web-react';
import {
  Copy,
  Down,
  MessageOne,
  MoreOne,
  Right,
  Robot,
} from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { requestConversationSendBoxPrefill } from '@/renderer/hooks/chat/useSendBoxDraft';
import { useCurrentConversation } from '../explorer/currentConversationStore';
import type {
  ContentRef,
  ScmBranchRef,
  ScmCommitDetails,
  ScmCommitNode,
  ScmRefLabel,
  ScmRepository,
  ScmResource,
} from './scmModel';
import { fetchScmCommitDetails, fetchScmHistory } from './scmStore';
import { ScmGraphToolbar } from './ScmGraphToolbar';

export const LANE_COLORS = [
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#10b981', // emerald
  '#ec4899', // rose
  '#06b6d4', // cyan
];

export type LaneRoute = {
  fromLane: number;
  toLane: number;
  type: 'straight' | 'branch' | 'merge';
  color: string;
};

export type ComputedCommitRow = {
  commit: ScmCommitNode;
  lane: number;
  color: string;
  isHead: boolean;
  isMerge: boolean;
  activeLanes: number[];
  routes: LaneRoute[];
};

/**
 * Lightweight client-side topological lane allocator (stateless per commit batch).
 */
export function computeDagLayout(commits: ScmCommitNode[]): {
  rows: ComputedCommitRow[];
  maxLane: number;
} {
  const rows: ComputedCommitRow[] = [];
  const activeLanes: (string | null)[] = [];
  let maxLaneSeen = 0;

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];
    let lane = activeLanes.indexOf(commit.sha);

    if (lane === -1) {
      const emptySlot = activeLanes.indexOf(null);
      if (emptySlot !== -1) {
        lane = emptySlot;
        activeLanes[lane] = commit.sha;
      } else {
        lane = activeLanes.length;
        activeLanes.push(commit.sha);
      }
    }

    if (lane > maxLaneSeen) {
      maxLaneSeen = lane;
    }

    const color = LANE_COLORS[lane % LANE_COLORS.length];
    const isMerge = commit.parents.length > 1;
    const routes: LaneRoute[] = [];

    const lanesPassingThrough: number[] = [];
    for (let l = 0; l < activeLanes.length; l++) {
      if (l !== lane && activeLanes[l] !== null) {
        lanesPassingThrough.push(l);
        routes.push({
          fromLane: l,
          toLane: l,
          type: 'straight',
          color: LANE_COLORS[l % LANE_COLORS.length],
        });
      }
    }

    if (commit.parents.length === 0) {
      activeLanes[lane] = null;
    } else {
      const primaryParent = commit.parents[0];
      const existingPrimaryLane = activeLanes.indexOf(primaryParent);

      if (existingPrimaryLane === -1) {
        activeLanes[lane] = primaryParent;
        routes.push({
          fromLane: lane,
          toLane: lane,
          type: 'straight',
          color,
        });
      } else {
        activeLanes[lane] = null;
        routes.push({
          fromLane: lane,
          toLane: existingPrimaryLane,
          type: 'merge',
          color,
        });
      }

      for (let p = 1; p < commit.parents.length; p++) {
        const parentSha = commit.parents[p];
        const existingLane = activeLanes.indexOf(parentSha);
        if (existingLane !== -1) {
          routes.push({
            fromLane: lane,
            toLane: existingLane,
            type: 'merge',
            color: LANE_COLORS[existingLane % LANE_COLORS.length],
          });
        } else {
          let newLane = activeLanes.indexOf(null);
          if (newLane === -1) {
            newLane = activeLanes.length;
            activeLanes.push(parentSha);
          } else {
            activeLanes[newLane] = parentSha;
          }
          if (newLane > maxLaneSeen) {
            maxLaneSeen = newLane;
          }
          routes.push({
            fromLane: lane,
            toLane: newLane,
            type: 'branch',
            color: LANE_COLORS[newLane % LANE_COLORS.length],
          });
        }
      }
    }

    while (activeLanes.length > 0 && activeLanes[activeLanes.length - 1] === null) {
      activeLanes.pop();
    }

    rows.push({
      commit,
      lane,
      color,
      isHead: commit.is_head,
      isMerge,
      activeLanes: lanesPassingThrough,
      routes,
    });
  }

  return { rows, maxLane: maxLaneSeen };
}

function formatRelativeTime(seconds: number): string {
  if (!seconds) return '';
  const diffSec = Math.max(0, Math.floor(Date.now() / 1000 - seconds));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return `${Math.floor(diffMonths / 12)}y ago`;
}

export type ScmGraphViewProps = {
  repo: ScmRepository;
  repositories: ScmRepository[];
  onSelectRepo: (repoId: string) => void;
  onOpenFileDiff: (diffTarget: {
    repoId: string;
    resource: ScmResource;
    from: ContentRef;
    to: ContentRef;
    commitShortSha: string;
  }) => void;
};

export const ScmGraphView: React.FC<ScmGraphViewProps> = ({
  repo,
  repositories,
  onSelectRepo,
  onOpenFileDiff,
}) => {
  const { t } = useTranslation();
  const activeConversationId = useCurrentConversation();

  const [commits, setCommits] = useState<ScmCommitNode[]>([]);
  const [branches, setBranches] = useState<ScmBranchRef[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string | undefined>(repo.head?.name);
  const [selectedBranch, setSelectedBranch] = useState<string>('current');
  const [loading, setLoading] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [totalCommits, setTotalCommits] = useState<number | undefined>(undefined);

  // Selected commit expansion
  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const [commitDetails, setCommitDetails] = useState<Record<string, ScmCommitDetails>>({});
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null);

  // Measure container width for mobile / compaction (<524px)
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(360);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const isNarrow = containerWidth < 524;
  const rowHeight = isNarrow ? 36 : 28;

  // Load commits on repo / branch change
  const loadInitialHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchScmHistory({
        repository: repo.repo_id,
        branch: selectedBranch === 'current' ? undefined : selectedBranch,
        limit: 50,
        offset: 0,
      });
      setCommits(res.commits);
      setBranches(res.branches);
      setCurrentBranch(res.current_branch ?? repo.head?.name);
      setTotalCommits(res.total);
      setHasMore(res.commits.length < (res.total ?? 0));
    } catch {
      // Ignore or empty
    } finally {
      setLoading(false);
    }
  }, [repo.repo_id, repo.head?.name, selectedBranch]);

  useEffect(() => {
    void loadInitialHistory();
  }, [loadInitialHistory]);

  // Load more on infinite scroll
  const loadMoreCommits = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const res = await fetchScmHistory({
        repository: repo.repo_id,
        branch: selectedBranch === 'current' ? undefined : selectedBranch,
        limit: 50,
        offset: commits.length,
      });
      setCommits((prev) => [...prev, ...res.commits]);
      setHasMore(commits.length + res.commits.length < (res.total ?? 0));
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, repo.repo_id, selectedBranch, commits.length]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>): void => {
    const target = e.currentTarget;
    if (target.scrollTop + target.clientHeight >= target.scrollHeight - 60) {
      void loadMoreCommits();
    }
  };

  // Locate HEAD
  const locateHead = (): void => {
    const headIndex = commits.findIndex((c) => c.is_head);
    if (headIndex !== -1 && containerRef.current) {
      const rowEl = containerRef.current.querySelector(`[data-scm-commit-row="${commits[headIndex].sha}"]`);
      if (rowEl) {
        rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  // Toggle commit expansion
  const toggleCommit = async (sha: string): Promise<void> => {
    if (selectedSha === sha) {
      setSelectedSha(null);
      return;
    }
    setSelectedSha(sha);
    if (!commitDetails[sha]) {
      setLoadingDetails(sha);
      try {
        const details = await fetchScmCommitDetails({
          repository: repo.repo_id,
          commit_id: sha,
        });
        setCommitDetails((prev) => ({ ...prev, [sha]: details }));
      } catch {
        // Error handling
      } finally {
        setLoadingDetails(null);
      }
    }
  };

  // Compute DAG Layout
  const { rows, maxLane } = useMemo(() => computeDagLayout(commits), [commits]);
  const laneColWidth = isNarrow ? 16 : Math.max(24, (maxLane + 1) * 16 + 8);

  // Ask Agent: Explain Commit
  const askAgentExplain = (commit: ScmCommitNode): void => {
    if (!activeConversationId) {
      Message.warning(t('conversation.explorer.scm.noActiveConversation', 'No active conversation found'));
      return;
    }
    const prompt = `Please analyze and explain the changes in commit ${commit.short_sha}: "${commit.subject}" (authored by ${commit.author_name}). Commit hash: ${commit.sha}`;
    requestConversationSendBoxPrefill(activeConversationId, prompt, { mode: 'replace' });
    Message.success(t('conversation.explorer.scm.sentToChat', 'Commit prompt sent to chat'));
  };

  return (
    <div data-scm-graph-view className='flex-1 min-h-0 flex flex-col bg-[var(--color-bg-1)]'>
      <ScmGraphToolbar
        repositories={repositories}
        selectedRepoId={repo.repo_id}
        onSelectRepo={onSelectRepo}
        branches={branches}
        currentBranch={currentBranch}
        selectedBranch={selectedBranch}
        onSelectBranch={setSelectedBranch}
        onLocateHead={locateHead}
        onRefresh={loadInitialHistory}
        loading={loading && commits.length === 0}
      />

      <div
        ref={containerRef}
        className='flex-1 min-h-0 overflow-auto'
        onScroll={handleScroll}
      >
        {commits.length === 0 && !loading && (
          <div className='p-16px text-center text-t-tertiary text-12px'>
            {t('conversation.explorer.scm.noCommits', 'No commit history found')}
          </div>
        )}

        {rows.map((row) => {
          const isSelected = selectedSha === row.commit.sha;
          const details = commitDetails[row.commit.sha];
          const isLoadingThis = loadingDetails === row.commit.sha;

          return (
            <React.Fragment key={row.commit.sha}>
              <CommitRow
                row={row}
                rowHeight={rowHeight}
                laneColWidth={laneColWidth}
                isNarrow={isNarrow}
                isSelected={isSelected}
                onToggle={() => void toggleCommit(row.commit.sha)}
                onAskAgent={() => askAgentExplain(row.commit)}
              />

              {/* Inline Expanded Commit Details */}
              {isSelected && (
                <div
                  data-scm-commit-expansion
                  className='bg-[var(--color-fill-1)] border-y border-[var(--color-border-2)] px-12px py-8px text-12px'
                >
                  {isLoadingThis && (
                    <div className='py-8px flex items-center justify-center gap-6px text-t-tertiary'>
                      <Spin size={14} />
                      <span>{t('conversation.explorer.scm.loadingDetails', 'Loading commit details...')}</span>
                    </div>
                  )}

                  {details && (
                    <div className='flex flex-col gap-8px'>
                      {/* Full message if multiline */}
                      {details.commit.message !== details.commit.subject && (
                        <div className='font-mono text-11px text-t-secondary whitespace-pre-wrap max-h-120px overflow-auto p-6px rd-4px bg-[var(--color-bg-2)] border border-[var(--color-border-1)]'>
                          {details.commit.message}
                        </div>
                      )}

                      {/* Author & Commit info */}
                      <div className='flex flex-wrap items-center gap-x-12px gap-y-4px text-11px text-t-tertiary'>
                        <span>
                          Author: <strong className='text-t-primary'>{details.commit.author_name}</strong> &lt;{details.commit.author_email}&gt;
                        </span>
                        <span>Date: {new Date(details.commit.author_timestamp * 1000).toLocaleString()}</span>
                        {details.commit.parents.length > 0 && (
                          <span>
                            Parents:{' '}
                            {details.commit.parents.map((p) => (
                              <span key={p} className='font-mono ms-4px text-[var(--color-primary-6)]'>
                                {p.slice(0, 7)}
                              </span>
                            ))}
                          </span>
                        )}
                      </div>

                      {/* Files touched */}
                      <div className='flex flex-col gap-4px mt-4px'>
                        <div className='text-11px font-medium text-t-secondary'>
                          {t('conversation.explorer.scm.changedFiles', 'Changed Files')} ({details.files.length})
                        </div>
                        <div className='flex flex-col gap-2px max-h-200px overflow-auto'>
                          {details.files.map((file) => (
                            <div
                              key={file.repo_relative_path}
                              role='button'
                              tabIndex={0}
                              data-scm-touched-file
                              className='flex items-center gap-6px px-6px py-3px rd-4px hover:bg-[var(--color-fill-2)] cursor-pointer text-11px transition-colors'
                              onClick={() => {
                                onOpenFileDiff({
                                  repoId: repo.repo_id,
                                  resource: file,
                                  from: details.commit.parents[0] ? `commit:${details.commit.parents[0]}` : 'committed',
                                  to: `commit:${details.commit.sha}`,
                                  commitShortSha: details.commit.short_sha,
                                });
                              }}
                            >
                              <FileStatusBadge state={file.state} />
                              <span className='font-mono text-t-primary truncate flex-1'>
                                {file.repo_relative_path}
                              </span>
                              {file.rename_from && (
                                <span className='text-t-tertiary text-10px truncate'>
                                  (from {file.rename_from})
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </React.Fragment>
          );
        })}

        {loading && commits.length > 0 && (
          <div className='py-8px flex items-center justify-center gap-6px text-t-tertiary text-11px'>
            <Spin size={12} />
            <span>{t('conversation.explorer.scm.loadingMore', 'Loading more commits...')}</span>
          </div>
        )}
      </div>
    </div>
  );
};

const FileStatusBadge: React.FC<{ state: ScmResource['state'] }> = ({ state }) => {
  switch (state) {
    case 'created':
      return <span className='w-14px h-14px rd-2px bg-emerald-500/10 text-emerald-600 font-bold flex items-center justify-center text-9px'>A</span>;
    case 'deleted':
      return <span className='w-14px h-14px rd-2px bg-rose-500/10 text-rose-600 font-bold flex items-center justify-center text-9px'>D</span>;
    case 'renamed':
      return <span className='w-14px h-14px rd-2px bg-cyan-500/10 text-cyan-600 font-bold flex items-center justify-center text-9px'>R</span>;
    case 'modified':
    default:
      return <span className='w-14px h-14px rd-2px bg-amber-500/10 text-amber-600 font-bold flex items-center justify-center text-9px'>M</span>;
  }
};

const MenuDivider: React.FC = () => <div className='h-1px bg-[var(--color-border-2)] my-4px mx-8px' />;

/**
 * Single commit row rendering: SVG rails on the left, commit capsule and metadata on the right.
 */
const CommitRow: React.FC<{
  row: ComputedCommitRow;
  rowHeight: number;
  laneColWidth: number;
  isNarrow: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onAskAgent: () => void;
}> = ({ row, rowHeight, laneColWidth, isNarrow, isSelected, onToggle, onAskAgent }) => {
  const { t } = useTranslation();
  const { commit, lane, color, isHead, isMerge, routes } = row;

  const copyHash = (full: boolean): void => {
    void navigator.clipboard.writeText(full ? commit.sha : commit.short_sha);
    Message.success(t('conversation.explorer.scm.copiedHash', 'Commit hash copied'));
  };

  const copyMessage = (): void => {
    void navigator.clipboard.writeText(commit.message);
    Message.success(t('conversation.explorer.scm.copiedMessage', 'Commit message copied'));
  };

  const contextMenu = (
    <Menu className='min-w-180px'>
      <Menu.Item key='copy-short' onClick={() => copyHash(false)}>
        <div className='flex items-center gap-6px text-12px'>
          <Copy theme='outline' size='14' className='text-t-secondary flex-shrink-0' />
          <span className='text-t-primary'>{t('conversation.explorer.scm.copyShortHash', 'Copy Short Hash')}</span>
        </div>
      </Menu.Item>
      <Menu.Item key='copy-full' onClick={() => copyHash(true)}>
        <div className='flex items-center gap-6px text-12px'>
          <Copy theme='outline' size='14' className='text-t-secondary flex-shrink-0' />
          <span className='text-t-primary'>{t('conversation.explorer.scm.copyFullHash', 'Copy Full Hash')}</span>
        </div>
      </Menu.Item>
      <Menu.Item key='copy-msg' onClick={copyMessage}>
        <div className='flex items-center gap-6px text-12px'>
          <MessageOne theme='outline' size='14' className='text-t-secondary flex-shrink-0' />
          <span className='text-t-primary'>{t('conversation.explorer.scm.copyMessage', 'Copy Commit Message')}</span>
        </div>
      </Menu.Item>
      <MenuDivider />
      <Menu.Item key='ask-agent' onClick={onAskAgent}>
        <div className='flex items-center gap-6px text-12px text-[var(--color-primary-6)]'>
          <Robot theme='outline' size='14' className='flex-shrink-0' />
          <span className='font-medium'>{t('conversation.explorer.scm.askAgentExplain', 'Ask Agent: Explain Commit')}</span>
        </div>
      </Menu.Item>
    </Menu>
  );

  const glyphX = isNarrow ? 8 : lane * 16 + 8;
  const glyphY = rowHeight / 2;

  return (
    <Dropdown droplist={contextMenu} trigger='contextMenu' position='bl'>
      <div
        data-scm-commit-row={commit.sha}
        className={classNames(
          'flex items-center text-12px hover:bg-[var(--color-fill-2)] cursor-pointer select-none transition-colors border-b border-[var(--color-border-1)] group',
          isSelected && 'bg-[var(--color-fill-2)] font-medium'
        )}
        style={{ height: rowHeight }}
        onClick={onToggle}
      >
        {/* SVG Bezier Rails Column */}
        <div
          className='flex-shrink-0 relative overflow-hidden self-stretch'
          style={{ width: laneColWidth }}
        >
          <svg
            className='w-full h-full block'
            style={{ minWidth: laneColWidth }}
            aria-hidden='true'
          >
            {isNarrow ? (
              // Narrow/mobile compaction: single clean vertical track down the center
              <>
                <line x1={8} y1={0} x2={8} y2={rowHeight} stroke={color} strokeWidth={2} />
                {isHead ? (
                  <>
                    <circle cx={8} cy={glyphY} r={6.5} stroke={color} strokeWidth={1.5} fill='var(--color-bg-1)' />
                    <circle cx={8} cy={glyphY} r={3} fill={color} />
                  </>
                ) : isMerge ? (
                  <polygon
                    points={`8,${glyphY - 4.5} ${8 + 4.5},${glyphY} 8,${glyphY + 4.5} ${8 - 4.5},${glyphY}`}
                    fill={color}
                  />
                ) : (
                  <circle cx={8} cy={glyphY} r={4} fill={color} />
                )}
              </>
            ) : (
              // Full multi-lane SVG rails with curved bezier connections
              <>
                {routes.map((r, idx) => {
                  const x1 = r.fromLane * 16 + 8;
                  const x2 = r.toLane * 16 + 8;

                  if (r.type === 'straight') {
                    return (
                      <line
                        key={`straight-${idx}`}
                        x1={x1}
                        y1={0}
                        x2={x2}
                        y2={rowHeight}
                        stroke={r.color}
                        strokeWidth={2}
                      />
                    );
                  }

                  if (r.type === 'branch') {
                    // Fork: curves from glyph down to child branch lane at bottom
                    return (
                      <path
                        key={`branch-${idx}`}
                        d={`M ${x1} ${glyphY} C ${x1} ${(glyphY + rowHeight) / 2}, ${x2} ${(glyphY + rowHeight) / 2}, ${x2} ${rowHeight}`}
                        stroke={r.color}
                        strokeWidth={2}
                        fill='none'
                      />
                    );
                  }

                  if (r.type === 'merge') {
                    // Merge: curves from top of merging branch lane into this commit glyph
                    return (
                      <path
                        key={`merge-${idx}`}
                        d={`M ${x2} 0 C ${x2} ${glyphY / 2}, ${x1} ${glyphY / 2}, ${x1} ${glyphY}`}
                        stroke={r.color}
                        strokeWidth={2}
                        fill='none'
                      />
                    );
                  }

                  return null;
                })}

                {/* Vertical incoming connection to glyph */}
                <line x1={glyphX} y1={0} x2={glyphX} y2={glyphY} stroke={color} strokeWidth={2} />

                {/* Commit Glyph */}
                {isHead ? (
                  <>
                    <circle cx={glyphX} cy={glyphY} r={6.5} stroke={color} strokeWidth={1.5} fill='var(--color-bg-1)' />
                    <circle cx={glyphX} cy={glyphY} r={3} fill={color} />
                  </>
                ) : isMerge ? (
                  <polygon
                    points={`${glyphX},${glyphY - 4.5} ${glyphX + 4.5},${glyphY} ${glyphX},${glyphY + 4.5} ${glyphX - 4.5},${glyphY}`}
                    fill={color}
                  />
                ) : (
                  <circle cx={glyphX} cy={glyphY} r={4} fill={color} />
                )}
              </>
            )}
          </svg>
        </div>

        {/* Commit Content */}
        <div className='flex items-center gap-6px min-w-0 flex-1 px-6px overflow-hidden'>
          {/* Ref capsules */}
          {commit.refs.map((ref) => (
            <RefCapsule key={ref.name} refLabel={ref} />
          ))}

          {/* Subject */}
          <span
            className='truncate text-t-primary text-12px font-normal flex-1'
            title={commit.subject}
          >
            {commit.subject}
          </span>

          {/* Author */}
          {!isNarrow && (
            <span className='text-t-tertiary text-11px flex-shrink-0 max-w-90px truncate'>
              {commit.author_name}
            </span>
          )}

          {/* Relative Time */}
          <span className='text-t-tertiary text-10px flex-shrink-0'>
            {formatRelativeTime(commit.author_timestamp)}
          </span>

          {/* Short SHA */}
          <span className='font-mono text-10px text-t-tertiary flex-shrink-0 group-hover:text-t-primary'>
            {commit.short_sha}
          </span>

          {/* Context menu affordance */}
          <Dropdown droplist={contextMenu} trigger='click' position='br'>
            <button
              type='button'
              className='w-18px h-18px p-0 flex items-center justify-center text-t-tertiary hover:text-t-primary rd-2px hover:bg-[var(--color-fill-3)] flex-shrink-0'
              onClick={(e) => e.stopPropagation()}
              aria-label='More actions'
            >
              <MoreOne theme='outline' size='12' />
            </button>
          </Dropdown>
        </div>
      </div>
    </Dropdown>
  );
};

const RefCapsule: React.FC<{ refLabel: ScmRefLabel }> = ({ refLabel }) => {
  const { name, kind, is_head } = refLabel;

  if (kind === 'head' || is_head) {
    return (
      <span className='inline-flex items-center px-4px py-0.5px rd-2px bg-emerald-500/15 text-emerald-600 text-10px font-medium font-mono flex-shrink-0'>
        {name}
      </span>
    );
  }

  if (kind === 'branch') {
    return (
      <span className='inline-flex items-center px-4px py-0.5px rd-2px bg-blue-500/15 text-blue-600 text-10px font-medium font-mono flex-shrink-0'>
        {name}
      </span>
    );
  }

  if (kind === 'remote') {
    return (
      <span className='inline-flex items-center px-4px py-0.5px rd-2px bg-purple-500/15 text-purple-600 text-10px font-medium font-mono flex-shrink-0'>
        {name}
      </span>
    );
  }

  if (kind === 'tag') {
    return (
      <span className='inline-flex items-center px-4px py-0.5px rd-2px bg-amber-500/15 text-amber-600 text-10px font-medium font-mono flex-shrink-0'>
        {name}
      </span>
    );
  }

  return (
    <span className='inline-flex items-center px-4px py-0.5px rd-2px bg-[var(--color-fill-2)] text-t-secondary text-10px font-mono flex-shrink-0'>
      {name}
    </span>
  );
};
