/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConversationFolder } from '@/common/config/clientSettings';
import type { TChatConversation } from '@/common/config/storage';
import type { ReactNode } from 'react';

/**
 * A folder plus its resolved members, ready to render. `children` is walked by
 * the renderer (never hardcoded to two levels); the resolver caps effective
 * depth at `CONVERSATION_FOLDER_MAX_DEPTH`.
 */
export type ResolvedConversationFolder = ConversationFolder & {
  conversations: TChatConversation[];
  children: ResolvedConversationFolder[];
};

/**
 * One destination of a "Move to folder" surface. `groupId` is `null` for the
 * project root; `isCurrent` marks where the conversation already lives so every
 * surface can disable that entry instead of offering a no-op move. Produced by
 * `getMoveTargets` and consumed by both the desktop row-menu submenu and the
 * mobile action sheet.
 */
export type ConversationMoveTarget = {
  groupId: string | null;
  label: string;
  isCurrent: boolean;
};

export type WorkspaceGroup = {
  workspace: string;
  display_name: string;
  /** Every conversation in the group (folders included) — project-level actions use this. */
  conversations: TChatConversation[];
  /** Conversations rendered directly under the project row (`group_id` NULL/unresolved). */
  rootConversations: TChatConversation[];
  /** Catalog-backed folder tree for this workspace. */
  folders: ResolvedConversationFolder[];
};

export type TimelineItem = {
  type: 'workspace' | 'conversation';
  time: number;
  workspaceGroup?: WorkspaceGroup;
  conversation?: TChatConversation;
};

export type TimelineSection = {
  timeline: string;
  items: TimelineItem[];
};

export type GroupedHistoryResult = {
  pinnedConversations: TChatConversation[];
  timelineSections: TimelineSection[];
};

export type ExportZipFile = {
  name: string;
  content?: string;
  sourcePath?: string;
};

export type ExportTask =
  | { mode: 'single'; conversation: TChatConversation }
  | { mode: 'batch'; conversation_ids: string[] }
  | null;

export type ConversationRowProps = {
  conversation: TChatConversation;
  isGenerating: boolean;
  /** The agent is blocked awaiting the user (tool permission or a question).
   *  Takes display precedence over `isGenerating` — a distinct "needs you" icon
   *  replaces the generating spinner. */
  isWaitingConfirmation: boolean;
  hasUnread: boolean;
  /** Whether the user manually marked this conversation as unread (persisted). */
  isManualUnread: boolean;
  collapsed: boolean;
  tooltipEnabled: boolean;
  batchMode: boolean;
  checked: boolean;
  selected: boolean;
  menuVisible: boolean;
  onToggleChecked: (conversation: TChatConversation) => void;
  onConversationClick: (conversation: TChatConversation) => void;
  onOpenMenu: (conversation: TChatConversation) => void;
  onMenuVisibleChange: (conversation_id: string, visible: boolean) => void;
  onEditStart: (conversation: TChatConversation) => void;
  onCreateCronTask: (conversation: TChatConversation) => void;
  onArchive: (conversation: TChatConversation) => void;
  onExport?: (conversation: TChatConversation) => void;
  onTogglePin: (conversation: TChatConversation) => void;
  onToggleManualUnread: (conversation: TChatConversation) => void;
  getJobStatus: (conversation_id: string) => 'none' | 'active' | 'paused' | 'error' | 'unread';
  /** Resolve a loaded conversation's name by id (fork-lineage badge tooltip). */
  resolveConversationName?: (conversation_id: string) => string | undefined;
  /** When true, the agent icon is dimmed by default and only shows full color on hover. Used inside project folders to reduce visual weight. */
  dimIcon?: boolean;
  /**
   * Visual indentation inside a project group: 0 = flat list, 1 = directly
   * under the project row, 2 = inside a conversation folder. Content is
   * indented while the row background stays full-width.
   */
  indentLevel?: 0 | 1 | 2;
  /** Mobile entry point: open the "Move to folder" action sheet. */
  onMoveToFolder?: (conversation: TChatConversation) => void;
  /**
   * Destinations for the desktop row-menu "Move to folder" submenu (project root
   * first, then the workspace's folders). Supplied together with
   * `onMoveToFolder` for project/folder rows only; with no folder in the list the
   * submenu is not rendered at all. The mobile sheet ignores it.
   */
  moveTargets?: ConversationMoveTarget[];
  /** Desktop path: move this conversation to `group_id` (`null` = project root). */
  onMoveToGroup?: (conversation: TChatConversation, group_id: string | null) => void;
  /** Hover-reveal drag handle overlaying the leading icon; supplied by the sortable wrapper for reorderable (pinned) rows. */
  dragHandle?: ReactNode;
};

export type WorkspaceGroupedHistoryProps = {
  onSessionClick?: () => void;
  collapsed?: boolean;
  tooltipEnabled?: boolean;
  batchMode?: boolean;
  onBatchModeChange?: (value: boolean) => void;
  afterPinnedContent?: ReactNode;
};

export type DragItemType = 'conversation' | 'workspace';

export type DragItem = {
  type: DragItemType;
  id: string;
  conversation?: TChatConversation;
  workspaceGroup?: WorkspaceGroup;
  sourceSection: 'pinned' | string;
  sourceWorkspace?: string;
};
