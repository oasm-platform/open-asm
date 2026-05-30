import AgentPromptInput from '@/components/agent-prompt-input';
import type { AgentTodoItem } from '@/components/agents/agent-todo-panel';
import { AgentTodoPanel } from '@/components/agents/agent-todo-panel';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
} from '@/components/ai-elements/message';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { Markdown } from '@/components/common/markdown';
import type { ToolCallState } from '@/components/common/tool-call-display';
import { ToolCallDisplay } from '@/components/common/tool-call-display';
import type { RemoteExecuteStreamEvent } from '@/hooks/use-remote-execute-stream';
import { Skeleton } from '@/components/ui/skeleton';
import type { TextUIPart, UIMessage } from 'ai';
import {
  AlertCircle,
  CheckIcon,
  CopyIcon,
  RefreshCcwIcon,
  ShieldAlert,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatConversationProps {
  messages: UIMessage[];
  onSendMessage: (content: string, options?: { agentMode?: string }) => void;
  onRetry?: () => void;
  onStop?: () => void;
  isStreaming?: boolean;
  isLoadingMessages?: boolean;
  streamError?: string | null;
  onDismissError?: () => void;
  selectedConfigId?: string | null;
  selectedModel?: string | null;
  onSelectModel?: (provider: string, model: string, configId: string) => void;
  hasSentFirstMessage?: boolean;
  onLoadMore?: () => void;
  hasMoreMessages?: boolean;
  isLoadingMoreMessages?: boolean;
  agentMode?: string;
  onAgentModeChange?: (mode: string) => void;
  todos?: AgentTodoItem[];
  remoteExecuteEvents?: Map<string, RemoteExecuteStreamEvent[]>;
}

interface ToolPart {
  type: string;
  toolCallId: string;
  toolName?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  isError?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getToolStatus(state?: string): ToolCallState['status'] {
  if (!state) return 'pending';
  if (state === 'output-available' || state === 'result') return 'completed';
  if (state === 'output-error') return 'error';
  if (
    state === 'call' ||
    state === 'input-available' ||
    state === 'input-streaming'
  )
    return 'executing';
  return 'pending';
}

function getTextContent(message: UIMessage): string {
  return (message.parts || [])
    .filter((part): part is TextUIPart => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

function isToolPart(part: unknown): part is ToolPart {
  return !!part && typeof part === 'object' && 'toolCallId' in part;
}

function extractToolCallStates(parts: UIMessage['parts']): ToolCallState[] {
  const toolPartsMap = new Map<string, ToolPart>();
  for (const p of parts) {
    if (
      (p.type === 'dynamic-tool' || p.type.startsWith('tool-')) &&
      isToolPart(p)
    ) {
      toolPartsMap.set(p.toolCallId, p);
    }
  }
  return Array.from(toolPartsMap.values()).map((t) => ({
    toolCallId: t.toolCallId,
    toolName:
      t.type === 'dynamic-tool'
        ? t.toolName || 'dynamic-tool'
        : t.type.replace('tool-', ''),
    status: getToolStatus(t.state),
    input: t.input as Record<string, unknown>,
    output: t.output,
  }));
}

function extractReasoningText(parts: UIMessage['parts']): string {
  return parts
    .filter(
      (p): p is Extract<(typeof parts)[number], { type: 'reasoning' }> =>
        p.type === 'reasoning',
    )
    .map((p) => p.text)
    .join('\n\n');
}

// ---------------------------------------------------------------------------
// ThinkingLabel — shared between streaming and history
// ---------------------------------------------------------------------------

function ThinkingLabel({
  isStreaming,
  duration,
}: {
  isStreaming: boolean;
  duration?: number;
}) {
  if (isStreaming || duration === 0) {
    return (
      <span className="inline-flex items-center gap-2 min-w-0">
        <Shimmer duration={1}>Thinking</Shimmer>
      </span>
    );
  }
  if (duration === undefined) return <p>Thought for a few seconds</p>;
  return <p>Thought for {duration} seconds</p>;
}

// ---------------------------------------------------------------------------
// TypingDots — animated dots for streaming indicator
// ---------------------------------------------------------------------------

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1 rounded-full bg-muted-foreground"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{
            duration: 1,
            repeat: Infinity,
            delay: i * 0.2,
            ease: 'easeInOut',
          }}
        />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// CopyButton
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <MessageAction
      onClick={handleCopy}
      label={copied ? 'Copied!' : 'Copy'}
      tooltip={copied ? 'Copied!' : 'Copy message'}
    >
      {copied ? (
        <CheckIcon className="size-3.5 text-green-500" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
    </MessageAction>
  );
}

// ---------------------------------------------------------------------------
// ChatMessage
// ---------------------------------------------------------------------------

const ChatMessage = memo(function ChatMessage({
  message,
  idx,
  messagesLength,
  isStreaming,
  remoteExecuteEvents,
}: {
  message: UIMessage;
  idx: number;
  messagesLength: number;
  isStreaming: boolean;
  remoteExecuteEvents?: Map<string, RemoteExecuteStreamEvent[]>;
}) {
  const textContent = getTextContent(message);
  const hasContent = textContent.length > 0;
  const isLastAssistant =
    message.role === 'assistant' && idx === messagesLength - 1;
  const isStreamingActive = isLastAssistant && isStreaming;

  const parts = message.parts || [];
  const reasoningText = extractReasoningText(parts);
  const hasReasoning = reasoningText.length > 0;
  const toolCallStates = extractToolCallStates(parts);
  const lastPart = parts.at(-1);

  // Show "Thinking" shimmer when streaming starts but no content/reasoning/tools yet
  const showInitialThinking =
    isStreamingActive &&
    !hasContent &&
    !hasReasoning &&
    toolCallStates.length === 0;

  // Reasoning is actively streaming if the last part is a reasoning part
  const isReasoningStreaming =
    isStreamingActive && lastPart?.type === 'reasoning';

  // Show "Generating" when streaming but no text content yet
  // (covers: waiting for tools, or tools done but text not started)
  const showGenerating =
    isStreamingActive &&
    !hasContent &&
    !showInitialThinking &&
    !isReasoningStreaming;

  return (
    <Message from={message.role}>
      <MessageContent expandable={message.role === 'user'}>
        <div className="flex flex-col w-full gap-3">
          {/* Reasoning section */}
          {(hasReasoning || showInitialThinking) && (
            <Reasoning
              className="w-full [&_.italic]:hidden [&_em]:hidden [&_i]:hidden"
              isStreaming={showInitialThinking || isReasoningStreaming}
            >
              <ReasoningTrigger
                getThinkingMessage={(s, d) => (
                  <ThinkingLabel isStreaming={s} duration={d} />
                )}
              />
              <ReasoningContent>{reasoningText}</ReasoningContent>
            </Reasoning>
          )}

          {/* Tool calls */}
          <AnimatePresence mode="popLayout">
            {toolCallStates.map((state) => (
              <ToolCallDisplay
                key={state.toolCallId}
                toolCall={state}
                streamEvents={remoteExecuteEvents?.get(state.toolCallId)}
              />
            ))}
          </AnimatePresence>

          {/* Generating indicator — shown after tools complete, before text arrives */}
          {showGenerating && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 text-muted-foreground text-sm select-none"
            >
              <TypingDots />
            </motion.div>
          )}

          {/* Text response */}
          {hasContent && (
            <div className="w-full">
              <Markdown
                content={textContent}
                preview={false}
                className="text-base"
              />
            </div>
          )}

          {/* Streaming indicator — inline dots while generating */}
          {isStreamingActive && hasContent && (
            <div className="flex items-center gap-1.5 text-muted-foreground text-sm select-none">
              <TypingDots />
            </div>
          )}
        </div>
      </MessageContent>

      {/* Copy button — only appears after streaming finishes */}
      {message.role === 'assistant' && hasContent && !isStreamingActive && (
        <MessageActions>
          <CopyButton text={textContent} />
        </MessageActions>
      )}
    </Message>
  );
});

// ---------------------------------------------------------------------------
// Loading skeleton — uses shadcn Skeleton + ai-elements Message structure
// ---------------------------------------------------------------------------

function UserMessageSkeleton() {
  return (
    <Message from="user">
      <MessageContent>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </MessageContent>
    </Message>
  );
}

function AssistantMessageSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
    >
      <Message from="assistant">
        <MessageContent>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[90%]" />
            <Skeleton className="h-4 w-[75%]" />
            <Skeleton className="h-4 w-[60%]" />
          </div>
        </MessageContent>
      </Message>
    </motion.div>
  );
}

