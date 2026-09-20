/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { AgentLogoIcon } from '@/renderer/components/agent/AgentBadge';
import { usePresetAssistantInfo } from '@/renderer/hooks/agent/usePresetAssistantInfo';
import { useTitleRename } from '@/renderer/pages/conversation/hooks/useTitleRename';
import { resolveConversationBackend } from '@/renderer/pages/conversation/utils/conversationAssistantIdentity';
import { refreshConversationCache } from '@/renderer/pages/conversation/utils/conversationCache';
import { emitter } from '@/renderer/utils/emitter';
import { Input } from '@arco-design/web-react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

type MobileConversationBrandProps = {
  conversation_id: string;
  fallbackTitle: string;
};

const MobileConversationBrand: React.FC<MobileConversationBrandProps> = ({ conversation_id, fallbackTitle }) => {
  const { t } = useTranslation();
  const latestLocalEditRef = useRef<{ title: string; timestamp: number } | null>(null);

  useEffect(() => {
    latestLocalEditRef.current = null;
  }, [conversation_id]);

  const { data: conversation, mutate } = useSWR(
    conversation_id ? `conversation/${conversation_id}` : null,
    async () => {
      const data = await ipcBridge.conversation.get.invoke({ id: conversation_id });
      if (data && latestLocalEditRef.current) {
        if (data.name === latestLocalEditRef.current.title) {
          latestLocalEditRef.current = null;
        } else {
          return { ...data, name: latestLocalEditRef.current.title };
        }
      }
      return data;
    }
  );

  useEffect(() => {
    const handleRefresh = () => {
      void mutate();
    };
    emitter.on('chat.history.refresh', handleRefresh);
    return () => {
      emitter.off('chat.history.refresh', handleRefresh);
    };
  }, [mutate]);

  const handleRename = useCallback(
    async (new_name: string): Promise<boolean> => {
      try {
        const result = await ipcBridge.conversation.update.invoke({
          id: conversation_id,
          updates: { name: new_name },
        });
        const success = Boolean(result);
        if (success) {
          latestLocalEditRef.current = { title: new_name, timestamp: Date.now() };
          await mutate((prev) => (prev ? { ...prev, name: new_name } : prev), false);
          await refreshConversationCache(conversation_id);
          emitter.emit('chat.history.refresh');
        }
        return success;
      } catch (error) {
        console.error('Failed to update conversation title:', error);
        return false;
      }
    },
    [conversation_id, mutate]
  );

  const title = conversation?.name || fallbackTitle;
  const {
    editingTitle,
    setEditingTitle,
    titleDraft,
    setTitleDraft,
    renameLoading,
    canRenameTitle,
    submitTitleRename,
  } = useTitleRename({
    title,
    conversation_id,
    onRename: handleRename,
  });

  const { info: presetAssistant } = usePresetAssistantInfo(conversation || undefined);
  const backend = resolveConversationBackend(conversation, presetAssistant?.backend);
  const showLogo = Boolean(backend || presetAssistant);

  const isSubmittingRef = useRef(false);

  const handleSubmit = async () => {
    isSubmittingRef.current = true;
    try {
      await submitTitleRename();
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const handleCancel = () => {
    if (isSubmittingRef.current) return;
    setTitleDraft(typeof title === 'string' ? title : '');
    setEditingTitle(false);
  };

  const isTitleBlank = typeof title === 'string' && title.trim() === '';
  const displayTitle = isTitleBlank ? t('conversation.historySearch.untitled') : title;

  const startEditing = () => {
    if (!canRenameTitle) return;
    setEditingTitle(true);
  };

  if (!editingTitle) {
    return (
      <span
        role={canRenameTitle ? 'button' : undefined}
        tabIndex={canRenameTitle ? 0 : undefined}
        className={classNames(
          'app-titlebar__brand-mobile',
          canRenameTitle && 'app-titlebar__brand-mobile--clickable'
        )}
        onClick={startEditing}
        onKeyDown={(e) => {
          if (!canRenameTitle) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            startEditing();
          }
        }}
        data-testid='mobile-conversation-brand-trigger'
      >
        {showLogo && (
          <AgentLogoIcon
            backend={backend}
            agent_name={title}
            agentLogo={presetAssistant?.logo}
            agentLogoIsEmoji={presetAssistant?.isEmoji}
            agentLogoIsFallback={presetAssistant?.isFallback}
          />
        )}
        <span className='app-titlebar__brand-text'>{displayTitle}</span>
      </span>
    );
  }

  return (
    <span
      className={classNames(
        'app-titlebar__brand-mobile',
        'app-titlebar__brand-mobile--editing'
      )}
    >
      {showLogo && (
        <AgentLogoIcon
          backend={backend}
          agent_name={title}
          agentLogo={presetAssistant?.logo}
          agentLogoIsEmoji={presetAssistant?.isEmoji}
          agentLogoIsFallback={presetAssistant?.isFallback}
        />
      )}
      <Input
        autoFocus
        value={titleDraft}
        disabled={renameLoading}
        className='app-titlebar__brand-input'
        style={{ width: '100%', maxWidth: '100%' }}
        maxLength={120}
        onChange={setTitleDraft}
        onFocus={(event) => {
          event.target.select();
        }}
        onPressEnter={() => {
          void handleSubmit();
        }}
        onBlur={() => {
          handleCancel();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            handleCancel();
          }
        }}
        placeholder={t('conversation.history.renamePlaceholder')}
        size='small'
      />
    </span>
  );
};

export default MobileConversationBrand;
