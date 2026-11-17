import { Plus, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  SidePanelResizer,
  useSidePanelWidth,
  type PanelLimits,
} from '@/components/ui/side-panel-resizer';
import { Spinner } from '@/components/ui/spinner';
import { useAgentChat } from '@/hooks/use-agent-chat';
import { useAgentWorkers } from '@/hooks/use-agent-workers';
import { useConnectWorkerState } from '@/hooks/useConnectWorkerState';
import { restoreApprovalMode } from '@/hooks/use-approval-mode';
import { useLLMConfigs } from '@/hooks/use-llm-configs';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAgentSettingsDialog } from '@/hooks/useAgentSettingsDialog';
import {
  useAiChatConversation,
  useAiChatPanelOpen,
} from '@/hooks/useAiChatPanel';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { cn } from '@/lib/utils';
import { ChatConversation } from '@/pages/agents/components/chat-conversation';
import { CommandApprovalPrompt } from '@/pages/agents/components/command-approval-prompt';
import { SendMessageDtoAgentMode } from '@/services/apis/gen/queries';
import { AiChatPanelHeader } from './ai-chat-panel-header';
import { AiChatPanelLanding } from './ai-chat-panel-landing';

const WIDTH_STORAGE_KEY = 'ai-chat-panel-width';

const PANEL_LIMITS: PanelLimits = {
  panelMin: 360,
  // Just under the `sm` breakpoint (40rem): at its narrowest the page left
  // of the chat is laid out in a single column
  restMin: 639,
};

interface AiChatPanelProps {
  /** The layout row the panel shares with the app */
  rowRef: RefObject<HTMLElement | null>;
}

interface PanelConversationProps {
  conversationId: string;
  isNew: boolean;
}

/**
 * One chat in the panel, the same one AI Studio shows: mounted per
 * conversation (keyed by its id) so the chat hook starts clean on a switch.
 */