function LoadingSkeleton() {
  return (
    <motion.div
      className="flex flex-col gap-6"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.12 } },
      }}
    >
      <motion.div
        variants={{
          hidden: { opacity: 0, y: 8 },
          visible: { opacity: 1, y: 0 },
        }}
        transition={{ duration: 0.3 }}
      >
        <UserMessageSkeleton />
      </motion.div>
      <AssistantMessageSkeleton delay={0.12} />
      <motion.div
        variants={{
          hidden: { opacity: 0, y: 8 },
          visible: { opacity: 1, y: 0 },
        }}
        transition={{ duration: 0.3 }}
      >
        <UserMessageSkeleton />
      </motion.div>
      <AssistantMessageSkeleton delay={0.36} />
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// StreamError
// ---------------------------------------------------------------------------

function StreamError({
  error,
  onRetry,
  onDismiss,
}: {
  error: string;
  onRetry?: () => void;
  onDismiss: () => void;
}) {
  return (
    <motion.div
      className="mx-auto max-w-3xl w-full px-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
        <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-medium text-destructive">Streaming error</p>
          <p className="text-muted-foreground mt-1">{error}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="flex items-center gap-1.5 rounded-md bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
            >
              <RefreshCcwIcon className="size-3.5" />
              Retry
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md p-1 hover:bg-accent transition-colors"
            aria-label="Dismiss error"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// ChatConversation
// ---------------------------------------------------------------------------

export const ChatConversation = memo(function ChatConversation({
  messages,
  onSendMessage,
  onRetry,
  onStop,
  isStreaming = false,
  isLoadingMessages = false,
  streamError,
  onDismissError,
  selectedConfigId,
  selectedModel,
  onSelectModel,
  onLoadMore,
  hasMoreMessages = false,
  isLoadingMoreMessages = false,
  agentMode = 'false',
  onAgentModeChange,
  todos,
  remoteExecuteEvents,
}: ChatConversationProps) {
  const [lastUserMessage, setLastUserMessage] = useState<string | null>(null);
  const isLoadingMoreRef = useRef(false);
  const onLoadMoreRef = useRef(onLoadMore);
  const hasMoreRef = useRef(hasMoreMessages);

  useEffect(() => {
    isLoadingMoreRef.current = isLoadingMoreMessages;
  }, [isLoadingMoreMessages]);
  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);
  useEffect(() => {
    hasMoreRef.current = hasMoreMessages;
  }, [hasMoreMessages]);

  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const sentinelRef = useCallback((el: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    if (el) {
      if (!scrollContainerRef.current) {
        const container =
          el.closest('.overflow-y-auto, .overflow-y-scroll') ||
          el.parentElement;
        scrollContainerRef.current = container as HTMLElement;
      }

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (
            entry.isIntersecting &&
            hasMoreRef.current &&
            !isLoadingMoreRef.current &&
            onLoadMoreRef.current
          ) {
            onLoadMoreRef.current();
          }
        },
        {
          root: scrollContainerRef.current,
          rootMargin: '400px 0px 0px 0px',
        },
      );

      observer.observe(el);
      observerRef.current = observer;
    }
  }, []);

  const prevScrollHeightRef = useRef<number>(0);
  const prevMessageCountRef = useRef<number>(0);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.style.overflowAnchor = 'none';

    if (
      messages.length > prevMessageCountRef.current &&
      prevMessageCountRef.current > 0
    ) {
      const heightDifference =
        container.scrollHeight - prevScrollHeightRef.current;
      if (heightDifference > 0) {
        container.scrollTop += heightDifference;
      }
    }

    prevScrollHeightRef.current = container.scrollHeight;
    prevMessageCountRef.current = messages.length;
  }, [messages]);

  useEffect(() => {
    const userMessages = messages.filter((m) => m.role === 'user');
    if (userMessages.length > 0) {
      const lastUser = userMessages[userMessages.length - 1];
      setLastUserMessage(getTextContent(lastUser));
    }
  }, [messages]);

  const handleRetry = useCallback(() => {
    onRetry?.();
  }, [onRetry]);

  // Check if there's a user message without a response yet
  const hasUnansweredMessage = useMemo(() => {
    if (!isStreaming || messages.length === 0) return false;
    let userCount = 0;
    let assistantCount = 0;
    for (const m of messages) {
      if (m.role === 'user') userCount++;
      else if (m.role === 'assistant') assistantCount++;
    }
    return userCount > assistantCount;
  }, [isStreaming, messages]);

  const isLoadingHistory = isLoadingMessages && messages.length === 0;
  const isEmpty = !isLoadingMessages && messages.length === 0 && !isStreaming;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Conversation className="flex-1">
        <ConversationContent className="max-w-3xl mx-auto w-full p-1 gap-6">
          {isLoadingHistory ? (
            <LoadingSkeleton />
          ) : isEmpty ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            >
              <ConversationEmptyState
                icon={<ShieldAlert className="size-12" />}
                title="Security AI ready"
                description="Ask anything about vulnerabilities, secure coding, and best practices."
              />
            </motion.div>
          ) : (
            <>
              <div ref={sentinelRef} className="h-px" aria-hidden="true" />

              {isLoadingMoreMessages && (
                <motion.div
                  className="flex justify-center py-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  <TypingDots />
                </motion.div>
              )}

              {messages.map((message, idx) => {
                const hasToolCalls = (message.parts || []).some(
                  (p) =>
                    (p.type === 'dynamic-tool' || p.type.startsWith('tool-')) &&
                    'toolCallId' in p,
                );
                return (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    idx={idx}
                    messagesLength={messages.length}
                    isStreaming={isStreaming}
                    remoteExecuteEvents={
                      hasToolCalls ? remoteExecuteEvents : undefined
                    }
                  />
                );
              })}

              {/* Show thinking indicator while waiting for first response */}
              {hasUnansweredMessage && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <Reasoning
                    isStreaming
                    className="w-full [&_.italic]:hidden [&_em]:hidden [&_i]:hidden"
                  >
                    <ReasoningTrigger
                      getThinkingMessage={(s, d) => (
                        <ThinkingLabel isStreaming={s} duration={d} />
                      )}
                    />
                    <ReasoningContent>{''}</ReasoningContent>
                  </Reasoning>
                </motion.div>
              )}
            </>
          )}

          {streamError && (
            <StreamError
              error={streamError}
              onRetry={lastUserMessage ? handleRetry : undefined}
              onDismiss={onDismissError}
            />
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="shrink-0 bg-background/90 backdrop-blur-sm px-4 pb-4">
        <div className="max-w-3xl mx-auto w-full flex flex-col">
          {todos && todos.length > 0 && (
            <AgentTodoPanel
              todos={todos}
              className="rounded-b-none border-b-0 mx-2"
            />
          )}

          <AgentPromptInput
            onSubmit={(content, options) =>
              onSendMessage(content, { agentMode: options?.agentMode })
            }
            isSending={isStreaming}
            onStop={onStop}
            selectedModel={
              selectedConfigId && selectedModel
                ? {
                    provider: '',
                    model: selectedModel,
                    configId: selectedConfigId,
                  }
                : null
            }
            onSelectModel={onSelectModel}
            agentMode={agentMode}
            onAgentModeChange={onAgentModeChange}
            placeholder={
              isStreaming
                ? 'Waiting for response…'
                : 'Ask anything about security…'
            }
          />
        </div>
      </div>
    </div>
  );
});
