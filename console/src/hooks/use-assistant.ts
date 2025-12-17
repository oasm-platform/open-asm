import { useState, useCallback, useEffect, useRef } from 'react';
import {
  useAiAssistantControllerGetConversations,
  useAiAssistantControllerGetMessages,
  useAiAssistantControllerDeleteConversation,
  useAiAssistantControllerUpdateConversation,
  useAiAssistantControllerDeleteConversations,
} from '@/services/apis/gen/queries';
import { createMessageStream } from '@/services/apis/ai-assistant-sse';
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

  // Fetch conversations
  const {
    data: conversationsData,
    refetch: refetchConversations,
    isLoading: isLoadingConversations,
  } = useAiAssistantControllerGetConversations();

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
      setMessages(messagesData.messages);
    }
  }, [messagesData, internalIsStreaming]);

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

  // Send message with streaming
  const sendMessage = useCallback(
    async (question: string, isNewConversation = false, agentType?: number) => {
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
        })) {
          // Reverted blocking logic ("Stop Jumping") as per user request.
          // Stream will continue to update global state and force navigation.

          // Update streaming status for UI
          const eventType =
            'type' in event.data && typeof event.data.type === 'string'
              ? event.data.type
              : event.type;

          const eventContent =
            'content' in event.data && typeof event.data.content === 'string'
              ? event.data.content
              : '';

          setStreamingStatus({ type: eventType, content: eventContent });

          if (
            event.type === 'conversation' &&
            'conversationId' in event.data &&
            typeof event.data.conversationId === 'string'
          ) {
            setCurrentConversationId(event.data.conversationId);
            // Update streaming ID to follow the conversation
            setStreamingConversationId(event.data.conversationId);
          } else if (event.type === 'message' && event.data) {
            // Extract content - might be JSON string from backend
            let deltaText = '';
            if (
              'content' in event.data &&
              typeof event.data.content === 'string'
            ) {
              try {
                // Backend sends content as JSON string like: {"text": "...", "agent": "..."}
                const contentObj = JSON.parse(event.data.content);
                if (contentObj.text) {
                  deltaText = contentObj.text;
                }
              } catch {
                // If not JSON, use as-is
                deltaText = event.data.content;
              }
            }

            // Accumulate content
            if (deltaText) {
              streamedContent += deltaText;
            }

            // Update the assistant message with accumulated content in REALTIME
            setMessages((prev) => {
              const lastIndex = prev.length - 1;
              if (lastIndex >= 0 && prev[lastIndex].type === 'assistant') {
                const updated = [...prev];
                updated[lastIndex] = {
                  messageId:
                    'messageId' in event.data &&
                    typeof event.data.messageId === 'string'
                      ? event.data.messageId
                      : placeholderId,
                  // Don't set question here to avoid duplication in UI
                  // logic in chat-messages.tsx will render separate user message
                  question: '',
                  type: 'assistant',
                  content: streamedContent, // Show accumulated content
                  conversationId:
                    'conversationId' in event.data &&
                    typeof event.data.conversationId === 'string'
                      ? event.data.conversationId
                      : currentConversationId || '',
                  createdAt:
                    'createdAt' in event.data &&
                    typeof event.data.createdAt === 'string'
                      ? event.data.createdAt
                      : new Date().toISOString(),
                  updatedAt:
                    'updatedAt' in event.data &&
                    typeof event.data.updatedAt === 'string'
                      ? event.data.updatedAt
                      : new Date().toISOString(),
                };
                return updated;
              }
              return prev;
            });
          } else if (event.type === 'error') {
            const errorMessage =
              'message' in event.data && typeof event.data.message === 'string'
                ? event.data.message
                : 'Stream error';
            console.error('❌ Stream error:', event.data);
            throw new Error(errorMessage);
          }
        }

        // Clear streaming status
        setStreamingStatus({});
        // Refetch to get the final state (Only if we are still close?)
        // Refetching is safe, triggers useEffect update.
        await refetchMessages();
        await refetchConversations();
      } catch (error) {
        console.error('Error sending message:', error);
        // Clear streaming status on error
        setStreamingStatus({});
        // Remove placeholder messages on error
        setMessages((prev) =>
          prev.filter(
            (msg) =>
              !msg.messageId?.startsWith('temp-') &&
              msg.messageId !== placeholderId,
          ),
        );
        throw error;
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
