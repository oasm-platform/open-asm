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
import { Skeleton } from '@/components/ui/skeleton';
import type { RemoteExecuteStreamEvent } from '@/hooks/use-remote-execute-stream';
import type { TextUIPart, UIMessage } from 'ai';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  CheckIcon,
  CopyIcon,
  RefreshCcwIcon,
  ShieldAlert,
  X,
} from 'lucide-react';
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
  isRetrying?: boolean;
  retryAttempt?: number;
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
  showTodoAboveInput?: boolean;
  selectedToolCallId?: string | null;
  remoteExecuteEvents?: Map<string, RemoteExecuteStreamEvent[]>;
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
  const partsText = (message.parts || [])
    .filter((part): part is TextUIPart => part.type === 'text')
    .map((part) => part.text)
    .join('');
  return partsText || '';
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
  if (duration === undefined) return <span>Thought for a few seconds</span>;
  return <span>Thought for {duration} seconds</span>;
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
  const lastPart = parts.at(-1);

  // Show "Thinking" shimmer when streaming starts but no parts yet
  const showInitialThinking = isStreamingActive && parts.length === 0;

  // Reasoning is actively streaming if the last part is a reasoning part
  const isReasoningStreaming =
    isStreamingActive && lastPart?.type === 'reasoning';

  // Show "Generating" when streaming but no text content yet
  const showGenerating =
    isStreamingActive &&
    !hasContent &&
    !showInitialThinking &&
    !isReasoningStreaming;

  // Build interleaved render list: group consecutive reasoning parts together,
  // but keep tool calls and text parts in their actual positions.
  type RenderItem =
    | { kind: 'reasoning'; text: string; isStreaming: boolean }
    | {
        kind: 'tool';
        toolCallId: string;
        toolName: string;
        state: string;
        input?: unknown;
        output?: unknown;
      }
    | { kind: 'text'; text: string }
    | { kind: 'generating' }
    | { kind: 'initial-thinking' };

  const renderItems: RenderItem[] = [];

  // Group consecutive reasoning parts into a single reasoning block
  let pendingReasoning = '';
  const flushReasoning = (streaming: boolean) => {
    if (pendingReasoning.trim()) {
      renderItems.push({
        kind: 'reasoning',
        text: pendingReasoning,
        isStreaming: streaming,
      });
      pendingReasoning = '';
    }
  };

  for (const part of parts) {
    if (part.type === 'reasoning' && 'text' in part) {
      pendingReasoning +=
        (pendingReasoning ? '\n\n' : '') + (part as { text: string }).text;
    } else {
      // Flush any accumulated reasoning before non-reasoning part
      flushReasoning(false);

      if (part.type === 'text' && 'text' in part) {
        const text = (part as { text: string }).text;
        if (text.trim()) {
          renderItems.push({ kind: 'text', text });
        }
      } else if (
        part.type === 'dynamic-tool' ||
        part.type.startsWith('tool-')
      ) {
        const tp = part as {
          toolCallId: string;
          toolName?: string;
          state?: string;
          input?: unknown;
          output?: unknown;
        };
        // ToolUIPart encodes toolName in the type field ('tool-{name}'),
        // while DynamicToolUIPart has it as a direct field.
        const effectiveToolName =
          part.type === 'dynamic-tool'
            ? tp.toolName || 'dynamic-tool'
            : part.type.replace(/^tool-/, '');
        renderItems.push({
          kind: 'tool',
          toolCallId: tp.toolCallId,
          toolName: effectiveToolName,
          state: getToolStatus(tp.state),
          input: tp.input,
          output: tp.output,
        });
      }
    }
  }
  // Flush any trailing reasoning
  const lastReasoningPart = [...parts]
    .reverse()
    .find((p) => p.type === 'reasoning');
  const isTrailingReasoning =
    isReasoningStreaming && lastReasoningPart && pendingReasoning.trim();
  flushReasoning(!!isTrailingReasoning);

  // Append streaming indicators
  if (showInitialThinking) {
    renderItems.push({ kind: 'initial-thinking' });
  } else if (showGenerating) {
    renderItems.push({ kind: 'generating' });
  }

  return (
    <Message from={message.role}>
      <MessageContent expandable={message.role === 'user'}>
        <div className="flex flex-col w-full gap-1.5">
          {renderItems.map((item, i) => {
            switch (item.kind) {
              case 'reasoning':
                return (
                  <Reasoning
                    key={`reasoning-${i}`}
                    className="w-full [&_.italic]:hidden [&_em]:hidden [&_i]:hidden"
                    isStreaming={item.isStreaming}
                  >
                    <ReasoningTrigger
                      getThinkingMessage={(s, d) => (
                        <ThinkingLabel isStreaming={s} duration={d} />
                      )}
                    />
                    <ReasoningContent>{item.text}</ReasoningContent>
                  </Reasoning>
                );
              case 'tool':
                return (
                  <div
                    key={item.toolCallId}
                    id={`tool-call-${item.toolCallId}`}
                  >
                    <ToolCallDisplay
                      toolCall={{
                        toolCallId: item.toolCallId,
                        toolName: item.toolName,
                        status: item.state as
                          | 'pending'
                          | 'executing'
                          | 'completed'
                          | 'error',
                        input: item.input as Record<string, unknown> | undefined,
                        output: item.output,
                      }}
                      streamEvents={remoteExecuteEvents?.get(item.toolCallId)}
                    />
                  </div>
                );
              case 'text':
                return (
                  <div key={`text-${i}`} className="w-full">
                    <Markdown
                      content={item.text}
                      preview={false}
                      className="text-base"
                    />
                  </div>
                );
              case 'generating':
                return (
                  <motion.div
                    key="generating"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-2 text-muted-foreground text-sm select-none"
                  >
                    <TypingDots />
                  </motion.div>
                );
              case 'initial-thinking':
                return (
                  <Reasoning
                    key="initial-thinking"
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
                );
            }
          })}

          {/* Streaming indicator — inline dots while generating text */}
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
  isRetrying,
  retryAttempt,
}: {
  error: string;
  onRetry?: () => void;
  onDismiss: () => void;
  isRetrying?: boolean;
  retryAttempt?: number;
}) {
  if (isRetrying) {
    return (
      <motion.div
        className="mx-auto max-w-3xl w-full px-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm">
          <RefreshCcwIcon className="size-5 text-amber-500 shrink-0 animate-spin" />
          <div className="flex-1">
            <p className="font-medium text-amber-600 dark:text-amber-500">
              Retrying… (attempt {retryAttempt ?? 1} of 3)
            </p>
            <p className="text-muted-foreground mt-1">
              A transient error occurred. Reconnecting automatically.
            </p>
          </div>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-md p-1 hover:bg-accent transition-colors"
              aria-label="Cancel retry"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </motion.div>
    );
  }

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
  isRetrying = false,
  retryAttempt = 0,
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
  showTodoAboveInput = true,
  selectedToolCallId,
  remoteExecuteEvents,
}: ChatConversationProps) {
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

  // Scroll to tool call in conversation when selected from sidebar
  useEffect(() => {
    if (!selectedToolCallId) return;
    const el = document.getElementById(`tool-call-${selectedToolCallId}`);
    if (!el) return;

    let scrollContainer: HTMLElement | null = el.parentElement;
    while (scrollContainer) {
      const style = getComputedStyle(scrollContainer);
      if (style.overflowY === 'auto' || style.overflowY === 'scroll') break;
      scrollContainer = scrollContainer.parentElement;
    }

    if (scrollContainer) {
      const containerRect = scrollContainer.getBoundingClientRect();
      const elementRect = el.getBoundingClientRect();
      const relativeTop =
        elementRect.top - containerRect.top + scrollContainer.scrollTop;
      const targetScrollTop =
        relativeTop -
        scrollContainer.clientHeight / 2 +
        el.offsetHeight / 2;

      scrollContainer.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth',
      });
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedToolCallId]);

  const lastUserMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        return getTextContent(messages[i]);
      }
    }
    return null;
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

          {(streamError || isRetrying) && (
            <StreamError
              error={streamError ?? ''}
              isRetrying={isRetrying}
              retryAttempt={retryAttempt}
              onRetry={lastUserMessage ? handleRetry : () => {}}
              onDismiss={onDismissError ?? (() => {})}
            />
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="shrink-0 bg-background/90 backdrop-blur-sm px-4 pb-4">
        <div className="max-w-3xl mx-auto w-full flex flex-col">
          {showTodoAboveInput && todos && todos.length > 0 && (
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
