import { AgentTodoPanel } from './components/agent-todo-panel';
import { useAgentChat } from '@/hooks/use-agent-chat';
import { useParams } from '@tanstack/react-router';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useCallback, useState } from 'react';
import { ChatConversation } from './components/chat-conversation';
import { ToolCallHistoryPanel } from './components/tool-call-history-panel';
import { useMediaQuery } from './components/use-media-query';

dayjs.extend(relativeTime);

// ---------------------------------------------------------------------------
// AgentsChatPage
// ---------------------------------------------------------------------------

export default function AgentsChatPage() {
  const { conversationId } = useParams({ strict: false });
  const isLargeScreen = useMediaQuery('(min-width: 1024px)');

  const {
    messages,
    isStreaming,
    isLoadingHistory,
    streamError,
    isRetrying,
    retryAttempt,
    todos,
    title,
    createdAt,
    selectedModel,
    agentMode,
    selectedWorkerId,
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
    onWorkerSelect,
  } = useAgentChat({ conversationId });

  const [selectedToolCallId, setSelectedToolCallId] = useState<string | null>(
    null,
  );
  const handleSelectToolCall = useCallback((id: string) => {
    setSelectedToolCallId(id);
    // Reset after scroll animation completes
    setTimeout(() => setSelectedToolCallId(null), 2500);
  }, []);

  return (
    <div
      className="-m-4 md:-m-6 flex flex-col lg:flex-row overflow-hidden"
      style={{ height: 'calc(100vh - 4rem)' }}
    >
      {/* Left sidebar: Todo — large screens only */}
      <div className="hidden lg:flex lg:w-72 shrink-0 flex-col overflow-y-auto p-3">
        {todos && todos.length > 0 && (
          <>
            {title && (
              <div className="mb-2 p-1">
                <span className="block text-sm font-medium truncate max-w-full" title={title}>
                  {title}
                </span>
                {createdAt && (
                  <span className="block text-xs text-muted-foreground mt-1">
                    {dayjs(createdAt).fromNow()}
                  </span>
                )}
              </div>
            )}
            <AgentTodoPanel todos={todos} />
          </>
        )}
      </div>

      {/* Center: Chat conversation */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <ChatConversation
          messages={messages}
          onSendMessage={onSendMessage}
          onRetry={onRetry}
          onStop={onStop}
          isStreaming={isStreaming}
          isLoadingMessages={isLoadingHistory}
          streamError={streamError}
          isRetrying={isRetrying}
          retryAttempt={retryAttempt}
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
          selectedWorkerId={selectedWorkerId}
          onWorkerSelect={onWorkerSelect}
          todos={todos}
          showTodoAboveInput={!isLargeScreen}
          selectedToolCallId={selectedToolCallId}
          remoteExecuteEvents={remoteExecuteEvents}
        />
      </div>

      {/* Right sidebar: Tool call history — large screens only */}
      <div className="hidden lg:flex lg:w-80 shrink-0 flex-col overflow-y-auto">
        <ToolCallHistoryPanel
          messages={messages}
          onSelectToolCall={handleSelectToolCall}
        />
      </div>
    </div>
  );
}
