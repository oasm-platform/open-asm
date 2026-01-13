import { useState, useCallback, useEffect, useRef } from 'react';
import {
  useAiAssistantControllerGetConversations,
  useAiAssistantControllerGetMessages,
  useAiAssistantControllerDeleteConversation,
  useAiAssistantControllerUpdateConversation,
  useAiAssistantControllerDeleteConversations,
} from '@/services/apis/gen/queries';
import {
  createMessageStream,
  type MessageStreamEventData,
} from '@/services/apis/ai-assistant-sse';
import type { Message, ChatSession } from '@/assistant/types/types';

export function useAssistant() {
  const [currentConversationId, setCurrentConversationId] = useState<
    string | undefined
  >();
  const [messages, setMessages] = useState<Message[]>([]);
  const [internalIsStreaming, setInternalIsStreaming] = useState(false);
  const [streamingConversationId, setStreamingConversationId] = useState<
    string | undefined
  >();
  const [streamingStatus, setStreamingStatus] = useState<{
    type?: string;
    content?: string;
  }>({});

  // Ref to track current conversation ID inside async callbacks
  const currentConversationIdRef = useRef(currentConversationId);
  useEffect(() => {
    currentConversationIdRef.current = currentConversationId;
  }, [currentConversationId]);

  // Filter & Pagination state
  const [search, setSearch] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sortBy, setSortBy] = useState('updated_at');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');

  // Fetch conversations
  const {
    data: conversationsData,
    refetch: refetchConversations,
    isLoading: isLoadingConversations,
  } = useAiAssistantControllerGetConversations({
    search,
    page,
    limit,
    sortBy,
    sortOrder,
  });

  // Fetch messages for current conversation
  // Use a valid UUID format to avoid database errors, but disable query when no real ID
  const dummyUuid = '00000000-0000-0000-0000-000000000000';
  const {
    data: messagesData,
    refetch: refetchMessages,
    isLoading: isLoadingMessages,
  } = useAiAssistantControllerGetMessages(currentConversationId || dummyUuid, {
    query: { enabled: !!currentConversationId }, // Only fetch when ID exists
  });

  // Calculate public isStreaming based on context
  // Only show streaming if the active chat is the one streaming
  // (Note: If both are 'undefined' i.e. new chat, it will show. This is acceptable/expected behavior for now)
  const isStreaming =
    internalIsStreaming && streamingConversationId === currentConversationId;

  // Update messages when data changes
  useEffect(() => {
    if (messagesData?.messages && !internalIsStreaming) {
      // Safety guard: if messagesData is empty but we already have messages in state
      // (likely temp messages from a recently finished stream), don't clear them
      // unless they are really old or we're certain there should be no messages.
      if (messagesData.messages.length === 0 && messages.length > 0) {
        console.debug(
          '⚠️ messagesData is empty, preserved state messages to avoid UI flicker',
        );
        return;
      }
      setMessages(messagesData.messages);
    }
  }, [messagesData, internalIsStreaming, messages.length]);

  // Delete conversation mutation
  const { mutateAsync: deleteConversationMutation } =
    useAiAssistantControllerDeleteConversation();

  // Update conversation mutation
  const { mutateAsync: updateConversationMutation } =
    useAiAssistantControllerUpdateConversation();

  // Delete all conversations mutation
  const { mutateAsync: deleteAllConversationsMutation } =
    useAiAssistantControllerDeleteConversations();

  // Convert conversations to chat sessions
  const sessions: ChatSession[] =
    conversationsData?.conversations?.map((conv) => ({
      id: conv.conversationId || '',
      conversationId: conv.conversationId,
      title: conv.title || 'Untitled Conversation',
      description: conv.description,
      lastMessage: conv.description || '', // Use description as lastMessage/summary
      timestamp: conv.updatedAt ? new Date(conv.updatedAt) : new Date(),
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
    })) || [];

  const totalCount = conversationsData?.totalCount || 0;

  // Send message with streaming
  const sendMessage = useCallback(
    async (
      question: string,
      isNewConversation = false,
      agentType?: number,
      model?: string,
      provider?: string,
    ) => {
      setInternalIsStreaming(true);
      // Capture the ID context where this stream started
      const startContextId = isNewConversation
        ? undefined
        : currentConversationId;
      setStreamingConversationId(startContextId);

      let streamedContent = '';

      // Add user message immediately for better UX
      const userMessage: Message = {
        messageId: `temp-${Date.now()}`,
        question,
        type: 'user',
        content: question,
        conversationId: currentConversationId || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);

      // Add placeholder for assistant message
      const assistantPlaceholder: Message = {
        messageId: `temp-assistant-${Date.now()}`,
        question: '',
        type: 'assistant',
        content: '',
        conversationId: currentConversationId || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantPlaceholder]);
      const placeholderId = assistantPlaceholder.messageId;

      try {
        for await (const event of createMessageStream({
          question,
          conversationId: isNewConversation ? undefined : currentConversationId,
          isCreateConversation: isNewConversation,
          agentType,
          model,
          provider,
        })) {
          // ... rest of the loop remains the same ...
          const flatData = event.data as MessageStreamEventData;
          const eventType = flatData.type || event.type;
          const eventContent = flatData.content || '';

          setStreamingStatus({ type: eventType, content: eventContent });

          if (
            flatData.conversationId &&
            flatData.conversationId !== currentConversationIdRef.current
          ) {
            setCurrentConversationId(flatData.conversationId);
            setStreamingConversationId(flatData.conversationId);
          }

          if (event.type === 'message' && flatData) {
            const deltaText = flatData.content || '';
            if (flatData.type === 'text' && deltaText) {
              streamedContent += deltaText;
            }

            setMessages((prev) => {
              const lastIndex = prev.length - 1;
              if (lastIndex >= 0 && prev[lastIndex].type === 'assistant') {
                const updated = [...prev];
                updated[lastIndex] = {
                  messageId: flatData.messageId || placeholderId,
                  question: '',
                  type: 'assistant' as const,
                  content:
                    flatData.type === 'text'
                      ? streamedContent
                      : flatData.type === 'thinking'
                        ? flatData.content || prev[lastIndex].content
                        : prev[lastIndex].content,
                  conversationId:
                    flatData.conversationId || currentConversationId || '',
                  createdAt: flatData.createdAt || new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                };
                return updated;
              }
              return prev;
            });
          } else if (event.type === 'error') {
            const errorMessage =
              flatData.error?.message ||
              (typeof flatData === 'string' ? flatData : 'Stream error');
            console.error('❌ Stream error:', flatData);

            // Instead of throwing, update the assistant message with the error
            setMessages((prev) => {
              const lastIndex = prev.length - 1;
              if (lastIndex >= 0) {
                const updated = [...prev];
                updated[lastIndex] = {
                  ...updated[lastIndex],
                  type: 'error' as const,
                  content: errorMessage,
                };
                return updated;
              }
              return prev;
            });
            break; // Stop streaming but keep messages
          }
        }

        setStreamingStatus({});
        await refetchMessages();
        await refetchConversations();
      } catch (error) {
        console.error('Error sending message:', error);
        setStreamingStatus({});
        // Only remove if it's REALLY an initialization error (e.g. fetch failed)
        // If we already have content, don't clear it.
        setMessages((prev) => {
          const hasAssistantContent = prev.some(
            (m) => m.type === 'assistant' && m.content,
          );
          if (hasAssistantContent) return prev;
          return prev.filter(
            (msg) =>
              !msg.messageId?.startsWith('temp-') &&
              msg.messageId !== placeholderId,
          );
        });
      } finally {
        setInternalIsStreaming(false);
        setStreamingConversationId(undefined);
      }
    },
    [currentConversationId, refetchMessages, refetchConversations],
  );

  // Create new conversation
  const createNewConversation = useCallback(() => {
    setCurrentConversationId(undefined);
    setMessages([]);
  }, []);

  // Select conversation
  const selectConversation = useCallback((conversationId: string) => {
    setCurrentConversationId(conversationId);
  }, []);

  // Delete conversation
  const deleteConversation = useCallback(
    async (conversationId: string) => {
      await deleteConversationMutation({ id: conversationId });
      if (currentConversationId === conversationId) {
        setCurrentConversationId(undefined);
        setMessages([]);
      }
      await refetchConversations();
    },
    [deleteConversationMutation, currentConversationId, refetchConversations],
  );

  // Update conversation
  const updateConversation = useCallback(
    async (conversationId: string, title?: string, description?: string) => {
      await updateConversationMutation({
        id: conversationId,
        data: { title, description },
      });
      await refetchConversations();
    },
    [updateConversationMutation, refetchConversations],
  );

  // Delete all conversations
  const deleteAllConversations = useCallback(async () => {
    await deleteAllConversationsMutation();
    setCurrentConversationId(undefined);
    setMessages([]);
    await refetchConversations();
  }, [deleteAllConversationsMutation, refetchConversations]);

  return {
    // Data
    conversations: conversationsData?.conversations || [],
    sessions,
    messages,
    currentConversationId,

    // Loading states
    isStreaming,
    streamingStatus,
    isLoadingConversations,
    isLoadingMessages,

    // Filter & Pagination
    search,
    setSearch,
    page,
    setPage,
    limit,
    setLimit,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    totalCount,

    // Actions
    sendMessage,
    createNewConversation,
    selectConversation,
    deleteConversation,
    updateConversation,
    deleteAllConversations,
    refetchConversations,
    refetchMessages,
  };
}
