import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import type { AgentTodoItem } from '@/components/agents/agent-todo-panel';
import {
  useAgentsControllerGetLLMConfigs,
  useAgentsControllerGetMessagesInfinite,
  type ConversationResponseDto,
  type LLMConfigWithProviderDto,
} from '@/services/apis/gen/queries';
import { orvalClient } from '@/services/apis/axios-client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ChatConversation } from './chat-conversation';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';

interface SelectedModel {
  provider: string;
  model: string;
  configId: string;
}

interface LocationState {
  pendingMessage?: string;
  selectedModel?: SelectedModel;
  agentMode?: string;
}

export default function AgentsChatPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const hasAutoSentRef = useRef(false);
  const chatMessagesRef = useRef<UIMessage[]>([]);
  const isStreamingRef = useRef(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [todos, setTodos] = useState<AgentTodoItem[]>([]);
  const { data: providers } =
    useAgentsControllerGetLLMConfigs<LLMConfigWithProviderDto[]>();
  const prefer = providers?.find((item) => item.isPreferred);
  const [selectedModel, setSelectedModel] = useState<SelectedModel | null>(
    prefer?.configId
      ? { provider: prefer.providerId, model: prefer.model ?? '', configId: prefer.configId }
      : null,
  );
  const selectedModelRef = useRef<SelectedModel | null>(selectedModel);

  // Keep ref in sync with state
  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  const [agentMode, setAgentMode] = useState('ask');
  const agentModeRef = useRef('ask');

  useEffect(() => {
    agentModeRef.current = agentMode;
  }, [agentMode]);

  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();

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

    const dataArray = pages
      .flatMap((p) => {
        // Each page can be either an array of messages or an object with data/items/messages property
        if (Array.isArray(p)) {
          return p;
        }
        const pageData = p as Record<string, unknown>;
        const rawData =
          pageData?.data ?? pageData?.items ?? pageData?.messages ?? [];
        return Array.isArray(rawData) ? rawData : [];
      })
      .reverse();

    if (dataArray.length === 0) {
      return [];
    }

    return dataArray.map((msg) => {
      const m = msg as Record<string, unknown>;
      return {
        id: String(m.id ?? ''),
        role: String(m.role ?? 'user').toLowerCase() as 'user' | 'assistant',
        parts: [{ type: 'text' as const, text: String(m.content ?? '') }],
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
      headers: selectedWorkspaceId
        ? { 'x-workspace-id': selectedWorkspaceId }
        : {},
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
            agentMode: agentModeRef.current,
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
    onData: (data: { type: string; data: unknown }) => {
      if (data.type === 'data-todos-updated') {
        const payload = data.data as { todos: AgentTodoItem[] } | undefined;
        if (payload?.todos) {
          setTodos(payload.todos);
        }
      }
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
    async (content: string, options?: { agentMode?: string }) => {
      setStreamError(null);
      if (options?.agentMode !== undefined) {
        agentModeRef.current = options.agentMode;
        setAgentMode(options.agentMode);
      }
      await sendMessage({ text: content });
    },
    [sendMessage],
  );

  const handleSelectModel = useCallback(
    (provider: string, model: string, configId: string) => {
      setSelectedModel({ provider, model, configId });
    },
    [],
  );

  const handleRetry = useCallback(async () => {
    if (lastAssistantIdx !== -1 && chatMessages.length > 0) {
      setStreamError(null);
      await regenerate();
    }
  }, [lastAssistantIdx, chatMessages, regenerate]);

  const onRetryAction = useMemo(() => {
    return lastAssistantIdx !== -1 && !isLoading ? handleRetry : undefined;
  }, [lastAssistantIdx, isLoading, handleRetry]);

  const hasSentFirstMessage = useMemo(() => {
    return isLoading || chatMessages.length > 0;
  }, [isLoading, chatMessages.length]);

  const onLoadMoreAction = useMemo(() => {
    return hasNextPage && !isFetchingNextPage ? fetchNextPage : undefined;
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleDismissError = useCallback(() => {
    setStreamError(null);
  }, []);

  // Fetch initial todos for existing conversations
  useEffect(() => {
    if (!conversationId) {
      setTodos([]);
      return;
    }

    orvalClient<ConversationResponseDto>({
      url: `/api/agents/conversations/${conversationId}`,
      method: 'GET',
    })
      .then((data) => {
        if (data.todos) {
          setTodos(data.todos as AgentTodoItem[]);
        }
      })
      .catch(() => {
        // Silently fail - todos will be empty
      });
  }, [conversationId]);

  // Auto-send pending message from landing page
  useEffect(() => {
    const state = location.state as LocationState | null;
    if (state?.pendingMessage && !hasAutoSentRef.current) {
      hasAutoSentRef.current = true;
      if (state.selectedModel) {
        setSelectedModel(state.selectedModel);
        selectedModelRef.current = state.selectedModel;
      }
      if (state.agentMode !== undefined) {
        setAgentMode(state.agentMode);
        agentModeRef.current = state.agentMode;
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
        onRetry={onRetryAction}
        isStreaming={isLoading}
        isLoadingMessages={isLoadingHistory}
        streamError={streamError}
        onDismissError={handleDismissError}
        selectedConfigId={selectedModel?.configId ?? null}
        selectedModel={selectedModel?.model ?? null}
        onSelectModel={handleSelectModel}
        hasSentFirstMessage={hasSentFirstMessage}
        onLoadMore={onLoadMoreAction}
        hasMoreMessages={hasNextPage ?? false}
        isLoadingMoreMessages={isFetchingNextPage}
        agentMode={agentMode}
        onAgentModeChange={setAgentMode}
        todos={todos}
      />
    </div>
  );
}
