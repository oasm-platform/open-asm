import Page from '@/components/common/page';
import { createMessageStream } from '@/services/apis/ai-assistant-sse';
import type { MessageResponseDto } from '@/services/apis/gen/queries';
import { useAgentsControllerGetMessages } from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ChatConversation } from './chat-conversation';

/** Local message type for UI rendering */
interface UIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  error?: string;
  errorCode?: string;
}

interface LocationState {
  pendingMessage?: string;
}

export default function AgentsChatPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(
    null,
  );
  const [streamError, setStreamError] = useState<{
    message: string;
    code?: string;
  } | null>(null);
  const conversationIdRef = useRef<string | null>(conversationId ?? null);
  const queryClient = useQueryClient();
  const hasAutoSentRef = useRef(false);

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

    const result: UIMessage[] = [...messages];

    if (pendingUserMessage) {
      const confirmedFromApi = messages.some(
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

    if (isStreaming && streamingContent) {
      result.push({
        id: 'streaming',
        role: 'assistant',
        content: streamingContent,
        timestamp: new Date(),
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
    pendingUserMessage,
    isLoadingMessages,
    streamError,
  ]);

  const handleSendMessage = useCallback(
    async (content: string) => {
      setPendingUserMessage(content);
      setIsStreaming(true);
      setStreamingContent('');
      setStreamError(null);

      try {
        const stream = createMessageStream({
          question: content,
          conversationId: conversationIdRef.current ?? undefined,
        });

        let fullContent = '';
        let newConversationId: string | null = null;

        for await (const event of stream) {
          if (event.type === 'error') {
            console.error('Stream error:', event.data);
            setStreamError({
              message: event.data.error?.message || 'An error occurred',
              code: event.data.error?.code,
            });
            break;
          }

          if (event.data.content) {
            fullContent += event.data.content;
            setStreamingContent(fullContent);
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
      void handleSendMessage(state.pendingMessage);
      // Clear location state to prevent re-sending on re-renders
      void navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, handleSendMessage, navigate, location.pathname]);

  // Clear streaming content after API messages have been refreshed
  useEffect(() => {
    if (!isStreaming && streamingContent && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant') {
        setStreamingContent('');
      }
    }
  }, [isStreaming, streamingContent, messages]);

  return (
    <Page className="w-full h-full lg:w-2/3 xl:w-1/2 mx-auto">
      <ChatConversation
        messages={displayMessages}
        onSendMessage={handleSendMessage}
        isStreaming={isStreaming}
        isLoadingMessages={isLoadingMessages}
      />
    </Page>
  );
}
