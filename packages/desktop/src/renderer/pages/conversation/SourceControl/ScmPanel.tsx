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
 * Layout: the body is a stack of collapsible/resizable sections (VS Code SCM
 * sidebar). Repositories and Changes are the two sections today; a future graph
 * section drops in as a third with no framework change (see `ScmSectionStack`).
 */

import { Button, Tooltip } from '@arco-design/web-react';
import {
  Attention,
  BranchTwo,
  FolderCode,
  FolderCodeOne,
  Link,
  Plus,
  RightBranchOne,
  TreeList,
  Undo,
  ViewList,
} from '@icon-park/react';
import React, { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';

import { usePreviewContext } from '../Preview';
import { discardAllTargets, ScmChangesView, stageAllTargets } from './ScmChangesView';
import { ScmGraphView } from './ScmGraphView';
import { ScmSection, ScmSectionDivider } from './ScmSection';
import {
  diffAnchors,
  resourceKey,
  resourceName,
  type ContentRef,
  type ScmActionKind,
  type ScmRepository,
  type ScmResource,
} from './scmModel';
import { groupRepositories, type ScmRepoGroup } from './scmRepoTree';
import { fetchScmDiff, openScmProject, refreshAllRepos, setSelectedRepo, useScm } from './scmStore';
import { initScmRuntime } from './scmTransport';
import {
  clearSectionHeight,
  openScmUi,
  setRepoWorktreesCollapsed,
  setScmViewMode,
  setSectionCollapsed,
  setSectionHeight,
  useScmUi,
  type ScmViewMode,
} from './scmUiStore';
import { type ScmActionReport, useScmActions } from './useScmActions';

/** Section ids — the persistence keys and the extensible section registry. */
const SECTION_REPOSITORIES = 'repositories';
const SECTION_CHANGES = 'changes';
const SECTION_GRAPH = 'graph';

/** Height of a section header row, in px (mirror of ScmSection's `h-24px`). Used to
 *  bound section body heights so at least one header row always stays on screen. */
const SECTION_HEADER_PX = 24;
/** Minimum body height a sized (bottom-anchored) section keeps when dragged small. */
const SECTION_MIN_BODY_PX = 40;
/** Default body height for a sized section when nothing is stored: a fraction of the
 *  panel height (the Changes section should open roomy, ~60%). */
const SECTION_DEFAULT_FRACTION = 0.6;

export type ScmPanelProps = {
  /** Owning project id — scopes the store's repositories + statuses. */
  projectId: string;
};

export const ScmPanel: React.FC<ScmPanelProps> = ({ projectId }) => {
  const { t } = useTranslation();
  const view = useScm();
  const ui = useScmUi();
  const actions = useScmActions();

  // Wire the WS runtime (idempotent) and declare the project. Deliberately no
  // cleanup: unmount here means "tab switched", not "project closed". The UI store
  // is opened alongside so collapse/height/view-mode restore for this project.
  useEffect(() => {
    initScmRuntime();
    void openScmProject(projectId);
    openScmUi(projectId);
  }, [projectId]);

  // Focus refresh — the only signal that catches an external editor's write and a
  // `.gitignore` edit.
  useEffect(() => {
    const onFocus = (): void => {
      void refreshAllRepos();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // The repo whose changes the body shows. A stale or absent `selectedRepoId`
  // (default on open, or after the selected repo was removed) resolves to the first
  // repo — so the body never renders nothing while a repo exists. Undefined only
  // when there are no repos at all, which the guards below handle first.
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

  // Diff selection is scoped to the shown repo: only its rows are on screen, and a
  // repo switch clears `selectedResource` (see `setSelectedRepo`), so a resolved row
  // always belongs to `selectedRepo`. A whole-frame replace that drops the row
  // resolves to null and closes the diff.
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
      {/* Action-report banner. The bulk/view controls live on the Changes section
          header (VS Code parity — actions sit on the section they act on) and the
          refresh moved to the shared explorer top bar (scoped to the visible tab;
          on Changes it re-discovers repos AND re-pulls status), so this row exists
          only to surface an action report and collapses
          away entirely when there is none, leaving no empty toolbar strip on top.
          The report's secondary parts (a failed-file detail line, a retry button)
          are rare and wide, so they drop to their own full-width row underneath via
          `ActionReportExtras`; the common success case stays a single line. */}
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
        multiRepo={multiRepo}
        onRepoSelect={setSelectedRepo}
        onAction={actions.run}
        onSelectCommitDiff={setSelectedCommitDiff}
        busy={actions.busy}
        failedRowKeys={actions.report?.failedRowKeys ?? []}
      />
      {/* Selecting a change opens its diff in the shared preview panel (a `'diff'`
          tab, reusing the same `openPreview` mechanism the file tree uses) rather
          than a fixed pane docked below this panel. Rendered as a hookless bridge
          so the fetch/open effect only exists while a row is selected and unmounts
          cleanly when it clears. */}
      {selected && (
        <ScmDiffPreviewBridge
          repoId={selected.repo.repo_id}
          staging={selected.repo.capabilities.staging}
          resource={selected.resource}
        />
      )}
      {/* Selecting a touched file from a historical commit in the Graph section opens
          its commit diff in the preview panel. */}
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
 * The section stack: the collapsible/resizable body of the panel below the header
 * bar. Renders the Repositories section (multi-repo only) and the Changes section,
 * with a drag divider between them. The Changes section always flexes to fill and
 * its header is `flex-shrink-0`, so it can never lose its header no matter how many
 * repos the list holds — the hard layout requirement.
 *
 * Extensible by construction: a future graph section is one more `ScmSection` +
 * divider in this stack; collapse/height persistence is already id-keyed in the UI
 * store, so no mechanism here is hard-wired to exactly two sections.
 */
const ScmSectionStack: React.FC<{
  view: ReturnType<typeof useScm>;
  ui: ReturnType<typeof useScmUi>;
  selectedRepo: ScmRepository;
  multiRepo: boolean;
  onRepoSelect: (repoId: string) => void;
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
  multiRepo,
  onRepoSelect,
  onAction,
  onSelectCommitDiff,
  busy,
  failedRowKeys,
}) => {
  const { t } = useTranslation();
  const reposCollapsed = ui.collapsed[SECTION_REPOSITORIES] === true;
  const changesCollapsed = ui.collapsed[SECTION_CHANGES] === true;
  const graphCollapsed = ui.collapsed[SECTION_GRAPH] === true;

  // Measure the stack's own pixel height so a sized section can default to a fraction
  // of it and so drags can be clamped to "leave at least the other headers on screen".
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

  // 3-section stack layout model (VS Code SCM parity):
  // Screen order: Repositories (multi-repo only) -> Changes -> Graph.
  // Changes is the primary work area and serves as the flex filler when open.
  // Repositories (top) and Graph (bottom) are sized sections with persisted/default heights.
  // If Changes is collapsed, Graph becomes the filler if open, else Repositories fills.
  const repoOpen = multiRepo && !reposCollapsed;
  const changesOpen = !changesCollapsed;
  const graphOpen = !graphCollapsed;

  const changesIsFiller = changesOpen;
  const graphIsFiller = !changesOpen && graphOpen;
  const repoIsFiller = !changesOpen && !graphOpen && repoOpen;

  const showDivider1 = multiRepo && repoOpen && (changesOpen || graphOpen);
  const showDivider2 = graphOpen && (changesOpen || (multiRepo && repoOpen));

  const totalHeadersPx = (multiRepo ? SECTION_HEADER_PX : 0) + SECTION_HEADER_PX + SECTION_HEADER_PX;
  const totalDividersPx = (showDivider1 ? 1 : 0) + (showDivider2 ? 1 : 0);
  const totalBodySpace = Math.max(SECTION_MIN_BODY_PX, stackPx - totalHeadersPx - totalDividersPx);

  // Default and clamped body heights
  const defaultRepoBody = stackPx > 0 ? Math.min(180, Math.max(80, Math.round(stackPx * 0.22))) : 140;
  const reserveForOtherFromRepo =
    (changesOpen ? SECTION_MIN_BODY_PX : 0) + (graphOpen && !graphIsFiller ? SECTION_MIN_BODY_PX : 0);
  const maxRepoBody = Math.max(SECTION_MIN_BODY_PX, totalBodySpace - reserveForOtherFromRepo);
  const repoBodyHeight = Math.max(
    SECTION_MIN_BODY_PX,
    Math.min(maxRepoBody, ui.heights[SECTION_REPOSITORIES] ?? defaultRepoBody)
  );

  const defaultGraphBody = stackPx > 0 ? Math.min(320, Math.max(140, Math.round(stackPx * 0.35))) : 240;
  const reserveForOtherFromGraph =
    (changesOpen ? SECTION_MIN_BODY_PX : 0) + (repoOpen && !repoIsFiller ? repoBodyHeight : 0);
  const maxGraphBody = Math.max(SECTION_MIN_BODY_PX, totalBodySpace - reserveForOtherFromGraph);
  const graphBodyHeight = Math.max(
    SECTION_MIN_BODY_PX,
    Math.min(maxGraphBody, ui.heights[SECTION_GRAPH] ?? defaultGraphBody)
  );

  const defaultChangesBody = stackPx > 0 ? Math.round(stackPx * 0.45) : 240;
  const changesBodyHeight = Math.max(
    SECTION_MIN_BODY_PX,
    Math.min(totalBodySpace, ui.heights[SECTION_CHANGES] ?? defaultChangesBody)
  );

  // Dragging divider 1 (between Repositories and Changes)
  const repoDragBase = React.useRef<number | null>(null);
  const onRepoDividerDrag = (totalDeltaY: number): void => {
    repoDragBase.current ??= repoBodyHeight;
    setSectionHeight(
      SECTION_REPOSITORIES,
      Math.max(SECTION_MIN_BODY_PX, Math.min(maxRepoBody, repoDragBase.current + totalDeltaY))
    );
  };
  const onRepoDividerDragEnd = (): void => {
    repoDragBase.current = null;
  };

  // Dragging divider 2 (between Changes and Graph)
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
      {multiRepo && (
        <div
          data-scm-section-slot={SECTION_REPOSITORIES}
          className={classNames(
            'overflow-hidden flex flex-col',
            repoIsFiller ? 'flex-1 min-h-0' : 'flex-shrink-0'
          )}
          style={
            repoIsFiller
              ? { minHeight: SECTION_HEADER_PX + SECTION_MIN_BODY_PX }
              : reposCollapsed
                ? { height: SECTION_HEADER_PX, minHeight: SECTION_HEADER_PX }
                : { height: SECTION_HEADER_PX + repoBodyHeight, minHeight: SECTION_HEADER_PX + SECTION_MIN_BODY_PX }
          }
        >
          <ScmSection
            id={SECTION_REPOSITORIES}
            title={t('conversation.explorer.scm.sections.repositories')}
            collapsed={reposCollapsed}
            onToggleCollapsed={() => setSectionCollapsed(SECTION_REPOSITORIES, !reposCollapsed)}
          >
            <div className='flex-1 min-h-0 overflow-auto'>
              <RepoList
                repositories={view.repositories}
                selectedRepoId={selectedRepo.repo_id}
                onSelect={onRepoSelect}
                collapsedParents={ui.repoCollapsed}
                onToggleParent={setRepoWorktreesCollapsed}
              />
            </div>
          </ScmSection>
        </div>
      )}
      {showDivider1 && (
        <ScmSectionDivider
          onDrag={onRepoDividerDrag}
          onDragEnd={onRepoDividerDragEnd}
          onDoubleReset={() => clearSectionHeight(SECTION_REPOSITORIES)}
        />
      )}
      <div
        data-scm-section-slot={SECTION_CHANGES}
        className={classNames(
          'overflow-hidden flex flex-col',
          changesIsFiller ? 'flex-1 min-h-0' : 'flex-shrink-0'
        )}
        style={
          changesIsFiller
            ? { minHeight: SECTION_HEADER_PX + SECTION_MIN_BODY_PX }
            : changesCollapsed
              ? { height: SECTION_HEADER_PX, minHeight: SECTION_HEADER_PX }
              : { height: SECTION_HEADER_PX + changesBodyHeight, minHeight: SECTION_HEADER_PX + SECTION_MIN_BODY_PX }
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
      {showDivider2 && (
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
            ? { minHeight: SECTION_HEADER_PX + SECTION_MIN_BODY_PX }
            : graphCollapsed
              ? { height: SECTION_HEADER_PX, minHeight: SECTION_HEADER_PX }
              : { height: SECTION_HEADER_PX + graphBodyHeight, minHeight: SECTION_HEADER_PX + SECTION_MIN_BODY_PX }
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
              repositories={view.repositories}
              onSelectRepo={onRepoSelect}
              onOpenFileDiff={onSelectCommitDiff}
            />
          </div>
        </ScmSection>
      </div>
    </div>
  );
};

/**
 * The Changes section header's action cluster (VS Code parity — the actions sit on
 * the section they act on, not on a separate top toolbar): stage-all, refresh, and
 * the view-as-tree/list toggle, in that right-to-left importance order. Stage-all
 * only appears when there is something to stage; refresh acts on every repo.
 * `stopPropagation` keeps a click on any action from also toggling the section's
 * collapse (the header row owns that click otherwise).
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

/**
 * The Changes section header's view-as-tree / view-as-list toggle (VS Code parity).
 * A single button that flips to the other mode; the icon shows the mode it switches
 * TO, matching VS Code's toolbar affordance.
 */
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
 * Bridges a selected change to the shared preview panel: on selection (or when the
 * selected row's staged/working identity changes) it fetches the unified diff and
 * hands it to `openPreview` as a `'diff'` tab, exactly the mechanism the file tree
 * uses for file previews — the diff no longer lives in a pane docked under this
 * panel. Renders nothing itself.
 *
 * A per-effect `cancelled` flag guards the async fetch: rapid row switches must not
 * let a slow earlier response open a stale tab over the newer one. Binary/empty
 * diffs carry no patch to render, so they open a short notice as plain text instead
 * of a blank diff view — the panel still "唤起" a preview for every click. Fetch
 * failures are swallowed here (the row stays selected, no tab opens); surfacing them
 * belongs to the action-report path, not this passive bridge.
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
        // Passive bridge: a failed diff fetch leaves the selection intact and opens
        // nothing. Error surfacing is the action-report path's job, not this effect's.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repoId, peId, relativePath, from, to, name, titleOverride, openPreview, t]);

  return null;
};

/** Left indent (px) applied to a nested worktree row so it reads as a child of its
 *  primary, matching the tree view's step. */
const REPO_WORKTREE_INDENT = 16;

/**
 * One repository row. Shared by primaries, nested worktree children, submodules, and orphan
 * repos so selection/branch rendering stays identical across all kinds.
 */
const RepoRow: React.FC<{
  repo: ScmRepository;
  isSelected: boolean;
  onSelect: (repoId: string) => void;
  indent?: number;
  leading?: React.ReactNode;
  divergedLabel?: string;
}> = ({ repo, isSelected, onSelect, indent = 0, leading, divergedLabel }) => (
  <div
    role='button'
    tabIndex={0}
    data-scm-repo-item={repo.repo_id}
    aria-current={isSelected ? 'true' : undefined}
    onClick={() => onSelect(repo.repo_id)}
    onKeyDown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect(repo.repo_id);
      }
    }}
    className={`flex items-center gap-6px px-8px py-3px rd-4px cursor-pointer hover:bg-2 min-w-0 ${
      isSelected ? 'bg-2' : ''
    }`}
    style={indent ? { paddingInlineStart: 8 + indent } : undefined}
  >
    {leading}
    <span className='flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-13px text-t-primary'>
      {repo.pe_name || repo.label}
    </span>
    {repo.gitlink_diverged && divergedLabel && <DivergedGlyph label={divergedLabel} />}
    {/* Branch info is pinned to the right of the row (`ms-auto`), the branch
        name preceded by a branch glyph. `flex-1` on the repo name above
        claims the slack so the two never touch; both truncate under pressure.
        Rendered only when a head name is known — a detached/unknown head
        shows nothing rather than a lone icon. */}
    {repo.head?.name && (
      <span className='ms-auto flex items-center gap-2px min-w-0 flex-shrink text-t-tertiary text-12px'>
        <BranchTwo theme='outline' size='12' className='flex-shrink-0' />
        <span className='overflow-hidden text-ellipsis whitespace-nowrap'>{repo.head.name}</span>
      </span>
    )}
  </div>
);

/** The worktree glyph shown at the left of a worktree row (nested child or orphan). */
const WorktreeGlyph: React.FC<{ label: string }> = ({ label }) => (
  <Tooltip content={label} mini>
    <span className='flex-shrink-0 flex items-center' aria-label={label}>
      <RightBranchOne theme='outline' size='12' className='text-t-tertiary' />
    </span>
  </Tooltip>
);

/** The submodule glyph shown at the left of a submodule row. */
const SubmoduleGlyph: React.FC<{ label: string }> = ({ label }) => (
  <Tooltip content={label} mini>
    <span className='flex-shrink-0 flex items-center' aria-label={label}>
      <Link theme='outline' size='12' className='text-t-tertiary' />
    </span>
  </Tooltip>
);

/** The gitlink divergence indicator shown when a submodule commit differs from parent commit. */
const DivergedGlyph: React.FC<{ label: string }> = ({ label }) => (
  <Tooltip content={label} mini>
    <span
      data-scm-gitlink-diverged
      className='flex-shrink-0 flex items-center gap-2px px-4px py-0.5px rd-2px bg-[var(--color-warning-light-1)] text-[var(--color-warning-dark-1)] text-10px font-medium'
      aria-label={label}
    >
      <Attention theme='outline' size='10' className='flex-shrink-0' />
      <span>diverged</span>
    </span>
  </Tooltip>
);

type RepoLabels = {
  worktree: string;
  submodule: string;
  expand: string;
  collapse: string;
  gitlinkDiverged: string;
};

/**
 * Recursive renderer for repository tree nodes: supports primaries, nested worktrees,
 * and arbitrarily nested submodules.
 */
const RepoNodeRows: React.FC<{
  repo: ScmRepository;
  worktrees: ScmRepository[];
  submodules: ReturnType<typeof groupRepositories>[0]['submodules'];
  isSubmodule?: boolean;
  isWorktree?: boolean;
  selectedRepoId: string;
  onSelect: (repoId: string) => void;
  collapsed: Set<string>;
  onToggleParent: (repoId: string, collapsed: boolean) => void;
  labels: RepoLabels;
  indent?: number;
}> = ({
  repo,
  worktrees,
  submodules,
  isSubmodule = false,
  isWorktree = false,
  selectedRepoId,
  onSelect,
  collapsed,
  onToggleParent,
  labels,
  indent = 0,
}) => {
  const hasChildren = worktrees.length > 0 || submodules.length > 0;
  const isCollapsed = collapsed.has(repo.repo_id);
  const RepoIcon = isCollapsed ? FolderCode : FolderCodeOne;

  let leading: React.ReactNode;
  if (hasChildren) {
    leading = (
      <button
        type='button'
        data-scm-repo-toggle={repo.repo_id}
        aria-expanded={!isCollapsed}
        aria-label={isCollapsed ? labels.expand : labels.collapse}
        onClick={(e) => {
          e.stopPropagation();
          onToggleParent(repo.repo_id, !isCollapsed);
        }}
        className='flex-shrink-0 flex items-center justify-center w-14px h-14px text-t-tertiary hover:text-t-primary bg-transparent border-none p-0 cursor-pointer'
      >
        <RepoIcon theme='outline' size='12' />
      </button>
    );
  } else if (isWorktree) {
    leading = <WorktreeGlyph label={labels.worktree} />;
  } else if (isSubmodule) {
    leading = <SubmoduleGlyph label={labels.submodule} />;
  } else {
    leading = (
      <span
        data-scm-repo-glyph={repo.repo_id}
        className='flex-shrink-0 flex items-center justify-center w-14px h-14px text-t-tertiary'
      >
        <FolderCode theme='outline' size='12' />
      </span>
    );
  }

  return (
    <>
      <RepoRow
        repo={repo}
        isSelected={repo.repo_id === selectedRepoId}
        onSelect={onSelect}
        indent={indent}
        leading={leading}
        divergedLabel={labels.gitlinkDiverged}
      />
      {hasChildren && !isCollapsed && (
        <>
          {worktrees.map((wt) => (
            <RepoRow
              key={wt.repo_id}
              repo={wt}
              isSelected={wt.repo_id === selectedRepoId}
              onSelect={onSelect}
              indent={indent + REPO_WORKTREE_INDENT}
              leading={<WorktreeGlyph label={labels.worktree} />}
            />
          ))}
          {submodules.map((subNode) => (
            <RepoNodeRows
              key={subNode.repo.repo_id}
              repo={subNode.repo}
              worktrees={subNode.worktrees}
              submodules={subNode.submodules}
              isSubmodule={true}
              selectedRepoId={selectedRepoId}
              onSelect={onSelect}
              collapsed={collapsed}
              onToggleParent={onToggleParent}
              labels={labels}
              indent={indent + REPO_WORKTREE_INDENT}
            />
          ))}
        </>
      )}
    </>
  );
};

/**
 * Repository switcher, shown only for a multi-repo project. Rows come from
 * `groupRepositories`, which folds linked worktrees and recursive submodules under
 * their parents (VS Code REPOSITORIES parity). Clicking any row changes which repo
 * fills the body.
 */
const RepoList: React.FC<{
  repositories: ScmRepository[];
  selectedRepoId: string;
  onSelect: (repoId: string) => void;
  /** Primary repo ids whose children are currently collapsed. */
  collapsedParents: string[];
  onToggleParent: (repoId: string, collapsed: boolean) => void;
}> = ({ repositories, selectedRepoId, onSelect, collapsedParents, onToggleParent }) => {
  const { t } = useTranslation();
  const groups = useMemo(() => groupRepositories(repositories), [repositories]);
  const collapsed = useMemo(() => new Set(collapsedParents), [collapsedParents]);
  const labels: RepoLabels = {
    worktree: t('conversation.explorer.scm.worktree'),
    submodule: t('conversation.explorer.scm.submodule'),
    expand: t('conversation.explorer.scm.expandWorktrees'),
    collapse: t('conversation.explorer.scm.collapseWorktrees'),
    gitlinkDiverged: t('conversation.explorer.scm.gitlinkDiverged'),
  };

  return (
    <div
      data-scm-repo-list
      // No own scroll/max-height: the enclosing section body owns scrolling and the
      // height cap, and measures this list's natural height. A second scroll box here
      // would clip that measurement and reintroduce blank space.
      className='flex flex-col gap-1px px-4px py-4px border-b border-[var(--bg-3)]'
    >
      {groups.map((group) => (
        <RepoNodeRows
          key={group.repo.repo_id}
          repo={group.repo}
          worktrees={group.worktrees}
          submodules={group.submodules}
          isWorktree={group.kind === 'orphanWorktree'}
          isSubmodule={group.kind === 'orphanSubmodule'}
          selectedRepoId={selectedRepoId}
          onSelect={onSelect}
          collapsed={collapsed}
          onToggleParent={onToggleParent}
          labels={labels}
          indent={0}
        />
      ))}
    </div>
  );
};

const reportToneClass = (tone: ScmActionReport['tone']): string =>
  tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-danger';

/**
 * The action outcome's one-line summary, living inline in the header row to the
 * left of the refresh button. Tone carries the distinction that matters: a
 * `warning` means the action **partly happened** (message states counts, never
 * "failed"), while `error` means nothing happened. Only the message and its
 * dismiss control belong here — the detail and retry are wide/rare and go to
 * `ActionReportExtras` so this stays one line. `data-scm-report` stays on this
 * node so existing selectors keep resolving the report by tone.
 */
const ActionReportSummary: React.FC<{
  report: ScmActionReport;
  onDismiss: () => void;
}> = ({ report, onDismiss }) => {
  const { t } = useTranslation();
  return (
    <div data-scm-report={report.tone} className='flex-1 min-w-0 flex items-center gap-4px text-12px'>
      <span className={`flex-1 min-w-0 truncate ${reportToneClass(report.tone)}`}>{report.message}</span>
      <Button type='text' size='mini' className='flex-shrink-0' aria-label={t('common.close')} onClick={onDismiss}>
        ×
      </Button>
    </div>
  );
};

/**
 * The report's secondary parts — a failed-file detail line and a retry button —
 * on their own full-width row below the header. Renders nothing when neither is
 * present (the common success case), so the summary stays a single line up top.
 * Retry appears only when trying again could actually succeed.
 */
const ActionReportExtras: React.FC<{
  report: ScmActionReport;
  /** Disables retry while another action is in flight (parity with row/bulk buttons). */
  busy: boolean;
  onRetry: () => void;
}> = ({ report, busy, onRetry }) => {
  const { t } = useTranslation();
  if (!report.detail && !report.retryable) return null;
  return (
    <div className='flex-shrink-0 flex items-start gap-4px px-8px py-4px text-12px border-b border-[var(--bg-3)]'>
      {report.detail && <div className='flex-1 min-w-0 text-t-tertiary break-all'>{report.detail}</div>}
      {report.retryable && (
        <Button type='text' size='mini' data-scm-retry disabled={busy} onClick={onRetry}>
          {t('conversation.explorer.scm.actions.retry')}
        </Button>
      )}
    </div>
  );
};

const PanelNotice: React.FC<{ text: string }> = ({ text }) => (
  <div className='h-full flex items-center justify-center px-16px text-center text-t-secondary text-13px'>{text}</div>
);
