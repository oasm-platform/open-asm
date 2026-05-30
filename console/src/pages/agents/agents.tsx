import { useAgentChat } from '@/hooks/use-agent-chat';
import { useParams } from 'react-router-dom';
import { ChatConversation } from './chat-conversation';

export default function AgentsChatPage() {
  const { conversationId } = useParams<{ conversationId: string }>();

  const {
    messages,
    isStreaming,
    isLoadingHistory,
    streamError,
    todos,
    selectedModel,
    agentMode,
    hasSentFirstMessage,
    hasMoreMessages,
    isLoadingMoreMessages,
    remoteExecuteEvents,
    onSendMessage,
    onRetry,
    onStop,
    onSelectModel,
    onDismissError,
    onLoadMore,
    onAgentModeChange,
  } = useAgentChat({ conversationId });

  return (
    <div
      className="-m-4 flex flex-col overflow-hidden"
      style={{ height: 'calc(100vh - 4rem)' }}
    >
      <ChatConversation
        messages={messages}
        onSendMessage={onSendMessage}
        onRetry={onRetry}
        onStop={onStop}
        isStreaming={isStreaming}
        isLoadingMessages={isLoadingHistory}
        streamError={streamError}
        onDismissError={onDismissError}
        selectedConfigId={selectedModel?.configId ?? null}
        selectedModel={selectedModel?.model ?? null}
        onSelectModel={onSelectModel}
        hasSentFirstMessage={hasSentFirstMessage}
        onLoadMore={onLoadMore}
        hasMoreMessages={hasMoreMessages}
        isLoadingMoreMessages={isLoadingMoreMessages}
        agentMode={agentMode}
        onAgentModeChange={onAgentModeChange}
        todos={todos}
        remoteExecuteEvents={remoteExecuteEvents}
      />
    </div>
  );
}
