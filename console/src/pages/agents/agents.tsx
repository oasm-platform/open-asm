import { CommandApprovalPrompt } from './components/command-approval-prompt';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useAgentChat } from '@/hooks/use-agent-chat';
import { useIsMobile } from '@/hooks/use-mobile';
import { useParams } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { ChatConversation } from './components/chat-conversation';
import { ChatHeader } from './components/chat-header';
import {
  ChatSidePanel,
  SIDE_PANEL_TABS,
  sidePanelContent,
  type SidePanelTab,
} from './components/chat-side-panel';
import { isSubagentActive } from './components/subagents-panel';
import { useMediaQuery } from './components/use-media-query';

const SIDE_PANEL_STORAGE_KEY = 'agent-side-panel-open';

// ---------------------------------------------------------------------------
// AgentsChatPage
// ---------------------------------------------------------------------------

export default function AgentsChatPage() {
  const { conversationId } = useParams({ strict: false });
  const isMobile = useIsMobile();
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
    browserScreenshots,
    onSendMessage,
    onRetry,
    onStop,
    onSelectModel,
    onDismissError,
    onLoadMore,
    onWorkerSelect,
    pendingApproval,
    pendingApprovalCount,
    isDecidingApproval,
    onDecideApproval,
  } = useAgentChat({ conversationId });

  // The side panel opens from the header; the choice is kept per browser
  const [panelOpen, setPanelOpen] = useState(() => {
    try {
      return localStorage.getItem(SIDE_PANEL_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const setPanel = useCallback((open: boolean) => {
    setPanelOpen(open);
    try {
      localStorage.setItem(SIDE_PANEL_STORAGE_KEY, String(open));
    } catch {
      // storage unavailable — keep the in-memory value
    }
  }, []);

  // Smaller screens have no room to split: the panel opens full screen there,
  // for a look, so it is not kept like the split one
  const [sheetOpen, setSheetOpen] = useState(false);

  const [panelTab, setPanelTab] = useState<SidePanelTab>('plan');

  const [selectedToolCallId, setSelectedToolCallId] = useState<string | null>(
    null,
  );
  const handleSelectToolCall = useCallback((id: string) => {
    // Full screen, the panel covers the chat: close it to show the call
    setSheetOpen(false);
    setSelectedToolCallId(id);
    // Reset after scroll animation completes
    setTimeout(() => setSelectedToolCallId(null), 2500);
  }, []);

  const handleOpenPanel = () => {
    // Open on a tab that has something to show (checked on click only: it
    // walks every message)
    const panelContent = sidePanelContent({
      todos,
      goal,
      subagents,
      messages,
      metadata: conversationMeta,
      browserScreenshots,
    });
    if (!panelContent[panelTab]) {
      const firstWithContent = SIDE_PANEL_TABS.find((t) => panelContent[t]);
      if (firstWithContent) setPanelTab(firstWithContent);
    }
    if (isLargeScreen) setPanel(true);
    else setSheetOpen(true);
  };

  const renderSidePanel = (onClose: () => void) => (
    <ChatSidePanel
      tab={panelTab}
      onTabChange={setPanelTab}
      onClose={onClose}
      todos={todos}
      goal={goal}
      subagents={subagents}
      messages={messages}
      metadata={conversationMeta}
      conversationId={conversationId}
      onSelectToolCall={handleSelectToolCall}
      remoteExecuteEvents={remoteExecuteEvents}
      browserScreenshots={browserScreenshots}
      className="flex-1"
    />
  );

  return (
    // Fills the layout's main area edge to edge (the negative margins undo
    // its padding)
    <div className="relative -m-4 md:-m-6 flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row overflow-hidden">
        {/* Chat conversation. Its header floats over the top: the chat
            scrolls under it */}
        <div className="relative flex-1 min-w-0 flex flex-col overflow-hidden">
          <ChatHeader
            conversationId={conversationId}
            title={title}
            createdAt={createdAt}
            onOpenPanel={
              isLargeScreen && panelOpen ? undefined : handleOpenPanel
            }
            hasActivity={subagents.some(isSubagentActive)}
            agentMode={agentMode}
          />
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
            selectedWorkerId={selectedWorkerId}
            onWorkerSelect={onWorkerSelect}
            todos={todos}
            goal={goal}
            // Large screens and mobile keep the plan in the side panel
            // only; in between it also sits above the input
            showTodoAboveInput={!isMobile && !isLargeScreen}
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

        {/* Side panel — large screens only: splits the view with the chat
            (2/5 until xl, then half) and shows the plan, subagents, browser,
            tool calls or turn stats one tab at a time */}
        {panelOpen && (
          <aside className="hidden lg:flex w-2/5 xl:w-1/2 2xl:max-w-3xl shrink-0 flex-col border-l animate-in fade-in-0 slide-in-from-right-4 duration-300">
            {renderSidePanel(() => setPanel(false))}
          </aside>
        )}
      </div>

      {/* Side panel below lg: full screen over the chat. The panel has its
          own close button, so the sheet's is hidden */}
      <Sheet open={sheetOpen && !isLargeScreen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="w-full gap-0 p-0 sm:max-w-none [&>button]:hidden"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Side panel</SheetTitle>
            <SheetDescription>
              Plan, subagents, browser, tool calls and stats of this
              conversation.
            </SheetDescription>
          </SheetHeader>
          {renderSidePanel(() => setSheetOpen(false))}
        </SheetContent>
      </Sheet>
    </div>
  );
}
