import { CommandApprovalPrompt } from './components/command-approval-prompt';
import { AgentTodoPanel } from './components/agent-todo-panel';
import { useAgentChat } from '@/hooks/use-agent-chat';
import { useParams } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { ChatConversation } from './components/chat-conversation';
import { ChatHeader } from './components/chat-header';
import { ToolCallHistoryPanel } from './components/tool-call-history-panel';
import { SubagentsPanel } from './components/subagents-panel';
import { TurnStatsPanel } from './components/turn-stats-panel';
import { useMediaQuery } from './components/use-media-query';

const SHOW_STATS_STORAGE_KEY = 'agent-show-turn-stats';

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
    goal,
    conversationMeta,
    subagents,
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
    pendingApproval,
    pendingApprovalCount,
    isDecidingApproval,
    onDecideApproval,
  } = useAgentChat({ conversationId });

  // Turn stats are opt-in from the header; the choice is kept per browser
  const [showStats, setShowStats] = useState(() => {
    try {
      return localStorage.getItem(SHOW_STATS_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const toggleStats = useCallback(() => {
    setShowStats((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SHOW_STATS_STORAGE_KEY, String(next));
      } catch {
        // storage unavailable — keep the in-memory value
      }
      return next;
    });
  }, []);

  const hasTodos = !!todos && todos.length > 0;
  // The goal shows even before the first step exists (auto-generated like the title)
  const hasPlanPanel = hasTodos || !!goal;
  const hasSidebars = hasPlanPanel || showStats || subagents.length > 0;

  const [selectedToolCallId, setSelectedToolCallId] = useState<string | null>(
    null,
  );
  const handleSelectToolCall = useCallback((id: string) => {
    setSelectedToolCallId(id);
    // Reset after scroll animation completes
    setTimeout(() => setSelectedToolCallId(null), 2500);
  }, []);

  return (
    // Fills the layout's main area edge to edge (the negative margins undo
    // its padding). The header floats over the top: the side columns start
    // below it (pt-14), the chat scrolls under it
    <div className="relative -m-4 md:-m-6 flex min-h-0 flex-1 flex-col overflow-hidden">
      <ChatHeader
        conversationId={conversationId}
        title={title}
        createdAt={createdAt}
        showStats={showStats}
        onToggleStats={toggleStats}
      />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row overflow-hidden">
        {/* Left sidebar: Todo — large screens only. Shown together with the
            right one, at the same width, so the chat stays centered */}
        {hasSidebars && (
          <div className="hidden lg:flex lg:w-80 shrink-0 flex-col overflow-y-auto p-3 pt-17">
            {hasPlanPanel && <AgentTodoPanel todos={todos} goal={goal} />}
          </div>
        )}

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
            goal={goal}
            showTodoAboveInput={!isLargeScreen}
            selectedToolCallId={selectedToolCallId}
            remoteExecuteEvents={remoteExecuteEvents}
            approvalPrompt={
              pendingApproval && (
                <CommandApprovalPrompt
                  key={pendingApproval.approvalId}
                  approval={pendingApproval}
                  queueSize={pendingApprovalCount}
                  isSubmitting={isDecidingApproval}
                  onDecide={onDecideApproval}
                />
              )
            }
          />
        </div>

        {/* Right sidebar: subagents, then turn stats + tool call history
            (shown from the header's stats button) — large screens only */}
        {hasSidebars && (
          <div className="hidden lg:flex lg:w-80 shrink-0 flex-col overflow-hidden pt-14">
            <SubagentsPanel subagents={subagents} />
            {showStats && (
              <>
                <TurnStatsPanel metadata={conversationMeta} />
                <div className="flex min-h-0 flex-1 flex-col p-3">
                  <ToolCallHistoryPanel
                    messages={messages}
                    onSelectToolCall={handleSelectToolCall}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
