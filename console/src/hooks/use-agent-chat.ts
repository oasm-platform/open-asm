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
import { useRemoteExecuteStream } from '@/hooks/use-remote-execute-stream';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Auto-retry constants and helpers
// ---------------------------------------------------------------------------

const MAX_AUTO_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1_000;

/**
 * Determines whether a streaming error is transient and worth retrying
 * automatically. Permanent errors (auth, validation) should surface immediately.
 */
function isTransientError(error: Error): boolean {
  const msg = (error.message ?? '').toLowerCase();

  // Network-level failures
  if (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('network request failed') ||
    msg.includes('ERR_NETWORK') ||
    msg.includes('ERR_CONNECTION')
  ) {
    return true;
  }

  // Abort from chunkMs timeout (stream stuck) — retryable
  if (msg.includes('timeout') || msg.includes('aborted')) {
    // Distinguish user-initiated abort (not retryable) from system abort (retryable).
    // The user abort typically comes from the stop() action which has a specific message.
    if (msg.includes('user') || msg.includes('stop')) return false;
    return true;
  }

  // Server-side transient errors
  if (
    msg.includes('500') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('internal server error') ||
    msg.includes('bad gateway') ||
    msg.includes('service unavailable') ||
    msg.includes('gateway timeout')
  ) {
    return true;
  }

  // Rate limiting
  if (msg.includes('429') || msg.includes('rate limit')) {
    return true;
  }

  return false;
}

import { useLocation, useNavigate } from '@tanstack/react-router';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';

interface SelectedModel {
  provider: string;
  model: string;
  configId: string;
}

interface UseAgentChatOptions {
  conversationId: string | undefined;
}

interface UseAgentChatReturn {
  messages: UIMessage[];
  isStreaming: boolean;
  isLoadingHistory: boolean;
  streamError: string | null;
  isRetrying: boolean;
  retryAttempt: number;
  title: string | null;
  createdAt: string | null;
  todos: AgentTodoItem[];
  selectedModel: SelectedModel | null;
  agentMode: string;
  hasSentFirstMessage: boolean;
  hasMoreMessages: boolean;
  isLoadingMoreMessages: boolean;
  remoteExecuteEvents: Map<string, import('@/hooks/use-remote-execute-stream').RemoteExecuteStreamEvent[]>;
  onSendMessage: (content: string, options?: { agentMode?: string }) => void;
  onRetry: (() => void) | undefined;
  onStop: () => void;
  onSelectModel: (provider: string, model: string, configId: string) => void;
  onDismissError: () => void;
  onLoadMore: (() => void) | undefined;
  onAgentModeChange: (mode: string) => void;
}

/**
 * Converts DB messages (with messageType) to UIMessage format.
 *
 * If the message has a stored `parts` array (new format), it is used directly —
 * this preserves the real chronological order from the AI stream (thought →
 * tool call → text → thought → …).
 *
 * Otherwise falls back to reconstructing parts from content/messageType/toolCalls
 * (legacy format for old messages).
 */