function PanelConversation({ conversationId, isNew }: PanelConversationProps) {
  const {
    state: { start },
    markStarted,
    clearStart,
  } = useAiChatConversation();
  const chat = useAgentChat({ conversationId, isNew });
  const { workers, isLoading: isLoadingWorkers } = useAgentWorkers();
  const { openDialog: openConnectWorker } = useConnectWorkerState();

  // How this chat was asked to start (useAiChat), if it was
  const startConfig =
    start?.conversationId === conversationId ? start.config : null;

  // A new chat picks its mode before the first message; after that the
  // chat's own mode shows
  const [newChatMode, setNewChatMode] = useState<string>(
    () => startConfig?.agentMode ?? SendMessageDtoAgentMode.ask,
  );
  const canSwitchMode = isNew && !chat.hasSentFirstMessage;
  const [inputText, setInputText] = useState(() =>
    startConfig?.autoSubmit === false ? (startConfig.text ?? '') : '',
  );
  // The first message to send once the start config is in place
  const [pendingText, setPendingText] = useState<string | null>(null);

  useEffect(() => {
    // A new chat starts from the settings default or the user's last choice,
    // never the approval mode of the chat shown before it
    if (isNew) restoreApprovalMode();
    // Once, for the chat this was mounted for
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Applies the start config once: cleared in the store right away, so the
  // panel closed and opened again never sends the first message twice
  const appliedStartRef = useRef(false);
  useEffect(() => {
    if (!startConfig || appliedStartRef.current) return;
    appliedStartRef.current = true;
    clearStart();
    if (startConfig.project !== undefined) {
      chat.onProjectChange(startConfig.project);
    }
    if (startConfig.workerId !== undefined) {
      chat.onWorkerSelect(startConfig.workerId);
    }
    const text = startConfig.text?.trim();
    // Sent on the next render, with the worker above already in the transport
    if (text && startConfig.autoSubmit !== false) setPendingText(text);
  }, [startConfig, clearStart, chat]);

  useEffect(() => {
    if (pendingText === null) return;
    // Agent mode needs a worker: with none chosen and none online, the text
    // waits in the input while the user connects one
    if (
      newChatMode === SendMessageDtoAgentMode.agent &&
      !chat.selectedWorkerId
    ) {
      if (isLoadingWorkers) return;
      if (workers.length === 0) {
        setPendingText(null);
        setInputText(pendingText);
        openConnectWorker(undefined, (workerId: string) =>
          chat.onWorkerSelect(workerId),
        );
        return;
      }
    }
    setPendingText(null);
    chat.onSendMessage(pendingText, { agentMode: newChatMode });
  }, [
    pendingText,
    newChatMode,
    chat,
    isLoadingWorkers,
    workers.length,
    openConnectWorker,
  ]);

  useEffect(() => {
    if (chat.hasSentFirstMessage) markStarted();
  }, [chat.hasSentFirstMessage, markStarted]);

  // Starter prompt under the pointer, previewed as the input placeholder
  const [previewPrompt, setPreviewPrompt] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const handleStarterSelect = (prompt: string) => {
    // As on the AI Studio landing: Ask mode sends the prompt at once; agent
    // mode runs real tools, so it only fills the input for the user to add
    // a target (the trailing space) and send
    if (newChatMode !== SendMessageDtoAgentMode.agent) {
      setPendingText(prompt);
      return;
    }
    setInputText(`${prompt} `);
    const textarea = rootRef.current?.querySelector('textarea');
    if (!textarea) return;
    textarea.focus();
    // The caret goes to the end once the filled-in text has rendered
    requestAnimationFrame(() => {
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    });
  };

  return (
    <div
      ref={rootRef}
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <AiChatPanelHeader
        conversationId={conversationId}
        title={chat.title}
        isSaved={!isNew || chat.hasSentFirstMessage}
      />
      <ChatConversation
        messages={chat.messages}
        onSendMessage={chat.onSendMessage}
        onRetry={chat.onRetry}
        onStop={chat.onStop}
        isStreaming={chat.isStreaming}
        isLoadingMessages={chat.isLoadingHistory}
        streamError={chat.streamError}
        isRetrying={chat.isRetrying}
        retryAttempt={chat.retryAttempt}
        onDismissError={chat.onDismissError}
        selectedConfigId={chat.selectedModel?.configId ?? null}
        selectedModel={chat.selectedModel?.model ?? null}
        onSelectModel={chat.onSelectModel}
        hasSentFirstMessage={chat.hasSentFirstMessage}
        onLoadMore={chat.onLoadMore}
        hasMoreMessages={chat.hasMoreMessages}
        isLoadingMoreMessages={chat.isLoadingMoreMessages}
        agentMode={canSwitchMode ? newChatMode : chat.agentMode}
        onAgentModeChange={canSwitchMode ? setNewChatMode : undefined}
        selectedWorkerId={chat.selectedWorkerId}
        onWorkerSelect={chat.onWorkerSelect}
        project={chat.project}
        onProjectChange={canSwitchMode ? chat.onProjectChange : undefined}
        inputValue={inputText}
        onInputValueChange={setInputText}
        todos={chat.todos}
        goal={chat.goal}
        // No room for AI Studio's side panel here: the plan sits above the input
        showTodoAboveInput
        emptyState={
          canSwitchMode && (
            <AiChatPanelLanding
              agentMode={newChatMode}
              onSelect={handleStarterSelect}
              onPreview={setPreviewPrompt}
            />
          )
        }
        placeholder={previewPrompt ?? undefined}
        remoteExecuteEvents={chat.remoteExecuteEvents}
        approvalPrompt={
          chat.pendingApproval && (
            <CommandApprovalPrompt
              key={chat.pendingApproval.approvalId}
              approval={chat.pendingApproval}
              queueSize={chat.pendingApprovalCount}
              isSubmitting={chat.isDecidingApproval}
              onDecide={chat.onDecideApproval}
            />
          )
        }
      />
    </div>
  );
}

/** Shown instead of the chat until the workspace has an LLM provider */
function ConnectProvider() {
  const { open: openSettings } = useAgentSettingsDialog();
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <AiChatPanelHeader isSaved={false} />
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <div className="rounded-full bg-muted p-4 ring-1 ring-border">
          <Sparkles className="size-7 text-muted-foreground" />
        </div>
        <div className="space-y-1.5">
          <h2 className="font-semibold">Connect an AI Provider</h2>
          <p className="text-sm text-muted-foreground">
            To start chatting with the AI security agent, connect an LLM
            provider first.
          </p>
        </div>
        <Button variant="outline" onClick={() => openSettings('provider')}>
          <Plus className="size-4" />
          Connect
        </Button>
      </div>
    </div>
  );
}

/**
 * AI chat beside the app, toggled from the header. Large screens give it a
 * column on the right, so the page narrows to make room; mobile opens it
 * full screen.
 */
export function AiChatPanel({ rowRef }: AiChatPanelProps) {
  const panelRef = useRef<HTMLElement>(null);
  const panelWidth = useSidePanelWidth(rowRef, {
    storageKey: WIDTH_STORAGE_KEY,
    limits: PANEL_LIMITS,
  });
  const { state: isOpen, close } = useAiChatPanelOpen();
  const {
    state: { conversationId, isNew },
    newChat,
  } = useAiChatConversation();
  const isMobile = useIsMobile();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();

  // A chat belongs to its workspace: switching starts a new one
  const workspaceRef = useRef(selectedWorkspaceId);
  useEffect(() => {
    if (workspaceRef.current === selectedWorkspaceId) return;
    workspaceRef.current = selectedWorkspaceId;
    newChat();
  }, [selectedWorkspaceId, newChat]);
  const { hasProviderConnected, isLoading: isLoadingProviders } = useLLMConfigs({
    enabled: !!selectedWorkspaceId && isOpen,
  });

  if (!isOpen) return null;

  // Until the providers load, "none connected" is not known yet: no prompt
  // to connect one
  const content = isLoadingProviders ? (
    <div className="flex flex-1 items-center justify-center">
      <Spinner className="size-5 text-muted-foreground" />
    </div>
  ) : hasProviderConnected ? (
    <PanelConversation
      key={conversationId}
      conversationId={conversationId}
      isNew={isNew}
    />
  ) : (
    <ConnectProvider />
  );

  if (isMobile) {
    return (
      // The panel has its own close button, so the sheet's is hidden
      <Sheet open onOpenChange={(open) => !open && close()}>
        <SheetContent
          side="right"
          className="w-full gap-0 p-0 sm:max-w-none [&>button]:hidden"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>AI chat</SheetTitle>
            <SheetDescription>Chat with the AI security agent.</SheetDescription>
          </SheetHeader>
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <>
      {/* Drag left to widen the chat; the page reflows down to one column */}
      <SidePanelResizer
        rowRef={rowRef}
        panelRef={panelRef}
        width={panelWidth.width}
        onResize={panelWidth.setWidth}
        onCommit={panelWidth.save}
        limits={PANEL_LIMITS}
        label="Resize AI chat"
        className="block"
      />
      {/* A sibling of the page in the layout row: the page shrinks beside
          it. Sticky and as tall as the viewport, so it stays put while the
          page scrolls the document. */}
      <aside
        ref={panelRef}
        aria-label="AI chat"
        className={cn(
          'sticky top-0 flex h-svh shrink-0 flex-col bg-background animate-in fade-in-0 slide-in-from-right-4 duration-300',
          panelWidth.width === null && 'w-[min(28rem,40vw)]',
        )}
        style={
          panelWidth.width === null ? undefined : { width: panelWidth.width }
        }
      >
        {content}
      </aside>
    </>
  );
}
