/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import { SWRConfig } from 'swr';

const conversationGetMock = vi.fn();
const conversationUpdateMock = vi.fn();
const emitterInstance = new EventEmitter();

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      get: {
        invoke: (...args: unknown[]) => conversationGetMock(...args),
      },
      update: {
        invoke: (...args: unknown[]) => conversationUpdateMock(...args),
      },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/renderer/components/agent/AgentBadge', () => ({
  AgentLogoIcon: () => null,
}));

vi.mock('@/renderer/hooks/agent/usePresetAssistantInfo', () => ({
  usePresetAssistantInfo: () => ({ info: null, isLoading: false }),
}));

vi.mock('@/renderer/pages/conversation/utils/conversationAssistantIdentity', () => ({
  resolveConversationBackend: () => undefined,
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  refreshConversationCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: emitterInstance,
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
    },
  };
});

import MobileConversationBrand from '@/renderer/components/layout/Titlebar/MobileConversationBrand';

const renderComponent = (props: { conversation_id: string; fallbackTitle: string }) => {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <MobileConversationBrand {...props} />
    </SWRConfig>
  );
};

describe('MobileConversationBrand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emitterInstance.removeAllListeners();
  });

  it('verifies title display from server or fallback', async () => {
    conversationGetMock.mockResolvedValue({ id: 'conv-1', name: 'Project Alpha' });

    renderComponent({ conversation_id: 'conv-1', fallbackTitle: 'Fallback Alpha' });

    // Initially or after SWR resolves
    await waitFor(() => {
      expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    });
  });

  it('verifies click-to-edit transition', async () => {
    conversationGetMock.mockResolvedValue({ id: 'conv-1', name: 'Project Alpha' });

    renderComponent({ conversation_id: 'conv-1', fallbackTitle: 'Fallback Alpha' });

    await waitFor(() => {
      expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    });

    const trigger = screen.getByTestId('mobile-conversation-brand-trigger');
    fireEvent.click(trigger);

    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('Project Alpha');
  });

  it('verifies Enter submission and optimistic update', async () => {
    conversationGetMock.mockResolvedValue({ id: 'conv-1', name: 'Project Alpha' });
    conversationUpdateMock.mockResolvedValue(true);

    renderComponent({ conversation_id: 'conv-1', fallbackTitle: 'Fallback Alpha' });

    await waitFor(() => {
      expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mobile-conversation-brand-trigger'));

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Project Beta' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(conversationUpdateMock).toHaveBeenCalledWith({
        id: 'conv-1',
        updates: { name: 'Project Beta' },
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Project Beta')).toBeInTheDocument();
    });
  });

  it('verifies tap-outside/blur submits draft and updates title', async () => {
    conversationGetMock.mockResolvedValue({ id: 'conv-1', name: 'Project Alpha' });
    conversationUpdateMock.mockResolvedValue(true);

    renderComponent({ conversation_id: 'conv-1', fallbackTitle: 'Fallback Alpha' });

    await waitFor(() => {
      expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mobile-conversation-brand-trigger'));

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Updated Title' } });

    // Tap outside (blur)
    fireEvent.blur(input);

    await waitFor(() => {
      expect(conversationUpdateMock).toHaveBeenCalledWith({
        id: 'conv-1',
        updates: { name: 'Updated Title' },
      });
    });

    await waitFor(() => {
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(screen.getByText('Updated Title')).toBeInTheDocument();
    });
  });

  it('verifies form submit applies rename and has enterKeyHint="done"', async () => {
    conversationGetMock.mockResolvedValue({ id: 'conv-1', name: 'Project Alpha' });
    conversationUpdateMock.mockResolvedValue(true);

    renderComponent({ conversation_id: 'conv-1', fallbackTitle: 'Fallback Alpha' });

    await waitFor(() => {
      expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mobile-conversation-brand-trigger'));

    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('enterkeyhint', 'done');

    fireEvent.change(input, { target: { value: 'Form Submitted Title' } });
    const form = input.closest('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(conversationUpdateMock).toHaveBeenCalledWith({
        id: 'conv-1',
        updates: { name: 'Form Submitted Title' },
      });
    });

    await waitFor(() => {
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(screen.getByText('Form Submitted Title')).toBeInTheDocument();
    });
  });

  it('verifies Escape cancellation reverts draft without submitting', async () => {
    conversationGetMock.mockResolvedValue({ id: 'conv-1', name: 'Project Alpha' });

    renderComponent({ conversation_id: 'conv-1', fallbackTitle: 'Fallback Alpha' });

    await waitFor(() => {
      expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mobile-conversation-brand-trigger'));

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Cancelled Title' } });

    // Press Escape
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });

    expect(conversationUpdateMock).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    });
  });

  it('verifies chat.history.refresh firing immediately after local rename does not revert displayed title', async () => {
    conversationGetMock.mockResolvedValue({ id: 'conv-1', name: 'Original Title' });
    conversationUpdateMock.mockResolvedValue(true);

    renderComponent({ conversation_id: 'conv-1', fallbackTitle: 'Original Title' });

    await waitFor(() => {
      expect(screen.getByText('Original Title')).toBeInTheDocument();
    });

    // Enter edit mode and submit rename
    fireEvent.click(screen.getByTestId('mobile-conversation-brand-trigger'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'New Renamed Title' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('New Renamed Title')).toBeInTheDocument();
    });

    // Server returns stale data on next get invocation
    conversationGetMock.mockResolvedValue({ id: 'conv-1', name: 'Original Title' });

    // Fire chat.history.refresh event
    await act(async () => {
      emitterInstance.emit('chat.history.refresh');
    });

    // Verify title remains 'New Renamed Title' and does NOT revert to stale 'Original Title'
    expect(screen.getByText('New Renamed Title')).toBeInTheDocument();
    expect(screen.queryByText('Original Title')).not.toBeInTheDocument();
  });
});
