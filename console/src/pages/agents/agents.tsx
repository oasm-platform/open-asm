import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import {
  useAgentsControllerGetMessages,
} from '@/services/apis/gen/queries';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ChatConversation } from './chat-conversation';
import { getGlobalWorkspaceId } from '@/utils/workspaceState';

interface SelectedModel {
  provider: string;
  model: string;
  configId: string;
}

interface LocationState {
  pendingMessage?: string;
  selectedModel?: SelectedModel;
}

export default function AgentsChatPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const hasAutoSentRef = useRef(false);
  const chatMessagesRef = useRef<UIMessage[]>([]);
  const createdConversationIdRef = useRef<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<SelectedModel | null>(
    null,
  );
  const selectedModelRef = useRef<SelectedModel | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  const workspaceId = getGlobalWorkspaceId();
  const isNewConversation = conversationId === 'new' || !conversationId;

  const effectiveConversationId = createdConversationIdRef.current || conversationId;
  const isActuallyNew = effectiveConversationId === 'new' || !effectiveConversationId;

  // Fetch messages when loading an existing conversation
  const { data: messagesData, isLoading: isLoadingHistory } =
    useAgentsControllerGetMessages(
      effectiveConversationId!,
      undefined,
      {
        query: {
          queryKey: ['/api/agents/conversations', effectiveConversationId, 'messages'],
          enabled: !!effectiveConversationId && !isActuallyNew,
        },
      },
    );

  // Convert history messages to UIMessage format
  const savedMessages: UIMessage[] = useMemo(() => {
    const rawData = messagesData as unknown;
    const dataArray = Array.isArray(rawData) ? rawData : (rawData as { data?: unknown[] })?.data;

    if (!Array.isArray(dataArray)) {
      return [];
    }

    return dataArray.map((msg) => {
      const m = msg as Record<string, unknown>;
      return {
        id: String(m.id ?? ''),
        role: String(m.role ?? 'user').toLowerCase() as 'user' | 'assistant',
        parts: [
          {
            type: 'text' as const,
            text: String(m.content ?? ''),
          },
        ],
        createdAt: m.createdAt ? new Date(String(m.createdAt)) : new Date(),
      };
    });
  }, [messagesData]);

  const {
    messages: chatMessages,
    status,
    sendMessage,
  } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/agents/messages/stream',
      headers: workspaceId ? { 'x-workspace-id': workspaceId } : {},
      prepareSendMessagesRequest: ({ messages, trigger, messageId }) => {
        const lastMessage = messages[messages.length - 1];
        const textContent = lastMessage?.parts
          .filter((p) => p.type === 'text')
          .map((p) => ('text' in p ? p.text : ''))
          .join('') || '';

        const modelInfo = selectedModelRef.current;

        return {
          body: {
            question: textContent,
            conversationId: trigger === 'submit-message' ? undefined : messageId,
            ...(modelInfo && {
              model: modelInfo.model,
              provider: modelInfo.provider,
            }),
          },
        };
      },
    }),
    id: conversationId,
    onData: (data) => {
      const convId = (data as Record<string, unknown>)?.conversationId as string | undefined;
      if (isNewConversation && convId) {
        createdConversationIdRef.current = convId;
      }
    },
    onFinish: () => {
      if (createdConversationIdRef.current) {
        void navigate(`/agents/conversations/${createdConversationIdRef.current}`, {
          replace: true,
          state: null,
        });
      }
    },
    onError: (error) => {
      console.error('[Chat] Error:', error);
      setStreamError(error.message ?? 'An error occurred while streaming');
    },
  });

  // Keep ref in sync
  useEffect(() => {
    chatMessagesRef.current = chatMessages;
  }, [chatMessages]);

  const isLoading = status === 'submitted' || status === 'streaming';

  const displayMessages: UIMessage[] = useMemo(() => {
    if (!isActuallyNew && savedMessages.length > 0 && !chatMessages.length) {
      return savedMessages;
    }
    return chatMessages;
  }, [isActuallyNew, savedMessages, chatMessages]);

  const lastAssistantIdx = useMemo(() => {
    for (let i = displayMessages.length - 1; i >= 0; i--) {
      if (displayMessages[i].role === 'assistant') {
        return i;
      }
    }
    return -1;
  }, [displayMessages]);

  const handleSendMessage = useCallback(
    async (content: string) => {
      setStreamError(null);
      await sendMessage({ text: content });
    },
    [sendMessage],
  );

  const handleRetry = useCallback(async () => {
    if (lastAssistantIdx !== -1 && chatMessages.length > 0) {
      setStreamError(null);
      const lastUserMsg = [...chatMessages].reverse().find((m) => m.role === 'user');
      if (lastUserMsg) {
        const textContent = lastUserMsg.parts
          .filter((p) => p.type === 'text')
          .map((p) => ('text' in p ? p.text : ''))
          .join('') || '';
        if (textContent) {
          await sendMessage({ text: textContent });
        }
      }
    }
  }, [lastAssistantIdx, chatMessages, sendMessage]);

  const handleDismissError = useCallback(() => {
    setStreamError(null);
  }, []);

  // Auto-send pending message from landing page
  useEffect(() => {
    const state = location.state as LocationState | null;
    if (state?.pendingMessage && !hasAutoSentRef.current) {
      hasAutoSentRef.current = true;
      if (state.selectedModel) {
        setSelectedModel(state.selectedModel);
        selectedModelRef.current = state.selectedModel;
      }
      void handleSendMessage(state.pendingMessage);
      void navigate(location.pathname, {
        replace: true,
        state: null,
      });
    }
  }, [location.state, navigate, location.pathname, handleSendMessage]);

  return (
    <div
      className="-m-4 flex flex-col overflow-hidden"
      style={{ height: 'calc(100vh - 4rem)' }}
    >
      <ChatConversation
        messages={displayMessages}
        onSendMessage={handleSendMessage}
        onRetry={lastAssistantIdx !== -1 && !isLoading ? handleRetry : undefined}
        isStreaming={isLoading}
        isLoadingMessages={isLoadingHistory}
        streamError={streamError}
        onDismissError={handleDismissError}
        selectedProvider={selectedModel?.provider ?? null}
        selectedModel={selectedModel?.model ?? null}
        onSelectModel={(provider, model, configId) => {
          setSelectedModel({ provider, model, configId });
        }}
      />
    </div>
  );
}
