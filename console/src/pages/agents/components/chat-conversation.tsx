import AgentPromptInput from '@/components/agent-prompt-input';
import type { AgentTodoItem } from './agent-todo-panel';
import { AgentTodoPanel } from './agent-todo-panel';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { ShieldAlert } from 'lucide-react';
import type { RemoteExecuteStreamEvent } from '@/hooks/use-remote-execute-stream';
import type { UIMessage } from 'ai';
import { motion } from 'framer-motion';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { ChatMessage } from './chat-message';
import { LoadingSkeleton } from './chat-skeletons';
import { StreamError } from './chat-stream-error';
import { ThinkingLabel, TypingDots, getTextContent } from './chat-helpers';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning';

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
  selectedWorkerId?: string | null;
  onWorkerSelect?: (workerId: string | null) => void;
  todos?: AgentTodoItem[];
  showTodoAboveInput?: boolean;
  selectedToolCallId?: string | null;
  remoteExecuteEvents?: Map<string, RemoteExecuteStreamEvent[]>;
}

// ---------------------------------------------------------------------------
// ChatConversation
// ---------------------------------------------------------------------------

export const ChatConversation = ({
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
  selectedWorkerId,
  onWorkerSelect,
  todos,
  showTodoAboveInput = true,
  selectedToolCallId,
  remoteExecuteEvents,
}: ChatConversationProps) => {
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
              onRetry={lastUserMessage && onRetry ? handleRetry : undefined}
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
            selectedWorkerId={selectedWorkerId}
            onWorkerSelect={onWorkerSelect}
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
};
