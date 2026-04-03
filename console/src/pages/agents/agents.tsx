import { createMessageStream } from '@/services/apis/ai-assistant-sse';
import type { MessageResponseDto } from '@/services/apis/gen/queries';
import { useAgentsControllerGetMessages } from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ChatConversation } from './chat-conversation';

/** Tool call state for UI rendering */
interface ToolCallState {
  toolCallId: string;
  toolName: string;
  status: 'pending' | 'executing' | 'completed' | 'error';
  input?: Record<string, unknown>;
  output?: unknown;
  argsTextDelta?: string;
}

/** Local message type for UI rendering */
interface UIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  error?: string;
  errorCode?: string;
  toolCalls?: ToolCallState[];
}

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
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingToolCalls, setStreamingToolCalls] = useState<ToolCallState[]>([]);
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(
    null,
  );
  const [streamError, setStreamError] = useState<{
    message: string;
    code?: string;
  } | null>(null);
  const [ignoredMessageIds, setIgnoredMessageIds] = useState<Set<string>>(
    new Set(),
  );
  const conversationIdRef = useRef<string | null>(conversationId ?? null);
  const queryClient = useQueryClient();
  const hasAutoSentRef = useRef(false);
  const [selectedModel, setSelectedModel] = useState<SelectedModel | null>(
    null,
  );
  const selectedModelRef = useRef<SelectedModel | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  // Keep ref in sync with URL param
  useEffect(() => {
    conversationIdRef.current = conversationId ?? null;
  }, [conversationId]);

  // Fetch messages for active conversation
  const { data: messagesData, isLoading: isLoadingMessages } =
    useAgentsControllerGetMessages(
      conversationId ?? '',
      { limit: 100, sortBy: 'createdAt', sortOrder: 'ASC' },
      {
        query: {
          enabled: !!conversationId,
          refetchOnWindowFocus: false,
        },
      },
    );

  // Convert API messages to UI messages
  const messages: UIMessage[] = useMemo(() => {
    const apiMessages: MessageResponseDto[] = Array.isArray(messagesData)
      ? messagesData
      : [];
    return apiMessages.map((msg) => ({
      id: msg.id,
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      timestamp: new Date(msg.createdAt),
    }));
  }, [messagesData]);

  // Append pending user message, streaming content, and errors to messages during SSE
  const displayMessages = useMemo(() => {
    if (isLoadingMessages && messages.length === 0) {
      return [];
    }

    const result: UIMessage[] = messages.filter(
      (m) => !ignoredMessageIds.has(m.id),
    );

    if (pendingUserMessage) {
      const confirmedFromApi = result.some(
        (m) => m.role === 'user' && m.content === pendingUserMessage,
      );
      if (!confirmedFromApi) {
        result.push({
          id: 'pending-user',
          role: 'user',
          content: pendingUserMessage,
          timestamp: new Date(),
        });
      }
    }

    if (isStreaming && (streamingContent || streamingToolCalls.length > 0)) {
      result.push({
        id: 'streaming',
        role: 'assistant',
        content: streamingContent,
        timestamp: new Date(),
        toolCalls: streamingToolCalls.length > 0 ? streamingToolCalls : undefined,
      });
    }

    // Show error message if stream failed
    if (streamError && !isStreaming) {
      result.push({
        id: 'error',
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        error: streamError.message,
        errorCode: streamError.code,
      });
    }

    return result;
  }, [
    messages,
    isStreaming,
    streamingContent,
    streamingToolCalls,
    pendingUserMessage,
    isLoadingMessages,
    streamError,
    ignoredMessageIds,
  ]);

  const handleSendMessage = useCallback(
    async (content: string) => {
      setPendingUserMessage(content);
      setIsStreaming(true);
      setStreamingContent('');
      setStreamingToolCalls([]);
      setStreamError(null);

      try {
        const modelInfo = selectedModelRef.current;
        const stream = createMessageStream({
          question: content,
          conversationId: conversationIdRef.current ?? undefined,
          ...(modelInfo && {
            model: modelInfo.model,
            provider: modelInfo.provider,
          }),
        });

        let fullContent = '';
        let newConversationId: string | null = null;
        const toolCallsMap = new Map<string, ToolCallState>();

        for await (const event of stream) {
          if (event.type === 'error') {
            console.error('Stream error:', event.data);
            setStreamError({
              message: event.data.error || 'An error occurred',
              code: event.data.errorCode,
            });
            break;
          }

          const eventType = event.data.type;

          switch (eventType) {
            case 'text':
              if (event.data.content) {
                fullContent += event.data.content;
                setStreamingContent(fullContent);
              }
              break;

            case 'tool-call-start':
              if (event.data.toolCallId && event.data.toolName) {
                toolCallsMap.set(event.data.toolCallId, {
                  toolCallId: event.data.toolCallId,
                  toolName: event.data.toolName,
                  status: 'pending',
                });
                setStreamingToolCalls(Array.from(toolCallsMap.values()));
              }
              break;

            case 'tool-call-delta':
              if (event.data.toolCallId && event.data.argsTextDelta) {
                const existing = toolCallsMap.get(event.data.toolCallId);
                if (existing) {
                  toolCallsMap.set(event.data.toolCallId, {
                    ...existing,
                    argsTextDelta: (existing.argsTextDelta || '') + event.data.argsTextDelta,
                    status: 'executing',
                  });
                  setStreamingToolCalls(Array.from(toolCallsMap.values()));
                }
              }
              break;

            case 'tool-call':
              if (event.data.toolCallId && event.data.toolName) {
                toolCallsMap.set(event.data.toolCallId, {
                  toolCallId: event.data.toolCallId,
                  toolName: event.data.toolName,
                  status: 'executing',
                  input: event.data.input,
                });
                setStreamingToolCalls(Array.from(toolCallsMap.values()));
              }
              break;

            case 'tool-result':
              if (event.data.toolCallId) {
                const existing = toolCallsMap.get(event.data.toolCallId);
                if (existing) {
                  toolCallsMap.set(event.data.toolCallId, {
                    ...existing,
                    status: 'completed',
                    output: event.data.output,
                  });
                  setStreamingToolCalls(Array.from(toolCallsMap.values()));
                }
              }
              break;

            default:
              // Handle legacy format where content is sent without type
              if (event.data.content && !eventType) {
                fullContent += event.data.content;
                setStreamingContent(fullContent);
              }
              break;
          }

          if (event.data.conversationId) {
            newConversationId = event.data.conversationId;
            if (!conversationIdRef.current) {
              void navigate(`/agents/conversations/${newConversationId}`, {
                replace: true,
              });
            }
          }
        }

        void queryClient.invalidateQueries({
          queryKey: ['/api/agents/conversations'],
        });

        const finalConversationId =
          conversationIdRef.current ?? newConversationId;
        if (finalConversationId) {
          void queryClient.invalidateQueries({
            queryKey: [
              `/api/agents/conversations/${finalConversationId}/messages`,
            ],
          });
        }
      } catch (error) {
        console.error('Failed to send message:', error);
        setStreamError({
          message:
            error instanceof Error ? error.message : 'Failed to send message',
          code: 'NETWORK_ERROR',
        });
      } finally {
        setIsStreaming(false);
        setPendingUserMessage(null);
      }
    },
    [queryClient, navigate],
  );

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
      // Clear location state to prevent re-sending on re-renders
      void navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, handleSendMessage, navigate, location.pathname]);

  // Clear streaming content after API messages have been refreshed
  useEffect(() => {
    if (!isStreaming && (streamingContent || streamingToolCalls.length > 0) && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant') {
        setStreamingContent('');
        setStreamingToolCalls([]);
      }
    }
  }, [isStreaming, streamingContent, streamingToolCalls, messages]);

  // Escape ProtectedLayout's p-4 so the chat fills the full available area
  return (
    <div
      className="-m-4 flex flex-col overflow-hidden"
      style={{ height: 'calc(100vh - 4rem)' }}
    >
      <ChatConversation
        messages={displayMessages}
        onSendMessage={handleSendMessage}
        selectedProvider={selectedModel?.provider ?? null}
        selectedModel={selectedModel?.model ?? null}
        onSelectModel={(provider, model, configId) => {
          setSelectedModel({ provider, model, configId });
        }}
        onRetry={() => {
          // Find the last assistant message and its matching user message
          const reversedMessages = [...messages].reverse();
          const lastAsstRevIdx = reversedMessages.findIndex(
            (m) => m.role === 'assistant',
          );
          const lastAsstIdx =
            lastAsstRevIdx !== -1 ? messages.length - 1 - lastAsstRevIdx : -1;
          const lastUserMsg = reversedMessages.find((m) => m.role === 'user');
          if (lastAsstIdx !== -1) {
            setIgnoredMessageIds((prev) => {
              const next = new Set(prev);
              next.add(messages[lastAsstIdx].id);
              return next;
            });
          }
          if (lastUserMsg) {
            setIgnoredMessageIds((prev) => {
              const next = new Set(prev);
              next.add(lastUserMsg.id); // Also hide the user message so we don't duplicate it visually
              return next;
            });
            void handleSendMessage(lastUserMsg.content);
          } else {
            // If somehow no user message, just resend last pending or empty trigger
            void handleSendMessage('Retry');
          }
        }}
        isStreaming={isStreaming}
        isLoadingMessages={isLoadingMessages}
      />
    </div>
  );
}
