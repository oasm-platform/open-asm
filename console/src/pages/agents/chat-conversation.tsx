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
import type { TextUIPart, UIMessage } from 'ai';
import {
  AlertCircle,
  Bot,
  CheckIcon,
  CopyIcon,
  Loader2,
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

interface ChatConversationProps {
  messages: UIMessage[];
  onSendMessage: (content: string, options?: { agentMode?: string }) => void;
  onRetry?: () => void;
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
}

interface ToolPart {
  toolCallId: string;
  toolName?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
}

const getTextContent = (message: UIMessage): string => {
  const parts = message.parts;
  if (!parts || parts.length === 0) return '';

  return parts
    .filter((part): part is TextUIPart => part.type === 'text')
    .map((part) => part.text)
    .join('');
};

function isToolPart(part: unknown): part is ToolPart {
  return !!part && typeof part === 'object' && 'toolCallId' in part;
}

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

const ChatMessage = memo(function ChatMessage({
  message,
  idx,
  messagesLength,
  isStreaming,
}: {
  message: UIMessage;
  idx: number;
  messagesLength: number;
  isStreaming: boolean;
}) {
  const textContent = getTextContent(message);
  const hasContent = textContent.length > 0;
  const isLastAssistant =
    message.role === 'assistant' && idx === messagesLength - 1;
  const isStreamingActive = isLastAssistant && isStreaming;

  const parts = message.parts || [];

  const reasoningParts = parts.filter(
    (part): part is Extract<typeof part, { type: 'reasoning' }> =>
      part.type === 'reasoning',
  );
  const reasoningText = reasoningParts.map((p) => p.text).join('\n\n');
  const hasReasoning = reasoningParts.length > 0;
  const lastPart = parts.at(-1);
  const isReasoningStreaming =
    isStreamingActive && lastPart?.type === 'reasoning';

  const completedToolParts = parts.filter(
    (p): p is typeof p & ToolPart =>
      (p.type === 'dynamic-tool' || p.type.startsWith('tool-')) &&
      isToolPart(p) &&
      (p as ToolPart).state === 'output-available',
  );
  const lastRawTool = completedToolParts.at(-1) as
    | ((typeof parts)[0] & ToolPart)
    | undefined;

  let hasTextAfterLastTool = false;
  if (lastRawTool) {
    let seenLastTool = false;
    for (const p of parts) {
      if (
        isToolPart(p) &&
        (p as ToolPart).toolCallId === lastRawTool.toolCallId
      ) {
        seenLastTool = true;
      } else if (
        seenLastTool &&
        p.type === 'text' &&
        (p as TextUIPart).text.trim().length > 0
      ) {
        hasTextAfterLastTool = true;
        break;
      }
    }
  }

  const showToolCall = !!lastRawTool && !hasTextAfterLastTool;

  const toolCallState: ToolCallState | null = lastRawTool
    ? {
        toolCallId: lastRawTool.toolCallId,
        toolName:
          lastRawTool.type === 'dynamic-tool'
            ? lastRawTool.toolName || 'dynamic-tool'
            : lastRawTool.type.replace('tool-', ''),
        status: 'completed',
        input: lastRawTool.input as Record<string, unknown>,
        output: lastRawTool.output,
      }
    : null;

  const showInitialThinking =
    isStreamingActive && !hasContent && !hasReasoning && !showToolCall;

  const getThinkingMessage = (s: boolean, d?: number) => {
    if (s || d === 0) {
      return (
        <span className="inline-flex items-center gap-1 min-w-0">
          <Shimmer duration={1}>Thinking</Shimmer>
        </span>
      );
    }
    if (d === undefined) return <p>Thought for a few seconds</p>;
    return <p>Thought for {d} seconds</p>;
  };

  return (
    <Message from={message.role}>
      <MessageContent expandable={message.role === 'user'}>
        <div className="flex flex-col w-full gap-3">
          {(hasReasoning || showInitialThinking) && (
            <Reasoning
              className="w-full [&_.italic]:hidden [&_em]:hidden [&_i]:hidden"
              isStreaming={showInitialThinking || isReasoningStreaming}
            >
              <ReasoningTrigger getThinkingMessage={getThinkingMessage} />
              <ReasoningContent>{reasoningText}</ReasoningContent>
            </Reasoning>
          )}

          <AnimatePresence mode="popLayout">
            {showToolCall && toolCallState && (
              <ToolCallDisplay
                key={toolCallState.toolCallId}
                toolCall={toolCallState}
              />
            )}
          </AnimatePresence>

          {hasContent && (
            <div className="relative space-y-3 w-full">
              <Markdown
                content={textContent}
                preview={false}
                className="text-base"
              />
              <AnimatePresence>
                {isStreamingActive && (
                  <motion.div
                    key="stream-gradient"
                    initial={{ opacity: 1 }}
                    exit={{
                      opacity: 0,
                      transition: { duration: 0.6, ease: 'easeOut' },
                    }}
                    className="pointer-events-none absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background to-transparent"
                  />
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </MessageContent>

      {/* Copy button — only appears after streaming finishes */}
      {message.role === 'assistant' &&
        hasContent &&
        !isStreamingActive &&
        message.id !== 'streaming' && (
          <MessageActions>
            <CopyButton text={textContent} />
          </MessageActions>
        )}
    </Message>
  );
});

export const ChatConversation = memo(function ChatConversation({
  messages,
  onSendMessage,
  onRetry,
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
}: ChatConversationProps) {
  const [lastUserMessage, setLastUserMessage] = useState<string | null>(null);
  const prevStreamingRef = useRef(false);
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

  useEffect(() => {
    prevStreamingRef.current = isStreaming;
  }, [isStreaming]);

  const handleRetry = useCallback(() => {
    if (onRetry) {
      onRetry();
    }
  }, [onRetry]);

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

  const getSimpleThinkingMessage = useCallback((s: boolean, d?: number) => {
    if (s || d === 0) {
      return (
        <span className="inline-flex items-center gap-1 min-w-0">
          <Shimmer duration={1}>Thinking</Shimmer>
        </span>
      );
    }
    if (d === undefined) return <p>Thought for a few seconds</p>;
    return <p>Thought for {d} seconds</p>;
  }, []);

  const isLoadingHistory = isLoadingMessages && messages.length === 0;
  const isEmpty = !isLoadingMessages && messages.length === 0 && !isStreaming;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Conversation className="flex-1">
        <ConversationContent className="max-w-3xl mx-auto w-full p-1 gap-6">
          {isLoadingHistory ? (
            <div className="space-y-6">
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl bg-muted px-4 py-3">
                  <div className="space-y-2">
                    <div className="h-4 w-64 animate-pulse rounded bg-muted-foreground/20" />
                    <div className="h-4 w-48 animate-pulse rounded bg-muted-foreground/20" />
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  <Bot className="size-4 text-muted-foreground" />
                </div>
                <div className="flex-1 space-y-3">
                  <div className="h-4 w-full animate-pulse rounded bg-muted-foreground/20" />
                  <div className="h-4 w-[90%] animate-pulse rounded bg-muted-foreground/20" />
                  <div className="h-4 w-[75%] animate-pulse rounded bg-muted-foreground/20" />
                  <div className="mt-2 h-4 w-[60%] animate-pulse rounded bg-muted-foreground/20" />
                </div>
              </div>

              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl bg-muted px-4 py-3">
                  <div className="h-4 w-56 animate-pulse rounded bg-muted-foreground/20" />
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  <Bot className="size-4 text-muted-foreground" />
                </div>
                <div className="flex-1 space-y-3">
                  <div className="h-4 w-[85%] animate-pulse rounded bg-muted-foreground/20" />
                  <div className="h-4 w-full animate-pulse rounded bg-muted-foreground/20" />
                  <div className="h-4 w-[70%] animate-pulse rounded bg-muted-foreground/20" />
                </div>
              </div>
            </div>
          ) : isEmpty ? (
            <ConversationEmptyState
              icon={<ShieldAlert className="size-12" />}
              title="Security AI ready"
              description="Ask anything about vulnerabilities, secure coding, and best practices."
            />
          ) : (
            <>
              <div ref={sentinelRef} className="h-px" aria-hidden="true" />

              {isLoadingMoreMessages && (
                <div className="flex justify-center py-2">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              )}

              {todos && todos.length > 0 && (
                <div className="max-w-3xl w-full mx-auto">
                  <AgentTodoPanel todos={todos} />
                </div>
              )}

              {messages.map((message, idx) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  idx={idx}
                  messagesLength={messages.length}
                  isStreaming={isStreaming}
                />
              ))}

              {hasUnansweredMessage && (
                <Reasoning
                  isStreaming
                  className="w-full [&_.italic]:hidden [&_em]:hidden [&_i]:hidden"
                >
                  <ReasoningTrigger
                    getThinkingMessage={getSimpleThinkingMessage}
                  />
                  <ReasoningContent>{''}</ReasoningContent>
                </Reasoning>
              )}
            </>
          )}

          {streamError && (
            <div className="mx-auto max-w-3xl w-full px-4">
              <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
                <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-destructive">
                    Streaming error
                  </p>
                  <p className="text-muted-foreground mt-1">{streamError}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {lastUserMessage && (
                    <button
                      type="button"
                      onClick={handleRetry}
                      className="flex items-center gap-1.5 rounded-md bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
                    >
                      <RefreshCcwIcon className="size-3.5" />
                      Retry
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onDismissError}
                    className="rounded-md p-1 hover:bg-accent transition-colors"
                    aria-label="Dismiss error"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="shrink-0 bg-background/90 backdrop-blur-sm px-4 pt-3 pb-4">
        <div className="max-w-3xl mx-auto w-full flex flex-col gap-2">
          <AgentPromptInput
            onSubmit={(content, options) =>
              onSendMessage(content, { agentMode: options?.agentMode })
            }
            isSending={isStreaming}
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
