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
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input';
import { Markdown } from '@/components/common/markdown';
import { ChatModelSwitcher } from '@/components/ui/chat-model-switcher';
import type { TextUIPart, UIMessage } from 'ai';
import {
  AlertCircle,
  Bot,
  CheckIcon,
  CopyIcon,
  Loader2,
  RefreshCcwIcon,
  ShieldAlert,
  Wrench,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface ToolCallState {
  toolCallId: string;
  toolName: string;
  status: 'pending' | 'executing' | 'completed' | 'error';
  input?: Record<string, unknown>;
  output?: unknown;
}

interface ChatConversationProps {
  messages: UIMessage[];
  onSendMessage: (content: string) => void;
  onRetry?: () => void;
  isStreaming?: boolean;
  isLoadingMessages?: boolean;
  streamError?: string | null;
  onDismissError?: () => void;
  selectedProvider?: string | null;
  selectedModel?: string | null;
  onSelectModel?: (provider: string, model: string, configId: string) => void;
  hasSentFirstMessage?: boolean;
}

const getTextContent = (message: UIMessage): string => {
  const parts = message.parts;
  if (!parts || parts.length === 0) return '';

  return parts
    .filter((part): part is TextUIPart => part.type === 'text')
    .map((part) => part.text)
    .join('');
};

const getToolCallsFromParts = (message: UIMessage): ToolCallState[] => {
  const parts = message.parts;
  if (!parts || parts.length === 0) return [];

  const toolCalls: ToolCallState[] = [];

  for (const part of parts) {
    if (part.type === 'dynamic-tool') {
      toolCalls.push({
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        status:
          part.state === 'output-available'
            ? ('completed' as const)
            : ('pending' as const),
        input: part.input as Record<string, unknown>,
        output: part.output as unknown,
      });
    } else if (part.type.startsWith('tool-')) {
      const toolPart = part as {
        toolCallId: string;
        state?: string;
        input?: unknown;
        output?: unknown;
      };
      toolCalls.push({
        toolCallId: toolPart.toolCallId,
        toolName: part.type.replace('tool-', ''),
        status:
          toolPart.state === 'output-available'
            ? ('completed' as const)
            : ('pending' as const),
        input: toolPart.input as Record<string, unknown>,
        output: toolPart.output,
      });
    }
  }

  return toolCalls;
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

function formatToolName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function ToolCallDisplay({ toolCall }: { toolCall: ToolCallState }) {
  const [expanded, setExpanded] = useState(false);

  const statusIcon = {
    pending: (
      <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
    ),
    executing: <Loader2 className="size-3.5 animate-spin text-blue-500" />,
    completed: <CheckIcon className="size-3.5 text-green-500" />,
    error: <AlertCircle className="size-3.5 text-destructive" />,
  }[toolCall.status];

  const statusText = {
    pending: 'Waiting…',
    executing: 'Executing…',
    completed: 'Completed',
    error: 'Failed',
  }[toolCall.status];

  return (
    <div className="rounded-md border border-border/60 bg-muted/30 text-sm w-fit min-w-[320px] max-w-full">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/50 transition-colors w-full"
      >
        <Wrench className="size-3.5 text-muted-foreground shrink-0" />
        <span className="font-medium truncate">
          {formatToolName(toolCall.toolName)}
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
          {statusIcon}
          {statusText}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border/60 px-3 py-2 space-y-2">
          {toolCall.input && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Input
              </p>
              <pre className="text-xs bg-background/50 rounded p-2 overflow-x-auto">
                {JSON.stringify(toolCall.input, null, 2)}
              </pre>
            </div>
          )}
          {toolCall.output !== undefined && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Output
              </p>
              <pre className="text-xs bg-background/50 rounded p-2 overflow-x-auto max-h-48">
                {typeof toolCall.output === 'string'
                  ? toolCall.output
                  : JSON.stringify(toolCall.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
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

export function ChatConversation({
  messages,
  onSendMessage,
  onRetry,
  isStreaming = false,
  isLoadingMessages = false,
  streamError,
  onDismissError,
  selectedProvider,
  selectedModel,
  onSelectModel,
}: ChatConversationProps) {
  const [input, setInput] = useState('');
  const [lastUserMessage, setLastUserMessage] = useState<string | null>(null);
  const prevStreamingRef = useRef(false);

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

  const handleSubmit = (message: PromptInputMessage) => {
    if (message.text.trim() && !isStreaming) {
      onSendMessage(message.text.trim());
      setInput('');
    }
  };

  const handleRetry = useCallback(() => {
    if (onRetry) {
      onRetry();
    }
  }, [onRetry]);

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
              {messages.map((message, idx) => {
                const textContent = getTextContent(message);
                const toolCalls = getToolCallsFromParts(message);
                const hasContent =
                  textContent.length > 0 || toolCalls.length > 0;
                const isLastAssistant =
                  message.role === 'assistant' && idx === messages.length - 1;
                const isStreamingActive = isLastAssistant && isStreaming;

                return (
                  <Message key={message.id} from={message.role}>
                    <MessageContent expandable={message.role === 'user'}>
                      <div
                        className={message.role === 'user' ? '' : 'space-y-3'}
                      >
                        {toolCalls.length > 0 && (
                          <div className="space-y-2">
                            {toolCalls.map((toolCall) => (
                              <ToolCallDisplay
                                key={toolCall.toolCallId}
                                toolCall={toolCall}
                              />
                            ))}
                          </div>
                        )}
                        {textContent && (
                          <AnimatedMessageContent
                            text={textContent}
                            isStreaming={isStreamingActive}
                          >
                            {(displayText) => (
                              <Markdown content={displayText} preview={false} />
                            )}
                          </AnimatedMessageContent>
                        )}

                        {message.role === 'assistant' && (
                          <div className="min-h-[26px]">
                            {isStreamingActive && (
                              <div
                                className={`flex items-center gap-2 ${hasContent ? 'mt-2' : 'py-1'}`}
                              >
                                <Loader2
                                  className={`${hasContent ? 'size-4' : 'size-5'} animate-spin text-muted-foreground`}
                                />
                                <span
                                  className={`${hasContent ? 'text-sm' : 'text-base'} font-medium text-muted-foreground`}
                                >
                                  Thinking…
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
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
              })}
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

      <div className="shrink-0 bg-background/90 backdrop-blur-sm px-4 pt-3 pb-4">
        <div className="max-w-3xl mx-auto w-full flex flex-col gap-2">
          <PromptInput onSubmit={handleSubmit} className="w-full shadow-sm">
            <PromptInputBody>
              <PromptInputTextarea
                value={input}
                onChange={(e) => setInput(e.currentTarget.value)}
                placeholder={
                  isStreaming
                    ? 'Waiting for response…'
                    : 'Ask anything about security…'
                }
                disabled={isStreaming}
                className="min-h-[52px] max-h-[33vh]"
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                {onSelectModel && (
                  <ChatModelSwitcher
                    selectedProvider={selectedProvider ?? null}
                    selectedModel={selectedModel ?? null}
                    onSelectModel={onSelectModel}
                  />
                )}
              </PromptInputTools>
              <PromptInputSubmit
                status={isStreaming ? 'streaming' : 'ready'}
                disabled={!input.trim() || isStreaming}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}
