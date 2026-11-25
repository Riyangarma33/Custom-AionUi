/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { ConversationFolder } from '@/common/config/clientSettings';
import type { TChatConversation } from '@/common/config/storage';
import {
  getConversationGroupId,
  resolveWorkspaceFolders,
  sanitizeConversationFolders,
} from '@/renderer/pages/conversation/GroupedHistory/utils/conversationFolders';

const conversation = (id: string, extra: Record<string, unknown>, modified_at = 100): TChatConversation =>
  ({
    id,
    name: id,
    type: 'acp',
    created_at: modified_at,
    modified_at,
    extra,
  }) as unknown as TChatConversation;

const folder = (overrides: Partial<ConversationFolder> = {}): ConversationFolder => ({
  group_id: 'g1',
  workspace: '/ws',
  parent_id: null,
  name: 'Folder',
  order_key: 1024,
  ...overrides,
});

describe('getConversationGroupId', () => {
  it('reads a non-empty string group_id', () => {
    expect(getConversationGroupId(conversation('c1', { group_id: 'g1' }))).toBe('g1');
  });

  it('treats missing, empty and non-string values as no folder', () => {
    expect(getConversationGroupId(conversation('c1', {}))).toBeNull();
    expect(getConversationGroupId(conversation('c2', { group_id: '' }))).toBeNull();
    expect(getConversationGroupId(conversation('c3', { group_id: 42 }))).toBeNull();
    expect(getConversationGroupId(conversation('c4', { group_id: null }))).toBeNull();
  });
});

describe('sanitizeConversationFolders', () => {
  it('returns an empty catalog for non-array payloads', () => {
    expect(sanitizeConversationFolders(undefined)).toEqual([]);
    expect(sanitizeConversationFolders(null)).toEqual([]);
    expect(sanitizeConversationFolders({ group_id: 'g1' })).toEqual([]);
  });

  it('drops invalid entries, dedupes ids and assigns fallback order keys', () => {
    const result = sanitizeConversationFolders([
      folder({ group_id: 'g1', name: '  Work  ' }),
      folder({ group_id: 'g1', name: 'Duplicate' }),
      { group_id: '', workspace: '/ws', name: 'Missing id' },
      { group_id: 'g2', workspace: '/ws', name: '' },
      'not-an-object',
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({ group_id: 'g1', name: 'Work', parent_id: null, order_key: 1024 })
    );
  });

  it('drops self-parenting', () => {
    const [result] = sanitizeConversationFolders([folder({ group_id: 'g1', parent_id: 'g1' })]);
    expect(result.parent_id).toBeNull();
  });
});

describe('resolveWorkspaceFolders', () => {
  const ws = '/ws';

  it('returns the conversations unchanged when the catalog has no folders for the workspace', () => {
    const conversations = [conversation('c1', { workspace: ws, custom_workspace: true })];
    const result = resolveWorkspaceFolders(ws, [], conversations);

    expect(result.folders).toEqual([]);
    expect(result.rootConversations).toEqual(conversations);
  });

  it('buckets conversations by group_id and keeps unresolved memberships at the root', () => {
    const conversations = [
      conversation('root', { workspace: ws, custom_workspace: true }),
      conversation('in-folder', { workspace: ws, custom_workspace: true, group_id: 'g1' }),
      conversation('orphan', { workspace: ws, custom_workspace: true, group_id: 'missing' }),
    ];

    const result = resolveWorkspaceFolders(ws, [folder({ group_id: 'g1' })], conversations);

    expect(result.rootConversations.map((c) => c.id)).toEqual(['root', 'orphan']);
    expect(result.folders).toHaveLength(1);
    expect(result.folders[0].conversations.map((c) => c.id)).toEqual(['in-folder']);
  });

  it('keeps empty folders in the tree (catalog is authoritative)', () => {
    const result = resolveWorkspaceFolders(ws, [folder({ group_id: 'g1' })], []);
    expect(result.folders).toHaveLength(1);
    expect(result.folders[0].conversations).toEqual([]);
  });

  it('walks parent_id but demotes anything deeper than one level to the root', () => {
    const catalog = [
      folder({ group_id: 'a', name: 'A', parent_id: null, order_key: 1 }),
      folder({ group_id: 'b', name: 'B', parent_id: 'a', order_key: 2 }),
      folder({ group_id: 'c', name: 'C', parent_id: 'b', order_key: 3 }),
    ];

    const result = resolveWorkspaceFolders(ws, catalog, []);

    // A and demoted C sit at the top level; B is A's only child.
    expect(result.folders.map((f) => f.group_id)).toEqual(['a', 'c']);
    expect(result.folders[0].children.map((f) => f.group_id)).toEqual(['b']);
    expect(result.folders[0].children[0].children).toEqual([]);
  });

  it('treats parent cycles as root folders', () => {
    const catalog = [
      folder({ group_id: 'a', parent_id: 'b', order_key: 1 }),
      folder({ group_id: 'b', parent_id: 'a', order_key: 2 }),
    ];

    const result = resolveWorkspaceFolders(ws, catalog, []);
    expect(result.folders.map((f) => f.group_id).sort()).toEqual(['a', 'b']);
    expect(result.folders.every((f) => f.children.length === 0)).toBe(true);
  });

  it('ignores folders belonging to another workspace when resolving parents', () => {
    const catalog = [
      folder({ group_id: 'a', workspace: '/other', parent_id: null }),
      folder({ group_id: 'b', workspace: ws, parent_id: 'a' }),
    ];

    const result = resolveWorkspaceFolders(ws, catalog, []);
    expect(result.folders.map((f) => f.group_id)).toEqual(['b']);
    expect(result.folders[0].parent_id).toBeNull();
  });
});