function mapDbMessagesToUI(
  pages: Array<{ data?: unknown[]; items?: unknown[]; messages?: unknown[] } | unknown[]>,
): UIMessage[] {
  const dataArray = pages
    .flatMap((p) => {
      if (Array.isArray(p)) return p;
      const pageData = p as Record<string, unknown>;
      return (pageData?.data ?? pageData?.items ?? pageData?.messages ?? []) as unknown[];
    })
    .reverse();

  if (dataArray.length === 0) return [];

  const result: UIMessage[] = dataArray.map((msg) => {
    const m = msg as Record<string, unknown>;
    const msgId = String(m.id ?? '');
    const role = String(m.role ?? 'user').toLowerCase() as 'user' | 'assistant';

    // New format: use stored parts array directly
    const storedParts = m.parts as Record<string, unknown>[] | undefined;
    if (Array.isArray(storedParts) && storedParts.length > 0) {
      return {
        id: msgId,
        role,
        parts: storedParts as UIMessage['parts'],
        createdAt: m.createdAt ? new Date(String(m.createdAt)) : new Date(),
      };
    }

    // Legacy format: reconstruct parts from separate fields
    const parts: UIMessage['parts'] = [];
    const content = String(m.content ?? '');
    const messageType = String(m.messageType ?? 'text');

    if (messageType === 'thinking' && content) {
      parts.push({ type: 'reasoning' as const, text: content });
    }

    const toolCalls = m.toolCalls as
      | Array<{
          toolCallId: string;
          toolName: string;
          args: Record<string, unknown>;
          result: Record<string, unknown> | null;
          isError?: boolean;
        }>
      | undefined;
    if (toolCalls && Array.isArray(toolCalls)) {
      for (const tc of toolCalls) {
        parts.push({
          type: 'dynamic-tool' as const,
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          state: tc.isError ? 'output-error' : 'output-available',
          input: tc.args,
          output: tc.result ?? null,
        } as UIMessage['parts'][number]);
      }
    }

    if (messageType === 'text' && content) {
      parts.push({ type: 'text' as const, text: content });
    }

    return {
      id: msgId,
      role,
      parts,
      createdAt: m.createdAt ? new Date(String(m.createdAt)) : new Date(),
    };
  });

  // Remove legacy THINKING-only messages whose reasoning is already captured
  // in the next assistant message's parts (prevents duplicate reasoning display).
  for (let i = 0; i < result.length; i++) {
    const msg = result[i];
    if (msg.role !== 'assistant') continue;
    const hasOnlyReasoning =
      msg.parts.length === 1 && msg.parts[0]?.type === 'reasoning';
    if (!hasOnlyReasoning) continue;
    const nextMsg = result[i + 1];
    if (
      nextMsg?.role === 'assistant' &&
      nextMsg.parts.some((p) => p.type === 'reasoning')
    ) {
      result.splice(i, 1);
      i--;
    }
  }

  return result;
}

