/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useConversationFolders } from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationFolders';
import { useConversationListSync } from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync';
import type { GroupedHistoryResult } from '@/renderer/pages/conversation/GroupedHistory/types';
import { buildGroupedHistory } from '@/renderer/pages/conversation/GroupedHistory/utils/groupingHelpers';

export type ConversationHistoryContextValue = ReturnType<typeof useConversationListSync> & {
  groupedHistory: GroupedHistoryResult;
  /** Conversation folder catalog + mutation handlers (Phase 3.12, Track A). */
  conversationFolders: ReturnType<typeof useConversationFolders>;
};

const ConversationHistoryContext = createContext<ConversationHistoryContextValue | null>(null);

export const ConversationHistoryProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { t } = useTranslation();
  const conversationListSync = useConversationListSync();
  const conversationFolders = useConversationFolders(conversationListSync.conversations);

  const groupedHistory = useMemo(() => {
    return buildGroupedHistory(conversationListSync.conversations, t, conversationFolders.folders);
  }, [conversationListSync.conversations, t, conversationFolders.folders]);

  const value = useMemo<ConversationHistoryContextValue>(() => {
    return {
      ...conversationListSync,
      groupedHistory,
      conversationFolders,
    };
  }, [conversationListSync, groupedHistory, conversationFolders]);

  return <ConversationHistoryContext.Provider value={value}>{children}</ConversationHistoryContext.Provider>;
};

export const useConversationHistoryContext = (): ConversationHistoryContextValue => {
  const context = useContext(ConversationHistoryContext);

  if (!context) {
    throw new Error('useConversationHistoryContext must be used within ConversationHistoryProvider');
  }

  return context;
};
