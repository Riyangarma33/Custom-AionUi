/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';

const fetchModelListMock = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    mode: {
      fetchModelList: {
        invoke: (...args: any[]) => fetchModelListMock(...args),
      },
    },
  },
}));

import useModeModeList from '@/renderer/hooks/agent/useModeModeList';

const createWrapper = () => {
  const cache = new Map();
  return ({ children }: { children: React.ReactNode }) => (
    <SWRConfig value={{ provider: () => cache, dedupingInterval: 0 }}>{children}</SWRConfig>
  );
};

describe('useModeModeList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps models lacking name property to id as fallback label', async () => {
    fetchModelListMock.mockResolvedValue({
      models: [
        { id: 'cx/gpt-6-astra', context_length: 272000, max_completion_tokens: 128000 },
        { id: 'ag/gemini-3.8-flash-high', context_length: 1048576 },
        'gpt-4o',
        { id: 'anthropic.claude-v2', name: 'Claude 2' },
      ],
    });

    const { result } = renderHook(
      () => useModeModeList('custom', 'http://127.0.0.1:20138/v1', 'sk-test', true),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.data?.models).toBeDefined();
    });

    expect(result.current.data?.models).toEqual([
      { label: 'cx/gpt-6-astra', value: 'cx/gpt-6-astra' },
      { label: 'ag/gemini-3.8-flash-high', value: 'ag/gemini-3.8-flash-high' },
      { label: 'gpt-4o', value: 'gpt-4o' },
      { label: 'Claude 2', value: 'anthropic.claude-v2' },
    ]);
  });
});
