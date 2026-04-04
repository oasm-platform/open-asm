import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import { useAgentsControllerGetMessages } from '@/services/apis/gen/queries';
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
  const [selectedModel, setSelectedModel] = useState<SelectedModel | null>(
    null,
  );
  const selectedModelRef = useRef<SelectedModel | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  const { selectedWorkspace } = useWorkspaceSelector();
  const workspaceId = selectedWorkspace;

  // Fetch messages when loading an existing conversation (not during streaming)
  const { data: messagesData, isLoading: isLoadingHistory } =
    useAgentsControllerGetMessages(conversationId!, undefined, {
      query: {
        queryKey: ['/api/agents/conversations', conversationId, 'messages'],
        // Only fetch if we have a valid conversation ID and not currently streaming
        enabled: !!conversationId && !isStreamingRef.current,
      },
    });

  // Convert history messages to UIMessage format
  const savedMessages: UIMessage[] = useMemo(() => {
    const rawData = messagesData as unknown;
    const dataArray = Array.isArray(rawData)
      ? rawData
      : (rawData as { data?: unknown[] })?.data;

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
    setMessages,
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

  const isHistoryLoadedRef = useRef(false);

  // Reset loaded ref when conversation changes
  useEffect(() => {
    isHistoryLoadedRef.current = false;
  }, [conversationId]);

  // Sync loaded history to chatMessages exactly once
  useEffect(() => {
    if (!conversationId) {
      isHistoryLoadedRef.current = true;
      return;
    }

    // Only sync if history finished loading and we haven't synced yet for this conversation
    if (!isHistoryLoadedRef.current && !isLoadingHistory) {
      if (savedMessages.length > 0) {
        setMessages(savedMessages);
      }
      isHistoryLoadedRef.current = true;
    }
  }, [conversationId, isLoadingHistory, savedMessages, setMessages]);

  const displayMessages: UIMessage[] = chatMessages;

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
      const lastUserMsg = [...chatMessages]
        .reverse()
        .find((m) => m.role === 'user');
      if (lastUserMsg) {
        const textContent =
          lastUserMsg.parts
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
      />
    </div>
  );
}
