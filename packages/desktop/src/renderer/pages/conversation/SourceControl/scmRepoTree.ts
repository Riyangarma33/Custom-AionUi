/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pure display-layer grouping for the Repositories section: fold linked worktrees
 * under the primary clone they belong to, VS Code style. No I/O, no React.
 *
 * Contract it consumes (aioncore `scm/types.rs`, frozen by that repo's
 * `wire_test.rs`): each `ScmRepository` may carry
 *
 *  - `is_worktree` — omitted (⇒ `undefined`) when false; true only for a linked
 *    worktree surfaced under one-level workspace discovery;
 *  - `worktree_of` — the primary repository's `repo_id`, present **only when that
 *    primary is also in this project's surfaced set**; omitted otherwise.
 *
 * The two are independent inputs, not one flag: a worktree whose primary is out of
 * view carries `is_worktree: true` with **no** `worktree_of`. Grouping is a pure
 * function of the list, matched by `repo_id` (never by path text) — the id is the
 * only stable key the backend promises.
 *
 * The result is a **display grouping only**. Selection / status / switching keep
 * their per-repo semantics unchanged: a nested worktree row selects that worktree's
 * own `repo_id`, exactly as an outer row does.
 */

import type { ScmRepository } from './scmModel';

/**
 * A node in the repository tree (supports arbitrary nesting depth for submodules
 * and worktrees).
 */
export type ScmRepoNode = {
  repo: ScmRepository;
  kind: 'primary' | 'submodule' | 'worktree' | 'orphanWorktree' | 'orphanSubmodule';
  worktrees: ScmRepository[];
  submodules: ScmRepoNode[];
};

/**
 * One outer entry in the grouped Repositories list.
 *
 *  - `primary` — a normal top-level repo. `worktrees` holds any linked worktrees
 *    that named it via `worktree_of`. `submodules` holds any nested submodules
 *    that named it via `submodule_of`.
 *  - `orphanWorktree` — a linked worktree whose primary is **not** in view; it is
 *    surfaced at the outer level.
 *  - `orphanSubmodule` — a submodule whose parent is **not** in view; it is
 *    surfaced at the outer level.
 */
export type ScmRepoGroup =
  | { kind: 'primary'; repo: ScmRepository; worktrees: ScmRepository[]; submodules: ScmRepoNode[] }
  | { kind: 'orphanWorktree'; repo: ScmRepository; worktrees: ScmRepository[]; submodules: ScmRepoNode[] }
  | { kind: 'orphanSubmodule'; repo: ScmRepository; worktrees: ScmRepository[]; submodules: ScmRepoNode[] };

/** Display name a repo sorts by — the same string the row renders. */
const repoSortName = (repo: ScmRepository): string => repo.pe_name || repo.label;

/** Case-insensitive, then case-sensitive tie-break, for stable alphabetical order. */
const byName = (a: ScmRepository, b: ScmRepository): number => {
  const an = repoSortName(a);
  const bn = repoSortName(b);
  const ci = an.toLowerCase().localeCompare(bn.toLowerCase());
  return ci !== 0 ? ci : an.localeCompare(bn);
};

/**
 * Group a flat repository list into primaries with their nested worktrees and submodules,
 * plus any orphan worktrees or submodules at the outer level.
 *
 * Submodules are resolved recursively to arbitrary depth (e.g. parent -> submodule -> nested submodule).
 */
export const groupRepositories = (repositories: ScmRepository[]): ScmRepoGroup[] => {
  const byId = new Map<string, ScmRepository>();
  for (const repo of repositories) byId.set(repo.repo_id, repo);

  // A worktree "belongs" only when its named primary is actually present.
  const worktreeParentOf = (repo: ScmRepository): string | undefined =>
    repo.is_worktree && repo.worktree_of && byId.has(repo.worktree_of) ? repo.worktree_of : undefined;

  // A submodule "belongs" only when its parent is actually present.
  const submoduleParentOf = (repo: ScmRepository): string | undefined => {
    if (!repo.is_submodule) return undefined;
    const parentId = repo.submodule_of || repo.parent_repo;
    return parentId && byId.has(parentId) ? parentId : undefined;
  };

  // Bucket worktrees under their resolved primary id.
  const worktreesOf = new Map<string, ScmRepository[]>();
  for (const repo of repositories) {
    const parentId = worktreeParentOf(repo);
    if (parentId === undefined) continue;
    const bucket = worktreesOf.get(parentId);
    if (bucket) bucket.push(repo);
    else worktreesOf.set(parentId, [repo]);
  }

  // Bucket submodules under their resolved parent id.
  const submodulesOf = new Map<string, ScmRepository[]>();
  for (const repo of repositories) {
    const parentId = submoduleParentOf(repo);
    if (parentId === undefined) continue;
    const bucket = submodulesOf.get(parentId);
    if (bucket) bucket.push(repo);
    else submodulesOf.set(parentId, [repo]);
  }

  // Recursive builder for submodule tree nodes
  const buildSubmoduleNode = (repo: ScmRepository, visited: Set<string>): ScmRepoNode => {
    if (visited.has(repo.repo_id)) {
      return { repo, kind: 'submodule', worktrees: [], submodules: [] };
    }
    visited.add(repo.repo_id);
    const wts = (worktreesOf.get(repo.repo_id) ?? []).toSorted(byName);
    const directSubs = (submodulesOf.get(repo.repo_id) ?? []).toSorted(byName);
    const subs = directSubs.map((sub) => buildSubmoduleNode(sub, visited));
    return {
      repo,
      kind: 'submodule',
      worktrees: wts,
      submodules: subs,
    };
  };

  const groups: ScmRepoGroup[] = [];
  for (const repo of repositories) {
    // If it belongs to an in-view parent as a worktree or submodule, it is rendered nested, not at the outer level.
    if (worktreeParentOf(repo) !== undefined || submoduleParentOf(repo) !== undefined) continue;

    const worktrees = (worktreesOf.get(repo.repo_id) ?? []).toSorted(byName);
    const directSubs = (submodulesOf.get(repo.repo_id) ?? []).toSorted(byName);
    const submodules = directSubs.map((sub) => buildSubmoduleNode(sub, new Set([repo.repo_id])));

    if (repo.is_worktree === true) {
      groups.push({ kind: 'orphanWorktree', repo, worktrees, submodules });
    } else if (repo.is_submodule === true) {
      groups.push({ kind: 'orphanSubmodule', repo, worktrees, submodules });
    } else {
      groups.push({ kind: 'primary', repo, worktrees, submodules });
    }
  }

  return groups.toSorted((a, b) => byName(a.repo, b.repo));
};

/**
 * The `repo_id`s of every repository that has at least one nested worktree or submodule —
 * the rows the view can expand/collapse.
 */
export const expandableRepoIds = (groups: ScmRepoGroup[]): string[] => {
  const ids: string[] = [];
  const collect = (repo: ScmRepository, wts: ScmRepository[], subs: ScmRepoNode[]) => {
    if (wts.length > 0 || subs.length > 0) {
      ids.push(repo.repo_id);
    }
    for (const sub of subs) {
      collect(sub.repo, sub.worktrees, sub.submodules);
    }
  };
  for (const g of groups) {
    collect(g.repo, g.worktrees, g.submodules);
  }
  return ids;
};
