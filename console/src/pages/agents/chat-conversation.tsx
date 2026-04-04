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
import type { UIMessage, TextUIPart } from 'ai';
import {
  AlertCircle,
  Bot,
  CheckIcon,
  CopyIcon,
  RefreshCcwIcon,
  ShieldAlert,
  Wrench,
  Loader2,
  X,
} from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';

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
    <div className="rounded-md border border-border/60 bg-muted/30 text-sm">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
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
  hasSentFirstMessage = false,
}: ChatConversationProps) {
  const [input, setInput] = useState('');
  const [lastUserMessage, setLastUserMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevStreamingRef = useRef(false);

  // Track last user message for retry context
  useEffect(() => {
    const userMessages = messages.filter((m) => m.role === 'user');
    if (userMessages.length > 0) {
      const lastUser = userMessages[userMessages.length - 1];
      setLastUserMessage(getTextContent(lastUser));
    }
  }, [messages]);

  // Auto-scroll to bottom when messages change
  // useEffect(() => {
  //   if (messages.length > 0 || isStreaming) {
  //     messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  //   }
  // }, [messages.length, isStreaming]);

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

  // Loading: show when fetching history
  // Empty: show when no messages and not streaming (not during initial load or streaming)
  const isEmpty = !isLoadingMessages && messages.length === 0 && !isStreaming;
  const lastAssistantIdx = messages.reduce(
    (acc, m, i) => (m.role === 'assistant' ? i : acc),
    -1,
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Conversation className="flex-1">
        <ConversationContent className="max-w-3xl mx-auto w-full px-4 py-6 gap-6">
          {isLoadingMessages ? (
            <div className="flex flex-col items-center justify-center h-full">
              <Bot className="size-10 text-muted-foreground animate-pulse mb-3" />
              <p className="text-sm text-muted-foreground">Loading messages…</p>
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

                return (
                  <Message key={message.id} from={message.role}>
                    <MessageContent expandable={message.role === 'user'}>
                      <div className="space-y-3">
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
                          <Markdown content={textContent} preview={false} />
                        )}
                      </div>
                    </MessageContent>

                    {message.role === 'assistant' &&
                      hasContent &&
                      message.id !== 'streaming' && (
                        <MessageActions>
                          {textContent && <CopyButton text={textContent} />}
                          {idx === lastAssistantIdx &&
                            onRetry &&
                            !isStreaming && (
                              <MessageAction
                                onClick={handleRetry}
                                label="Try again"
                                tooltip="Try again"
                              >
                                <RefreshCcwIcon className="size-3.5" />
                              </MessageAction>
                            )}
                        </MessageActions>
                      )}
                  </Message>
                );
              })}

              {/* Show typing indicator when streaming and waiting for assistant response */}
              {isStreaming &&
                messages[messages.length - 1]?.role === 'user' && (
                  <Message from="assistant" data-testid="assistant-typing">
                    <MessageContent>
                      <div className="flex items-center gap-1 py-1">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" />
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.15s]" />
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.3s]" />
                      </div>
                    </MessageContent>
                  </Message>
                )}
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

          {/* <div ref={messagesEndRef} /> */}
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
