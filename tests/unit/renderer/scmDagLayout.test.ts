/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import type { ScmCommitNode } from '@/renderer/pages/conversation/SourceControl/scmModel';
import { computeDagLayout, LANE_COLORS } from '@/renderer/pages/conversation/SourceControl/ScmGraphView';

const makeCommit = (over: Partial<ScmCommitNode> = {}): ScmCommitNode => ({
  sha: '0000000000000000000000000000000000000001',
  short_sha: '0000001',
  author_name: 'Author',
  author_email: 'author@test.local',
  author_timestamp: 1700000000,
  committer_name: 'Committer',
  committer_email: 'committer@test.local',
  committer_timestamp: 1700000000,
  subject: 'Test commit',
  message: 'Test commit message',
  parents: [],
  refs: [],
  is_head: false,
  ...over,
});

describe('computeDagLayout (client-side topological lane allocator)', () => {
  it('allocates a single lane for linear commits', () => {
    const c1 = makeCommit({ sha: 'c1', short_sha: 'c1', parents: ['c2'] });
    const c2 = makeCommit({ sha: 'c2', short_sha: 'c2', parents: ['c3'] });
    const c3 = makeCommit({ sha: 'c3', short_sha: 'c3', parents: [] });

    const { rows, maxLane } = computeDagLayout([c1, c2, c3]);

    expect(maxLane).toBe(0);
    expect(rows).toHaveLength(3);
    expect(rows[0].lane).toBe(0);
    expect(rows[1].lane).toBe(0);
    expect(rows[2].lane).toBe(0);
    expect(rows[0].color).toBe(LANE_COLORS[0]);
  });

  it('allocates distinct lanes for branch forks', () => {
    // c1 is on main (parent c3), c2 is on feature (parent c3), c3 is common root
    const c1 = makeCommit({ sha: 'c1', short_sha: 'c1', parents: ['c3'] });
    const c2 = makeCommit({ sha: 'c2', short_sha: 'c2', parents: ['c3'] });
    const c3 = makeCommit({ sha: 'c3', short_sha: 'c3', parents: [] });

    const { rows, maxLane } = computeDagLayout([c1, c2, c3]);

    expect(maxLane).toBeGreaterThanOrEqual(1);
    expect(rows[0].lane).toBe(0);
    expect(rows[1].lane).toBe(1);
    expect(rows[0].color).toBe(LANE_COLORS[0]);
    expect(rows[1].color).toBe(LANE_COLORS[1]);
  });

  it('detects merge commits with multiple parents', () => {
    const cMerge = makeCommit({
      sha: 'c_merge',
      short_sha: 'c_merge',
      parents: ['c_main', 'c_feat'],
      is_head: true,
    });
    const cMain = makeCommit({ sha: 'c_main', short_sha: 'c_main', parents: ['c_root'] });
    const cFeat = makeCommit({ sha: 'c_feat', short_sha: 'c_feat', parents: ['c_root'] });
    const cRoot = makeCommit({ sha: 'c_root', short_sha: 'c_root', parents: [] });

    const { rows } = computeDagLayout([cMerge, cMain, cFeat, cRoot]);

    expect(rows[0].isMerge).toBe(true);
    expect(rows[0].isHead).toBe(true);
    expect(rows[0].routes.some((r) => r.type === 'merge' || r.type === 'branch')).toBe(true);
  });
});
