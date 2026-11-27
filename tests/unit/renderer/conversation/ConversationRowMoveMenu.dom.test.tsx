/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import type { ConversationMoveTarget } from '@/renderer/pages/conversation/GroupedHistory/types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/renderer/hooks/agent/usePresetAssistantInfo', () => ({
  usePresetAssistantInfo: () => ({ info: null }),
}));

// The move affordance is platform-split (desktop submenu / mobile sheet entry),
// so the layout flag has to be flippable per test.
const layout = vi.hoisted(() => ({ isMobile: false }));
vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => layout,
}));

vi.mock('@/renderer/pages/conversation/utils/conversationAssistantIdentity', () => ({
  resolveConversationLeadingMark: () => ({ kind: 'default' }),
}));

vi.mock('@/renderer/pages/cron', () => ({
  CronJobIndicator: () => null,
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  useAgentLogos: () => ({}),
}));

vi.mock('@/renderer/utils/ui/siderTooltip', () => ({
  cleanupSiderTooltips: vi.fn(),
  getSiderTooltipProps: () => ({ disabled: true }),
}));

import ConversationRow from '@/renderer/pages/conversation/GroupedHistory/ConversationRow';
import type { ConversationRowProps } from '@/renderer/pages/conversation/GroupedHistory/types';

const conversation = {
  id: 'move-menu-conversation',
  name: 'Movable chat',
  type: 'acp',
  created_at: 1,
  modified_at: 1,
  extra: { backend: 'claude', workspace: '/ws' },
  model: {},
} as TChatConversation;

const rootAtProject: ConversationMoveTarget[] = [
  { groupId: null, label: 'conversation.history.projectRoot', isCurrent: true },
  { groupId: 'g1', label: 'Work folder', isCurrent: false },
];

const onlyRoot: ConversationMoveTarget[] = [
  { groupId: null, label: 'conversation.history.projectRoot', isCurrent: true },
];

const makeProps = (overrides: Partial<ConversationRowProps> = {}): ConversationRowProps => ({
  conversation,
  isGenerating: false,
  isWaitingConfirmation: false,
  hasUnread: false,
  isManualUnread: false,
  collapsed: false,
  tooltipEnabled: false,
  batchMode: false,
  checked: false,
  selected: false,
  menuVisible: true,
  onToggleChecked: vi.fn(),
  onConversationClick: vi.fn(),
  onOpenMenu: vi.fn(),
  onMenuVisibleChange: vi.fn(),
  onEditStart: vi.fn(),
  onCreateCronTask: vi.fn(),
  onArchive: vi.fn(),
  onTogglePin: vi.fn(),
  onToggleManualUnread: vi.fn(),
  getJobStatus: () => 'none',
  ...overrides,
});

describe('conversation row move affordance', () => {
  it('renders a desktop submenu for the move destinations instead of hiding the action', async () => {
    layout.isMobile = false;
    render(<ConversationRow {...makeProps({ onMoveToFolder: vi.fn(), moveTargets: rootAtProject })} />);

    // The submenu header (Menu.SubMenu) carries aria-haspopup; its items are popped
    // on hover, so only the header is in the DOM until the user reaches for it.
    const label = await screen.findByText('conversation.history.moveToFolder');
    expect(label.closest('[aria-haspopup]')).not.toBeNull();
    // Sibling actions keep their order around it.
    expect(screen.getByText('conversation.history.rename')).toBeInTheDocument();
    expect(screen.getByText('conversation.history.archive')).toBeInTheDocument();
  });

  it('omits the desktop submenu when the workspace has no folder to move into', async () => {
    layout.isMobile = false;
    render(<ConversationRow {...makeProps({ onMoveToFolder: vi.fn(), moveTargets: onlyRoot })} />);

    expect(await screen.findByText('conversation.history.rename')).toBeInTheDocument();
    expect(screen.queryByText('conversation.history.moveToFolder')).not.toBeInTheDocument();
  });

  it('keeps the mobile flat sheet entry that opens the action sheet', async () => {
    layout.isMobile = true;
    const onMoveToFolder = vi.fn();
    render(<ConversationRow {...makeProps({ onMoveToFolder, moveTargets: rootAtProject })} />);

    const item = await screen.findByText('conversation.history.moveToFolder');
    // Mobile stays a plain menu item (no nested popup) — the action sheet is the surface.
    expect(item.closest('[aria-haspopup]')).toBeNull();
    fireEvent.click(item);
    await waitFor(() => expect(onMoveToFolder).toHaveBeenCalledWith(conversation));
  });
});
