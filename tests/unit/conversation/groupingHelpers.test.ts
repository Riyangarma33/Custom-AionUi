/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import { buildGroupedHistory } from '@/renderer/pages/conversation/GroupedHistory/utils/groupingHelpers';

const t = (key: string): string => key;

const conversation = (id: string, extra: Record<string, unknown>, modified_at: number): TChatConversation =>
  ({
    id,
    name: id,
    type: 'acp',
    created_at: modified_at,
    modified_at,
    extra,
  }) as unknown as TChatConversation;

describe('buildGroupedHistory', () => {
  it('keeps scheduled-task conversations in the regular conversation timeline', () => {
    const result = buildGroupedHistory(
      [conversation('cron-conversation', { backend: 'aioncore', cron_job_id: 'job-1' }, 100)],
      t
    );

    expect(result.timelineSections[0]?.items).toEqual([
      expect.objectContaining({
        type: 'conversation',
        conversation: expect.objectContaining({ id: 'cron-conversation' }),
      }),
    ]);
  });

  it('keeps scheduled-task conversations with workspaces in the project section', () => {
    const result = buildGroupedHistory(
      [
        conversation(
          'cron-project-conversation',
          {
            backend: 'aioncore',
            cron_job_id: 'job-1',
            workspace: '/repo/aionui',
            custom_workspace: true,
          },
          100
        ),
      ],
      t
    );

    expect(result.timelineSections[0]?.items).toEqual([
      expect.objectContaining({
        type: 'workspace',
        workspaceGroup: expect.objectContaining({
          workspace: '/repo/aionui',
          conversations: [expect.objectContaining({ id: 'cron-project-conversation' })],
        }),
      }),
    ]);
  });

  it('continues to hide team-owned conversations from the regular history', () => {
    const result = buildGroupedHistory(
      [conversation('team-conversation', { backend: 'aioncore', team_id: 'team-1' }, 100)],
      t
    );

    expect(result.timelineSections).toEqual([]);
  });

  describe('conversation folders', () => {
    const workspaceExtra = { backend: 'aioncore', workspace: '/repo/aionui', custom_workspace: true };

    it('renders exactly as before when the catalog is absent and every group_id is NULL', () => {
      const conversations = [
        conversation('a', workspaceExtra, 100),
        conversation('b', workspaceExtra, 200),
      ];

      const result = buildGroupedHistory(conversations, t);
      const group = result.timelineSections[0]?.items[0]?.workspaceGroup;

      expect(group?.folders).toEqual([]);
      expect(group?.rootConversations.map((c) => c.id)).toEqual(['b', 'a']);
      expect(group?.conversations.map((c) => c.id)).toEqual(['b', 'a']);
    });

    it('buckets conversations into the project folder catalog', () => {
      const conversations = [
        conversation('root', workspaceExtra, 100),
        conversation('foldered', { ...workspaceExtra, group_id: 'g1' }, 200),
      ];

      const result = buildGroupedHistory(
        conversations,
        t,
        [{ group_id: 'g1', workspace: '/repo/aionui', parent_id: null, name: 'Work', order_key: 1 }]
      );
      const group = result.timelineSections[0]?.items[0]?.workspaceGroup;

      expect(group?.folders).toHaveLength(1);
      expect(group?.folders[0].name).toBe('Work');
      expect(group?.folders[0].conversations.map((c) => c.id)).toEqual(['foldered']);
      expect(group?.rootConversations.map((c) => c.id)).toEqual(['root']);
      // Project-level actions still see every conversation.
      expect(group?.conversations).toHaveLength(2);
    });

    it('keeps an empty folder visible', () => {
      const result = buildGroupedHistory(
        [conversation('root', workspaceExtra, 100)],
        t,
        [{ group_id: 'g1', workspace: '/repo/aionui', parent_id: null, name: 'Empty', order_key: 1 }]
      );
      const group = result.timelineSections[0]?.items[0]?.workspaceGroup;

      expect(group?.folders.map((f) => f.group_id)).toEqual(['g1']);
      expect(group?.folders[0].conversations).toEqual([]);
    });
  });
});
