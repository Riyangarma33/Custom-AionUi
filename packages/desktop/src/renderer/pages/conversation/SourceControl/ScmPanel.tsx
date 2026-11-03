/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Changes panel — the Source Control component hosted in the project panel's
 * `changes` tab (see `formal/runtime/source-control.md` §前端).
 *
 * Lifecycle, and why it is the way it is: the subscription is **project-scoped,
 * not tab-scoped**. This component may be unmounted whenever the user switches to
 * the Files tab, so it must NOT unsubscribe on unmount — doing so would drop the
 * backend watch and the warm status on every tab click, making a switch back cost
 * a full recompute. Ownership of the subscription therefore sits with the store,
 * keyed by project id: mounting calls `openScmProject` (a no-op when the project
 * is already open) and nothing here ever closes it. Release happens on project
 * switch (the store's own guard) or reconnect.
 *
 * Refresh: besides backend pushes, the panel pulls on window focus. An external
 * editor writing a working-tree file — and editing `.gitignore` itself — produces
 * no `.git` event, so the backend watch cannot observe it; only this signal can
 * (source-control.md §三信号 ③).
 *
 * Layout: 2-section stack (VS Code / GitHub Desktop parity).
 * - Multi-repo projects elevate the repository selector to a top bar (`ScmTopRepoBar`).
 * - Body is composed of `Changes` (primary work area) and `Graph` (Git DAG history),
 *   separated by a draggable divider.
 */

import { Button, Tooltip } from '@arco-design/web-react';
import { Plus, TreeList, Undo, ViewList } from '@icon-park/react';
import classNames from 'classnames';
import React, { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { usePreviewContext } from '../Preview';
import { discardAllTargets, ScmChangesView, stageAllTargets } from './ScmChangesView';
import { ScmGraphView } from './ScmGraphView';
import { ScmSection, ScmSectionDivider } from './ScmSection';
import { ScmTopRepoBar } from './ScmTopRepoBar';
import {
  diffAnchors,
  resourceKey,
  resourceName,
  type ContentRef,
  type ScmActionKind,
  type ScmRepository,
  type ScmResource,
} from './scmModel';
import { fetchScmDiff, openScmProject, refreshAllRepos, setSelectedRepo, useScm } from './scmStore';
import { initScmRuntime } from './scmTransport';
import {
  clearSectionHeight,
  openScmUi,
  setScmViewMode,
  setSectionCollapsed,
  setSectionHeight,
  useScmUi,
  type ScmViewMode,
} from './scmUiStore';
import { type ScmActionReport, useScmActions } from './useScmActions';

/** Section ids — the persistence keys and the extensible section registry. */
const SECTION_CHANGES = 'changes';
const SECTION_GRAPH = 'graph';

/** Height of a section header row, in px (mirror of ScmSection's `h-24px`). */
const SECTION_HEADER_PX = 24;
/** Minimum body height a section keeps when dragged small. */
const SECTION_MIN_BODY_PX = 40;

export type ScmPanelProps = {
  /** Owning project id — scopes the store's repositories + statuses. */
  projectId: string;
};

export const ScmPanel: React.FC<ScmPanelProps> = ({ projectId }) => {
  const { t } = useTranslation();
  const view = useScm();
  const ui = useScmUi();
  const actions = useScmActions();

  // Wire the WS runtime (idempotent) and declare the project.
  useEffect(() => {
    initScmRuntime();
    void openScmProject(projectId);
    openScmUi(projectId);
  }, [projectId]);

  // Focus refresh
  useEffect(() => {
    const onFocus = (): void => {
      void refreshAllRepos();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // The repo whose changes the body shows.
  const selectedRepo = useMemo(
    () => view.repositories.find((r) => r.repo_id === view.selectedRepoId) ?? view.repositories[0],
    [view.repositories, view.selectedRepoId]
  );

  const [selectedCommitDiff, setSelectedCommitDiff] = React.useState<{
    repoId: string;
    resource: ScmResource;
    from: ContentRef;
    to: ContentRef;
    commitShortSha: string;
  } | null>(null);

  // Diff selection is scoped to the shown repo
  const selected = useMemo(() => {
    if (!selectedRepo || !view.selectedResource) return null;
    const resource = view.statuses[selectedRepo.repo_id]?.resources.find(
      (r) => resourceKey(r) === view.selectedResource
    );
    return resource ? { repo: selectedRepo, resource } : null;
  }, [selectedRepo, view.statuses, view.selectedResource]);

  // When a working tree resource is selected, clear any historical commit diff
  useEffect(() => {
    if (selected) {
      setSelectedCommitDiff(null);
    }
  }, [selected]);

  if (view.loadState === 'loading' && view.repositories.length === 0) {
    return <PanelNotice text={t('conversation.explorer.scm.loading')} />;
  }
  if (view.loadState === 'error') {
    return <PanelNotice text={t('conversation.explorer.scm.loadFailed')} />;
  }
  // No pe root of this project is a repository → say so, do not fabricate a repo.
  if (view.repositories.length === 0 || !selectedRepo) {
    return <PanelNotice text={t('conversation.explorer.scm.notARepository')} />;
  }

  const multiRepo = view.repositories.length > 1;

  return (
    <div data-scm-panel className='h-full flex flex-col min-h-0'>
      {/* Top repository bar for multi-repo projects */}
      {multiRepo && (
        <ScmTopRepoBar
          repositories={view.repositories}
          selectedRepo={selectedRepo}
          onSelectRepo={setSelectedRepo}
        />
      )}
      {/* Action-report banner */}
      {actions.report && (
        <div className='flex-shrink-0 flex items-center gap-8px px-8px py-2px min-h-28px'>
          <ActionReportSummary report={actions.report} onDismiss={actions.clearReport} />
        </div>
      )}
      {actions.report && <ActionReportExtras report={actions.report} busy={actions.busy} onRetry={actions.retry} />}
      <ScmSectionStack
        view={view}
        ui={ui}
        selectedRepo={selectedRepo}
        onAction={actions.run}
        onSelectCommitDiff={setSelectedCommitDiff}
        busy={actions.busy}
        failedRowKeys={actions.report?.failedRowKeys ?? []}
      />
      {/* Selecting a change opens its diff in the shared preview panel */}
      {selected && (
        <ScmDiffPreviewBridge
          repoId={selected.repo.repo_id}
          staging={selected.repo.capabilities.staging}
          resource={selected.resource}
        />
      )}
      {/* Selecting a touched file from a historical commit opens its diff in the preview panel */}
      {selectedCommitDiff && (
        <ScmDiffPreviewBridge
          repoId={selectedCommitDiff.repoId}
          staging={false}
          resource={selectedCommitDiff.resource}
          fromOverride={selectedCommitDiff.from}
          toOverride={selectedCommitDiff.to}
          titleOverride={`${resourceName(selectedCommitDiff.resource)} (${selectedCommitDiff.commitShortSha})`}
        />
      )}
    </div>
  );
};

/**
 * 2-section stack layout: Changes on top (flexible primary area), Graph on bottom
 * (resizable commit history view), separated by a draggable divider.
 */
const ScmSectionStack: React.FC<{
  view: ReturnType<typeof useScm>;
  ui: ReturnType<typeof useScmUi>;
  selectedRepo: ScmRepository;
  onAction: (action: ScmActionKind, repoId: string, resources: ScmResource[]) => void;
  onSelectCommitDiff: (diffTarget: {
    repoId: string;
    resource: ScmResource;
    from: ContentRef;
    to: ContentRef;
    commitShortSha: string;
  }) => void;
  busy: boolean;
  failedRowKeys: string[];
}> = ({
  view,
  ui,
  selectedRepo,
  onAction,
  onSelectCommitDiff,
  busy,
  failedRowKeys,
}) => {
  const { t } = useTranslation();
  const changesCollapsed = ui.collapsed[SECTION_CHANGES] === true;
  const graphCollapsed = ui.collapsed[SECTION_GRAPH] === true;

  const stackRef = React.useRef<HTMLDivElement>(null);
  const [stackPx, setStackPx] = React.useState<number>(0);
  React.useLayoutEffect(() => {
    const el = stackRef.current;
    if (!el) return;
    setStackPx(el.clientHeight);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setStackPx(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const changesOpen = !changesCollapsed;
  const graphOpen = !graphCollapsed;
  const showDivider = changesOpen && graphOpen;

  const totalHeadersPx = SECTION_HEADER_PX * 2 + (showDivider ? 1 : 0);
  const totalBodySpace = Math.max(SECTION_MIN_BODY_PX * 2, stackPx - totalHeadersPx);

  const defaultGraphBody = stackPx > 0 ? Math.min(450, Math.max(160, Math.round(stackPx * 0.42))) : 260;
  const maxGraphBody = Math.max(SECTION_MIN_BODY_PX, totalBodySpace - SECTION_MIN_BODY_PX);
  const graphBodyHeight = Math.max(
    SECTION_MIN_BODY_PX,
    Math.min(maxGraphBody, ui.heights[SECTION_GRAPH] ?? defaultGraphBody)
  );

  const changesIsFiller = changesOpen;
  const graphIsFiller = !changesOpen && graphOpen;

  // Dragging divider between Changes and Graph
  const graphDragBase = React.useRef<number | null>(null);
  const onGraphDividerDrag = (totalDeltaY: number): void => {
    graphDragBase.current ??= graphBodyHeight;
    setSectionHeight(
      SECTION_GRAPH,
      Math.max(SECTION_MIN_BODY_PX, Math.min(maxGraphBody, graphDragBase.current - totalDeltaY))
    );
  };
  const onGraphDividerDragEnd = (): void => {
    graphDragBase.current = null;
  };

  const viewMode: ScmViewMode = ui.viewMode;
  const changesStatus = view.statuses[selectedRepo.repo_id];
  const stageTargets = stageAllTargets(changesStatus, selectedRepo.capabilities.staging);
  const discardTargets = discardAllTargets(changesStatus, selectedRepo.capabilities.staging);

  const changesActions = (
    <ChangesHeaderActions
      mode={viewMode}
      onChangeMode={setScmViewMode}
      stageTargets={stageTargets}
      discardTargets={discardTargets}
      busy={busy}
      onStageAll={() => onAction('stage', selectedRepo.repo_id, stageTargets)}
      onDiscardAll={() => onAction('discard', selectedRepo.repo_id, discardTargets)}
    />
  );

  const changesBody = (
    <div className='flex-1 min-h-0 overflow-auto ps-4px pe-4px pb-8px'>
      <ScmChangesView
        repo={selectedRepo}
        status={view.statuses[selectedRepo.repo_id]}
        selectedKey={view.selectedResource}
        onAction={onAction}
        busy={busy}
        failedRowKeys={failedRowKeys}
        viewMode={viewMode}
        treeExpanded={ui.treeExpanded}
      />
    </div>
  );

  return (
    <div data-scm-section-stack ref={stackRef} className='flex-1 min-h-0 flex flex-col overflow-hidden'>
      <div
        data-scm-section-slot={SECTION_CHANGES}
        className={classNames(
          'overflow-hidden flex flex-col',
          changesIsFiller ? 'flex-1 min-h-0' : 'flex-shrink-0'
        )}
        style={
          changesIsFiller
            ? undefined
            : { height: SECTION_HEADER_PX }
        }
      >
        <ScmSection
          id={SECTION_CHANGES}
          title={t('conversation.explorer.scm.sections.changes')}
          collapsed={changesCollapsed}
          onToggleCollapsed={() => setSectionCollapsed(SECTION_CHANGES, !changesCollapsed)}
          actions={changesActions}
        >
          {changesBody}
        </ScmSection>
      </div>

      {showDivider && (
        <ScmSectionDivider
          onDrag={onGraphDividerDrag}
          onDragEnd={onGraphDividerDragEnd}
          onDoubleReset={() => clearSectionHeight(SECTION_GRAPH)}
        />
      )}

      <div
        data-scm-section-slot={SECTION_GRAPH}
        className={classNames(
          'overflow-hidden flex flex-col',
          graphIsFiller ? 'flex-1 min-h-0' : 'flex-shrink-0'
        )}
        style={
          graphIsFiller
            ? undefined
            : graphCollapsed
              ? { height: SECTION_HEADER_PX }
              : { height: SECTION_HEADER_PX + graphBodyHeight }
        }
      >
        <ScmSection
          id={SECTION_GRAPH}
          title={t('conversation.explorer.scm.sections.graph', 'Graph')}
          collapsed={graphCollapsed}
          onToggleCollapsed={() => setSectionCollapsed(SECTION_GRAPH, !graphCollapsed)}
        >
          <div className='flex-1 min-h-0 overflow-hidden flex flex-col'>
            <ScmGraphView
              repo={selectedRepo}
              onOpenFileDiff={onSelectCommitDiff}
            />
          </div>
        </ScmSection>
      </div>
    </div>
  );
};

/**
 * The Changes section header's action cluster
 */
const ChangesHeaderActions: React.FC<{
  mode: ScmViewMode;
  onChangeMode: (mode: ScmViewMode) => void;
  stageTargets: ScmResource[];
  discardTargets: ScmResource[];
  busy: boolean;
  onStageAll: () => void;
  onDiscardAll: () => void;
}> = ({ mode, onChangeMode, stageTargets, discardTargets, busy, onStageAll, onDiscardAll }) => {
  const { t } = useTranslation();
  return (
    <>
      {discardTargets.length > 0 && (
        <Tooltip content={t('conversation.explorer.scm.actions.discard')} mini position='br'>
          <Button
            type='text'
            size='mini'
            disabled={busy}
            data-scm-header-discard-all
            className='flex-shrink-0'
            icon={<Undo theme='outline' size='14' />}
            aria-label={t('conversation.explorer.scm.actions.discard')}
            onClick={onDiscardAll}
          />
        </Tooltip>
      )}
      {stageTargets.length > 0 && (
        <Tooltip content={t('conversation.explorer.scm.actions.stageAll')} mini position='br'>
          <Button
            type='text'
            size='mini'
            disabled={busy}
            data-scm-header-stage-all
            className='flex-shrink-0'
            icon={<Plus theme='outline' size='14' />}
            aria-label={t('conversation.explorer.scm.actions.stageAll')}
            onClick={onStageAll}
          />
        </Tooltip>
      )}
      <ViewModeToggle mode={mode} onChange={onChangeMode} />
    </>
  );
};

const ViewModeToggle: React.FC<{ mode: ScmViewMode; onChange: (mode: ScmViewMode) => void }> = ({ mode, onChange }) => {
  const { t } = useTranslation();
  const next: ScmViewMode = mode === 'tree' ? 'list' : 'tree';
  const label = t(next === 'tree' ? 'conversation.explorer.scm.viewAsTree' : 'conversation.explorer.scm.viewAsList');
  return (
    <Tooltip content={label} mini position='br'>
      <Button
        type='text'
        size='mini'
        data-scm-view-toggle={mode}
        className='flex-shrink-0'
        icon={next === 'tree' ? <TreeList theme='outline' size='14' /> : <ViewList theme='outline' size='14' />}
        aria-label={label}
        onClick={() => onChange(next)}
      />
    </Tooltip>
  );
};

/**
 * Bridges a selected change to the shared preview panel
 */
const ScmDiffPreviewBridge: React.FC<{
  repoId: string;
  staging: boolean;
  resource: ScmResource;
  fromOverride?: ContentRef;
  toOverride?: ContentRef;
  titleOverride?: string;
}> = ({ repoId, staging, resource, fromOverride, toOverride, titleOverride }) => {
  const { t } = useTranslation();
  const { openPreview } = usePreviewContext();
  const name = resourceName(resource);
  const { pe_id: peId, relative_path: relativePath } = resource.file;
  const defaultAnchors = diffAnchors(resource, staging);
  const from = fromOverride ?? defaultAnchors.from;
  const to = toOverride ?? defaultAnchors.to;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await fetchScmDiff({
          repository: repoId,
          file: { pe_id: peId, relative_path: relativePath },
          from,
          to,
        });
        if (cancelled) return;
        const body =
          result.binary === true
            ? t('conversation.explorer.scm.diff.binary')
            : result.patch && result.patch.length > 0
              ? result.patch
              : t('conversation.explorer.scm.diff.empty');
        openPreview(body, 'diff', { file_name: name, title: titleOverride ?? name });
      } catch {
        // Passive bridge
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repoId, peId, relativePath, from, to, name, titleOverride, openPreview, t]);

  return null;
};

const reportToneClass = (tone: ScmActionReport['tone']): string =>
  tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-danger';

const ActionReportSummary: React.FC<{
  report: ScmActionReport;
  onDismiss: () => void;
}> = ({ report, onDismiss }) => (
  <div
    data-scm-action-report
    className='flex items-center gap-6px text-12px min-w-0 flex-1 leading-18px py-2px'
  >
    <span className={`flex-shrink-0 font-medium ${reportToneClass(report.tone)}`}>●</span>
    <span className='truncate text-t-primary flex-1' title={report.message}>
      {report.message}
    </span>
    <button
      type='button'
      onClick={onDismiss}
      className='flex-shrink-0 text-t-tertiary hover:text-t-primary px-4px py-1px rounded hover:bg-fill-2 text-11px transition-colors cursor-pointer border-none bg-transparent'
    >
      ✕
    </button>
  </div>
);

const ActionReportExtras: React.FC<{
  report: ScmActionReport;
  busy: boolean;
  onRetry: () => void;
}> = ({ report, busy, onRetry }) => {
  const { t } = useTranslation();
  if (!report.detail && !report.retryable) return null;
  return (
    <div
      data-scm-action-extras
      className='flex items-center justify-between gap-8px px-12px pb-6px pt-2px text-11px text-t-secondary border-b border-[var(--bg-3)]'
    >
      {report.detail ? (
        <span className='truncate flex-1 font-mono' title={report.detail}>
          {report.detail}
        </span>
      ) : (
        <span />
      )}
      {report.retryable && (
        <Button
          type='text'
          size='mini'
          disabled={busy}
          data-scm-action-retry
          className='flex-shrink-0 !h-20px !px-6px !text-11px'
          onClick={onRetry}
        >
          {t('conversation.explorer.scm.actions.retry')}
        </Button>
      )}
    </div>
  );
};

const PanelNotice: React.FC<{ text: string }> = ({ text }) => (
  <div className='flex items-center justify-center h-full p-16px text-t-tertiary text-12px text-center'>{text}</div>
);
