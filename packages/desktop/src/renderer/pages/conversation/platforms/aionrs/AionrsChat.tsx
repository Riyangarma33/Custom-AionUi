/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IConversationMcpStatus } from '@/common/config/storage';
import type { ChatFileRef } from '@/common/types/chatFile';
import type { ConversationContextValue } from '@/renderer/hooks/context/ConversationContext';
import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import ConversationPlanBar from '@renderer/pages/conversation/PlanBar/ConversationPlanBar';
import { usePlanRecovery } from '@renderer/pages/conversation/PlanBar/usePlanRecovery';
import { CHAT_SURFACE_CONTAINER_CLASS } from '@/renderer/pages/conversation/utils/chatSurfaceWidth';
import FlexFullContainer from '@renderer/components/layout/FlexFullContainer';
import MessageList from '@renderer/pages/conversation/Messages/MessageList';
import RevertDock from '@renderer/pages/conversation/components/RevertDock';
import { ConversationArtifactProvider } from '@renderer/pages/conversation/Messages/artifacts';
import {
  MessageListLoadingProvider,
  MessageListProvider,
  MessagePaginationProvider,
  useMessageList,
  useMessageLstCache,
  useUpdateMessageList,
} from '@renderer/pages/conversation/Messages/hooks';
import { usePendingConfirmationsRecovery } from '@renderer/pages/conversation/Messages/usePendingConfirmationsRecovery';
import { requestConversationSendBoxPrefill } from '@/renderer/hooks/chat/useSendBoxDraft';
import HOC from '@renderer/utils/ui/HOC';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { TeamSendBoxRuntime } from '@/renderer/pages/team/components/teamSendRuntime';
import AionrsSendBox from './AionrsSendBox';
import type { AionrsModelSelection } from './useAionrsModelSelection';

const AionrsChat: React.FC<{
  conversation_id: string;
  workspace: string;
  modelSelection: AionrsModelSelection;
  session_mode?: string;
  cron_job_id?: string;
  emptySlot?: React.ReactNode;
  loadedSkills?: string[];
  loadedMcpServers?: string[];
  loadedMcpStatuses?: IConversationMcpStatus[];
  agent_name?: string;
  teamSendMessage?: (payload: { input: string; files: ChatFileRef[] }) => Promise<void>;
  teamRuntime?: TeamSendBoxRuntime;
  assistantId?: string;
  forkCapability?: { at_turn: boolean };
}> = ({
  conversation_id,
  workspace,
  modelSelection,
  session_mode,
  cron_job_id,
  emptySlot,
  loadedSkills,
  loadedMcpServers,
  loadedMcpStatuses,
  agent_name,
  teamSendMessage,
  teamRuntime,
  assistantId,
  forkCapability,
}) => {
  useMessageLstCache(conversation_id);
  usePendingConfirmationsRecovery(conversation_id);
  usePlanRecovery(conversation_id);

  const list = useMessageList();
  const [pendingRevert, setPendingRevert] = useState<{
    targetMessageId: string;
    prompt: string;
    files?: string[];
  } | null>(null);

  // Clear pending revert if user switches conversations
  useEffect(() => {
    setPendingRevert(null);
  }, [conversation_id]);

  const targetIndex = useMemo(() => {
    if (!pendingRevert) return -1;
    return list.findIndex(
      (m) => m.id === pendingRevert.targetMessageId || (m.msg_id && m.msg_id === pendingRevert.targetMessageId)
    );
  }, [list, pendingRevert]);

  const rolledBackCount = useMemo(() => {
    if (targetIndex === -1) return 0;
    return list.length - targetIndex;
  }, [list.length, targetIndex]);

  const handleStartRevert = useCallback(
    (messageId: string, prompt: string, files?: string[]) => {
      setPendingRevert({ targetMessageId: messageId, prompt, files });
      requestConversationSendBoxPrefill(conversation_id, prompt, { mode: 'replace' });
    },
    [conversation_id]
  );

  const handleCancelRevert = useCallback(
    (options?: { clearDraft?: boolean }) => {
      setPendingRevert(null);
      if (options?.clearDraft !== false) {
        requestConversationSendBoxPrefill(conversation_id, '', { mode: 'replace' });
      }
    },
    [conversation_id]
  );

  const updateMessageList = useUpdateMessageList();

  const handleCommitRevert = useCallback(
    (targetMessageId: string) => {
      updateMessageList((currentList) => {
        const targetIdx = currentList.findIndex(
          (m) => m.id === targetMessageId || (m.msg_id && m.msg_id === targetMessageId)
        );
        if (targetIdx === -1) return currentList;
        return currentList.slice(0, targetIdx);
      });
      setPendingRevert(null);
    },
    [updateMessageList]
  );

  const conversationValue = useMemo<ConversationContextValue>(() => {
    return {
      conversation_id: conversation_id,
      workspace,
      type: 'aionrs',
      cron_job_id,
      loadedSkills,
      loadedMcpServers,
      loadedMcpStatuses,
      assistantId,
      forkCapability,
      pendingRevert: pendingRevert ? { ...pendingRevert, rolledBackCount } : null,
      onStartRevert: handleStartRevert,
      onCancelRevert: handleCancelRevert,
      onCommitRevert: handleCommitRevert,
    };
  }, [
    conversation_id,
    workspace,
    cron_job_id,
    loadedSkills,
    loadedMcpServers,
    loadedMcpStatuses,
    assistantId,
    forkCapability,
    pendingRevert,
    rolledBackCount,
    handleStartRevert,
    handleCancelRevert,
    handleCommitRevert,
  ]);

  return (
    <ConversationProvider value={conversationValue}>
      <ConversationArtifactProvider conversation_id={conversation_id}>
        <div className={`${CHAT_SURFACE_CONTAINER_CLASS} flex-1 flex flex-col px-20px min-h-0`}>
          <FlexFullContainer>
            <MessageList className='flex-1' emptySlot={emptySlot} />
          </FlexFullContainer>
          <ConversationPlanBar conversation_id={conversation_id} />
          {pendingRevert && (
            <RevertDock
              rolledBackCount={rolledBackCount}
              onRestore={handleCancelRevert}
            />
          )}
          <AionrsSendBox
            conversation_id={conversation_id}
            modelSelection={modelSelection}
            session_mode={session_mode}
            agent_name={agent_name}
            teamSendMessage={teamSendMessage}
            teamRuntime={teamRuntime}
          />
        </div>
      </ConversationArtifactProvider>
    </ConversationProvider>
  );
};

export default HOC.Wrapper(MessageListProvider, MessageListLoadingProvider, MessagePaginationProvider)(AionrsChat);