export function useAgentChat({
  conversationId,
}: UseAgentChatOptions): UseAgentChatReturn {
  const location = useLocation();
  const navigate = useNavigate();
  const hasAutoSentRef = useRef(false);
  const chatMessagesRef = useRef<UIMessage[]>([]);
  const isStreamingRef = useRef(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const retryCountRef = useRef(0);
  const abortRetryRef = useRef<AbortController | null>(null);
  const isUserStoppedRef = useRef(false);
  const [todos, setTodos] = useState<AgentTodoItem[]>([]);
  const [title, setTitle] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const { appendEvent, eventsMap } = useRemoteExecuteStream();
  const { data: providers } =
    useAgentsControllerGetLLMConfigs<LLMConfigWithProviderDto[]>();
  const prefer = providers?.find((item) => item.isPreferred);
  const [selectedModel, setSelectedModel] = useState<SelectedModel | null>(
    prefer?.configId
      ? { provider: prefer.providerId, model: prefer.model ?? '', configId: prefer.configId }
      : null,
  );
  const selectedModelRef = useRef<SelectedModel | null>(selectedModel);
  const [agentMode, setAgentMode] = useState('ask');
  const agentModeRef = useRef('ask');

  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();

  // Keep refs in sync
  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);
  useEffect(() => {
    agentModeRef.current = agentMode;
  }, [agentMode]);

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
    if (!pages || !Array.isArray(pages)) return [];
    return mapDbMessagesToUI(pages);
  }, [messagesData]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/agents/messages/stream',
        headers: selectedWorkspaceId
          ? { 'x-workspace-id': selectedWorkspaceId }
          : {},
        prepareSendMessagesRequest: ({ messages }) => {
          const lastMessage = messages[messages.length - 1];
          const textContent =
            lastMessage?.parts
              ?.filter((p) => p.type === 'text')
              .map((p) => ('text' in p ? p.text : ''))
              .join('') || '';

          const modelInfo = selectedModelRef.current;
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
    [selectedWorkspaceId, conversationId],
  );

  const {
    messages: chatMessages,
    status,
    sendMessage,
    setMessages,
    regenerate,
    stop,
  } = useChat({
    transport,
    id: conversationId || 'agent-new-chat',
    experimental_throttle: 50,
    onError: (error) => {
      // Ignore errors from user-initiated stops — not a real error
      if (isUserStoppedRef.current) {
        isUserStoppedRef.current = false;
        return;
      }

      console.error('[Chat] Error:', error);
      // Always set streamError so the auto-retry effect can evaluate it.
      setStreamError(error.message ?? 'An error occurred while streaming');

      // For permanent errors or retries exhausted, reset retry state immediately.
      if (!isTransientError(error) || retryCountRef.current >= MAX_AUTO_RETRIES) {
        setIsRetrying(false);
        retryCountRef.current = 0;
        setRetryCount(0);
      }
    },
    onData: (data: { type: string; data: unknown }) => {
      if (data.type === 'data-todos-updated') {
        const payload = data.data as { todos: AgentTodoItem[] } | undefined;
        if (payload?.todos) {
          // Use functional update to avoid stale closure issues
          setTodos((prevTodos) => {
            // Skip update if todos are the same (avoid infinite re-renders)
            if (JSON.stringify(prevTodos) === JSON.stringify(payload.todos)) {
              return prevTodos;
            }
            return payload.todos;
          });
        }
      }
      if (data.type === 'data-remote-execute-output') {
        const event = data.data as import('@/hooks/use-remote-execute-stream').RemoteExecuteStreamEvent;
        appendEvent(event);
      }
    },
  });

  // Keep ref in sync
  useEffect(() => {
    chatMessagesRef.current = chatMessages;
    isStreamingRef.current = status === 'submitted' || status === 'streaming';
  }, [chatMessages, status]);

  const isStreaming = status === 'submitted' || status === 'streaming';

  // Keep setMessages in a ref to avoid re-triggering the history sync effect
  const setMessagesRef = useRef(setMessages);
  useEffect(() => {
    setMessagesRef.current = setMessages;
  }, [setMessages]);

  // Sync history whenever savedMessages changes but not while streaming
  useEffect(() => {
    if (!conversationId || isLoadingHistory || isStreamingRef.current) return;
    if (savedMessages.length > 0) {
      // Use functional update to compare and avoid unnecessary re-renders
      setMessagesRef.current((prev) => {
        // Skip if messages are the same length and have same IDs
        if (prev.length === savedMessages.length) {
          const sameIds = prev.every((m, i) => m.id === savedMessages[i]?.id);
          if (sameIds) return prev;
        }
        return savedMessages;
      });
    }
  }, [conversationId, isLoadingHistory, savedMessages]);

  // Display chatMessages when available, otherwise fall back to savedMessages
  const messages: UIMessage[] =
    chatMessages.length > 0 ? chatMessages : savedMessages;

  const lastAssistantIdx = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return i;
    }
    return -1;
  }, [messages]);

  const handleSendMessage = useCallback(
    async (content: string, options?: { agentMode?: string }) => {
      setStreamError(null);
      // Cancel any pending auto-retry
      retryCountRef.current = 0;
      setRetryCount(0);
      setIsRetrying(false);
      isUserStoppedRef.current = false;
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
      retryCountRef.current = 0;
      setRetryCount(0);
      setIsRetrying(false);
      isUserStoppedRef.current = false;
      await regenerate();
    }
  }, [lastAssistantIdx, chatMessages, regenerate]);

  const handleStop = useCallback(() => {
    isUserStoppedRef.current = true;
    stop();
  }, [stop]);

  const onRetryAction = useMemo(() => {
    return lastAssistantIdx !== -1 && !isStreaming ? handleRetry : undefined;
  }, [lastAssistantIdx, isStreaming, handleRetry]);

  const hasSentFirstMessage = useMemo(() => {
    return isStreaming || chatMessages.length > 0;
  }, [isStreaming, chatMessages.length]);

  const onLoadMoreAction = useMemo(() => {
    return hasNextPage && !isFetchingNextPage ? fetchNextPage : undefined;
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleDismissError = useCallback(() => {
    setStreamError(null);
    retryCountRef.current = 0;
    setRetryCount(0);
    setIsRetrying(false);
  }, []);

  // Auto-retry with exponential backoff for transient stream errors.
  // When streamError is set and the error is retryable, wait with exponential
  // backoff then call regenerate() to resend the last message.
  useEffect(() => {
    if (!streamError) return;
    if (isStreaming) return;
    if (lastAssistantIdx === -1) return;
    if (retryCount >= MAX_AUTO_RETRIES) return;

    // Check if this error is transient — only auto-retry those
    const testError = new Error(streamError);
    if (!isTransientError(testError)) return;

    const backoffMs =
      BASE_RETRY_DELAY_MS * Math.pow(2, retryCount) +
      Math.random() * 500;

    const controller = new AbortController();
    abortRetryRef.current = controller;

    const timer = setTimeout(async () => {
      if (controller.signal.aborted) return;
      console.log(
        `[Chat] Auto-retry ${retryCount + 1}/${MAX_AUTO_RETRIES} after ${Math.round(backoffMs)}ms`,
      );
      setIsRetrying(true);
      setStreamError(null);
      retryCountRef.current = retryCount + 1;
      setRetryCount((c) => c + 1);
      try {
        await regenerate();
        // Stream succeeded — reset retry state
        if (!controller.signal.aborted) {
          retryCountRef.current = 0;
          setRetryCount(0);
          setIsRetrying(false);
        }
      } catch {
        // onError will handle subsequent errors
      }
    }, backoffMs);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [
    streamError,
    isStreaming,
    lastAssistantIdx,
    retryCount,
    regenerate,
  ]);

  // Reset retry count when stream starts successfully (only if NOT in auto-retry).
  // During auto-retry, isRetrying is true so this won't interfere.
  useEffect(() => {
    if (isStreaming && !isRetrying) {
      retryCountRef.current = 0;
      setRetryCount(0);
      setIsRetrying(false);
    }
  }, [isStreaming, isRetrying]);

  // Fetch initial todos and agentMode for existing conversations
  useEffect(() => {
    if (!conversationId) {
      setTodos([]);
      return;
    }

    // Use a flag to prevent setting state after unmount
    let cancelled = false;

    orvalClient<ConversationResponseDto>({
      url: `/api/agents/conversations/${conversationId}`,
      method: 'GET',
    })
      .then((data) => {
        if (!cancelled && data.todos) {
          setTodos((prev) => {
            // Only update if different
            if (JSON.stringify(prev) === JSON.stringify(data.todos)) {
              return prev;
            }
            return data.todos as unknown as AgentTodoItem[];
          });
        }
        if (!cancelled && data.title) {
          setTitle(data.title);
        }
        if (!cancelled && data.createdAt) {
          setCreatedAt(data.createdAt as string);
        }
        if (!cancelled && data.agentMode) {
          setAgentMode(data.agentMode);
          agentModeRef.current = data.agentMode;
        }
      })
      .catch(() => {
        // Silently fail - todos will be empty
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // Keep handleSendMessage in a ref to avoid re-triggering the auto-send effect
  const handleSendMessageRef = useRef(handleSendMessage);
  useEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
  }, [handleSendMessage]);

  // Auto-send pending message from landing page
  useEffect(() => {
    const state = location.state as {
      pendingMessage?: string;
      selectedModel?: SelectedModel;
      agentMode?: string;
    } | null;
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
      void handleSendMessageRef.current(state.pendingMessage);
      void navigate({
        to: location.pathname as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- dynamic route path
        replace: true,
        state: undefined,
      });
    }
  }, [location.state, navigate, location.pathname]);

  return {
    messages,
    isStreaming,
    isLoadingHistory,
    streamError,
    isRetrying,
    retryAttempt: retryCount,
    todos,
    title,
    createdAt,
    selectedModel,
    agentMode,
    hasSentFirstMessage,
    hasMoreMessages: hasNextPage ?? false,
    isLoadingMoreMessages: isFetchingNextPage,
    remoteExecuteEvents: eventsMap,
    onSendMessage: handleSendMessage,
    onRetry: onRetryAction,
    onStop: handleStop,
    onSelectModel: handleSelectModel,
    onDismissError: handleDismissError,
    onLoadMore: onLoadMoreAction,
    onAgentModeChange: setAgentMode,
  };
}
