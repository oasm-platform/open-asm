import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import {
  useAgentsControllerGetLLMConfigs,
  useAgentsControllerGetMessagesInfinite,
  type LLMConfigWithProviderDto,
} from '@/services/apis/gen/queries';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ChatConversation } from './chat-conversation';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';

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
  const isStreamingRef = useRef(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const { data: providers } =
    useAgentsControllerGetLLMConfigs<LLMConfigWithProviderDto[]>();
  const prefer = providers?.find((item) => item.isPreferred);
  const [selectedModel, setSelectedModel] = useState<SelectedModel | null>({
    provider: prefer?.providerId || '',
    model: prefer?.model || '',
    configId: prefer?.configId || '',
  });
  const selectedModelRef = useRef<SelectedModel | null>(selectedModel);

  // Keep ref in sync with state
  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  const { selectedWorkspace } = useWorkspaceSelector();
  const workspaceId = selectedWorkspace;

  // Fetch messages with infinite scroll
  const {
    data: messagesData,
    isLoading: isLoadingHistory,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useAgentsControllerGetMessagesInfinite(
    conversationId!,
    { page: 1, limit: 10, sortOrder: 'DESC' },
    {
      query: {
        queryKey: ['/api/agents/conversations', conversationId, 'messages'],
        enabled: !!conversationId && !isStreamingRef.current,
        // maxPages: 5, // limit re-fetch pages on F5/focus; page 1 is evicted when page 2+ fetches with maxPages:1
        getNextPageParam: (lastPage) => {
          const page = lastPage.page ?? 1;
          const limit = lastPage.limit ?? 10;
          const total = lastPage.total ?? 0;
          const hasMore = page * limit < total;
          return hasMore ? page + 1 : undefined;
        },
        initialPageParam: 1,
      },
    },
  );

  // Convert history messages to UIMessage format
  const savedMessages: UIMessage[] = useMemo(() => {
    const pages = messagesData?.pages;
    if (!pages || !Array.isArray(pages)) {
      return [];
    }

    // Each page is DESC (newest first). Reverse each page, then put pages in
    // reverse-page order so combined result is oldest→newest overall.
    const dataArray = [...pages].reverse().flatMap((p) => {
      const pageData = p as { data?: unknown[] };
      return Array.isArray(pageData?.data) ? [...pageData.data] : [];
    });

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
    setMessages,
    regenerate,
  } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/agents/messages/stream',
      headers: workspaceId ? { 'x-workspace-id': workspaceId } : {},
      prepareSendMessagesRequest: ({ messages }) => {
        const lastMessage = messages[messages.length - 1];
        const textContent =
          lastMessage?.parts
            .filter((p) => p.type === 'text')
            .map((p) => ('text' in p ? p.text : ''))
            .join('') || '';

        const modelInfo = selectedModelRef.current;

        // For existing conversations, use the ID from URL
        const convId = conversationId;

        return {
          body: {
            question: textContent,
            ...(convId && { conversationId: convId }),
            ...(modelInfo && {
              model: modelInfo.model,
              provider: modelInfo.provider,
            }),
          },
        };
      },
    }),
    // Use conversationId as chat ID so each conversation has its own message state
    id: conversationId || 'agent-new-chat',
    onError: (error) => {
      console.error('[Chat] Error:', error);
      setStreamError(error.message ?? 'An error occurred while streaming');
    },
  });

  // Keep ref in sync
  useEffect(() => {
    chatMessagesRef.current = chatMessages;
    isStreamingRef.current = status === 'submitted' || status === 'streaming';
  }, [chatMessages, status]);

  const isLoading = status === 'submitted' || status === 'streaming';

  // Sync history whenever savedMessages changes (new pages loaded) but not while streaming
  useEffect(() => {
    if (!conversationId || isLoadingHistory || isStreamingRef.current) return;
    if (savedMessages.length > 0) {
      setMessages(savedMessages);
    }
  }, [conversationId, isLoadingHistory, savedMessages, setMessages]);

  // Display savedMessages (history) when chatMessages is empty, otherwise use chatMessages (includes new messages)
  // This ensures messages show immediately after loading, without waiting for sync to complete
  const displayMessages: UIMessage[] =
    chatMessages.length > 0 ? chatMessages : savedMessages;

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
      await regenerate();
    }
  }, [lastAssistantIdx, chatMessages, regenerate]);

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
        onRetry={
          lastAssistantIdx !== -1 && !isLoading ? handleRetry : undefined
        }
        isStreaming={isLoading}
        isLoadingMessages={isLoadingHistory}
        streamError={streamError}
        onDismissError={handleDismissError}
        selectedProvider={selectedModel?.provider ?? null}
        selectedModel={selectedModel?.model ?? null}
        onSelectModel={(provider, model, configId) => {
          setSelectedModel({ provider, model, configId });
        }}
        hasSentFirstMessage={isLoading || chatMessages.length > 0}
        onLoadMore={
          hasNextPage && !isFetchingNextPage ? fetchNextPage : undefined
        }
        hasMoreMessages={hasNextPage ?? false}
        isLoadingMoreMessages={isFetchingNextPage}
      />
    </div>
  );
}
