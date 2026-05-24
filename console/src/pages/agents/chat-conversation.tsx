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
import { TypingIndicator } from '@/components/ai-elements/typing-indicator';
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

const getTextContent = (message: UIMessage): string => {
  const parts = message.parts;
  if (!parts || parts.length === 0) return '';

  return parts
    .filter((part): part is TextUIPart => part.type === 'text')
    .map((part) => part.text)
    .join('');
};

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

// Animated Message Component - safely contains hooks per message instance
function AnimatedMessageContent({
  text,
  isStreaming,
  children,
}: {
  text: string;
  isStreaming: boolean;
  children: (displayText: string) => React.ReactNode;
}) {
  const [displayedText, setDisplayedText] = useState('');
  const targetLengthRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    if (!isStreaming) {
      setDisplayedText(text);
      targetLengthRef.current = text.length;
      return;
    }

    targetLengthRef.current = text.length;

    const animate = (timestamp: number) => {
      // Throttle to ~60fps smooth animation
      if (timestamp - lastUpdateRef.current < 16) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      lastUpdateRef.current = timestamp;

      setDisplayedText((current) => {
        if (current.length >= targetLengthRef.current) {
          return text;
        }

        const remaining = targetLengthRef.current - current.length;
        const charsPerFrame = Math.max(
          1,
          Math.min(remaining, Math.ceil(targetLengthRef.current / 50)),
        );
        const nextLength = Math.min(
          current.length + charsPerFrame,
          targetLengthRef.current,
        );

        return text.slice(0, nextLength);
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [text, isStreaming]);

  // Show full text immediately when stream finishes
  useEffect(() => {
    if (!isStreaming) {
      setDisplayedText(text);
    }
  }, [isStreaming, text]);

  return <>{children(displayedText)}</>;
}

// Memoized individual message component to prevent list re-renders on every parent render
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
  const hasContent =
    textContent.length > 0 ||
    message.parts.some(
      (p) => p.type === 'dynamic-tool' || p.type.startsWith('tool-'),
    );
  const isLastAssistant =
    message.role === 'assistant' && idx === messagesLength - 1;
  const isStreamingActive = isLastAssistant && isStreaming;

  // Consolidate all reasoning parts into one collapsible block
  const parts = message.parts;
  const reasoningParts = parts.filter(
    (part): part is Extract<typeof part, { type: 'reasoning' }> =>
      part.type === 'reasoning',
  );
  const reasoningText = reasoningParts.map((part) => part.text).join('\n\n');
  const hasReasoning = reasoningParts.length > 0;
  const lastPart = parts.at(-1);
  const isReasoningStreaming =
    isStreamingActive && lastPart?.type === 'reasoning';

  // Render parts in order - interleaving text and tool calls as they occur
  const renderedParts: React.ReactNode[] = [];
  let textBuffer = '';
  let textSegmentIndex = 0;

  const flushText = () => {
    if (textBuffer) {
      const currentText = textBuffer;
      const segmentKey = `text-${textSegmentIndex++}`;
      renderedParts.push(
        <AnimatedMessageContent
          key={segmentKey}
          text={currentText}
          isStreaming={isStreamingActive}
        >
          {(displayText) => (
            <Markdown
              content={displayText}
              preview={false}
              className="text-base"
            />
          )}
        </AnimatedMessageContent>,
      );
      textBuffer = '';
    }
  };

  if (parts && parts.length > 0) {
    for (const part of parts) {
      if (part.type === 'reasoning') {
        // Handled separately above as a consolidated block
        continue;
      } else if (part.type === 'text') {
        textBuffer += part.text;
      } else if (part.type === 'dynamic-tool') {
        flushText();
        const dynamicPart = part as {
          toolCallId: string;
          toolName: string;
          state?: string;
          input?: unknown;
          output?: unknown;
        };
        const toolCall: ToolCallState = {
          toolCallId: dynamicPart.toolCallId,
          toolName: dynamicPart.toolName,
          status:
            dynamicPart.state === 'output-available' ? 'completed' : 'pending',
          input: dynamicPart.input as Record<string, unknown>,
          output: dynamicPart.output,
        };
        renderedParts.push(
          <ToolCallDisplay key={toolCall.toolCallId} toolCall={toolCall} />,
        );
      } else if (part.type.startsWith('tool-')) {
        flushText();
        const toolPart = part as {
          toolCallId: string;
          state?: string;
          input?: unknown;
          output?: unknown;
        };
        const toolCall: ToolCallState = {
          toolCallId: toolPart.toolCallId,
          toolName: part.type.replace('tool-', ''),
          status:
            toolPart.state === 'output-available' ? 'completed' : 'pending',
          input: toolPart.input as Record<string, unknown>,
          output: toolPart.output,
        };
        renderedParts.push(
          <ToolCallDisplay key={toolCall.toolCallId} toolCall={toolCall} />,
        );
      }
    }
    flushText();
  }

  // Prepend consolidated reasoning block before other content
  if (hasReasoning) {
    renderedParts.unshift(
      <Reasoning className="w-full" isStreaming={isReasoningStreaming}>
        <ReasoningTrigger />
        <ReasoningContent>{reasoningText}</ReasoningContent>
      </Reasoning>,
    );
  }

  return (
    <Message from={message.role}>
      <MessageContent expandable={message.role === 'user'}>
        {renderedParts.length > 0 ? (
          <div className="space-y-3">{renderedParts}</div>
        ) : null}

        {message.role === 'assistant' && isStreamingActive && !hasContent && (
          <div className="min-h-[26px]" />
        )}
      </MessageContent>

      {message.role === 'assistant' &&
        hasContent &&
        message.id !== 'streaming' && (
          <MessageActions>
            {textContent && <CopyButton text={textContent} />}
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

  // Stable refs for values used inside the IntersectionObserver callback
  const onLoadMoreRef = useRef(onLoadMore);
  const hasMoreRef = useRef(hasMoreMessages);

  // Keep refs in sync with latest prop values
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

  // Use a ref-callback instead of useRef + useEffect so the observer is created
  // exactly when the sentinel element mounts into the DOM.
  // With useEffect([], []), the effect ran at component-mount time when
  // isLoadingHistory=true → the sentinel div was not in the DOM yet →
  // sentinelRef.current was null → the observer was never created.
  // const [isIntersecting, setIsIntersecting] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback((el: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    if (el) {
      let currentScrollContainer = scrollContainerRef.current;

      if (!currentScrollContainer) {
        let parent = el.parentElement;
        while (parent) {
          const style = window.getComputedStyle(parent);
          if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
            currentScrollContainer = parent;
            break;
          }
          parent = parent.parentElement;
        }
        if (!currentScrollContainer) {
          currentScrollContainer = el.parentElement;
        }
        scrollContainerRef.current = currentScrollContainer;
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
          root: currentScrollContainer,
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

  // Track last user message for retry context
  useEffect(() => {
    const userMessages = messages.filter((m) => m.role === 'user');
    if (userMessages.length > 0) {
      const lastUser = userMessages[userMessages.length - 1];
      setLastUserMessage(getTextContent(lastUser));
    }
  }, [messages]);

  // Track streaming state transitions to prevent flicker
  useEffect(() => {
    prevStreamingRef.current = isStreaming;
  }, [isStreaming]);

  const handleRetry = useCallback(() => {
    if (onRetry) {
      onRetry();
    }
  }, [onRetry]);

  // Loading: show when fetching history for existing conversation with no messages yet
  // Empty: show when no messages and not streaming (not during initial load or streaming)
  // Whether there's a user message waiting for an assistant response.
  // Uses pair-counting instead of last-role check to avoid false negatives
  // when `messages` is `savedMessages` (history) during state transitions.
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

  // Loading: show when fetching history for existing conversation with no messages yet
  // Empty: show when no messages and not streaming (not during initial load or streaming)
  const isLoadingHistory = isLoadingMessages && messages.length === 0;
  const isEmpty = !isLoadingMessages && messages.length === 0 && !isStreaming;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Conversation className="flex-1">
        <ConversationContent className="max-w-3xl mx-auto w-full p-1 gap-6">
          {isLoadingHistory ? (
            <div className="space-y-6">
              {/* User message skeleton */}
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl bg-muted px-4 py-3">
                  <div className="space-y-2">
                    <div className="h-4 w-64 animate-pulse rounded bg-muted-foreground/20" />
                    <div className="h-4 w-48 animate-pulse rounded bg-muted-foreground/20" />
                  </div>
                </div>
              </div>

              {/* Assistant message skeleton */}
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

              {/* Second user message skeleton */}
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl bg-muted px-4 py-3">
                  <div className="h-4 w-56 animate-pulse rounded bg-muted-foreground/20" />
                </div>
              </div>

              {/* Second assistant message skeleton */}
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
              {/* Sentinel div for infinite scroll - positioned at top of messages */}
              <div ref={sentinelRef} className="h-px" aria-hidden="true" />

              {/* Loading indicator for older messages */}
              {isLoadingMoreMessages && (
                <div className="flex justify-center py-2">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
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

              {hasUnansweredMessage && <TypingIndicator />}
            </>
          )}

          {/* Stream error banner */}
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

      <div className="shrink-0 bg-background/90 backdrop-blur-sm px-4 pb-4">
        <div className="max-w-3xl mx-auto w-full flex flex-col">
          {todos && todos.length > 0 && (
            <AgentTodoPanel todos={todos} className="rounded-b-none border-b-0 mx-2" />
          )}

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
