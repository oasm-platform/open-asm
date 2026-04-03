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
import {
  AlertCircle,
  Bot,
  CheckIcon,
  CopyIcon,
  RefreshCcwIcon,
  ShieldAlert,
  Wrench,
  Loader2,
} from 'lucide-react';
import { useCallback, useState } from 'react';

/** Tool call state for UI rendering */
interface ToolCallState {
  toolCallId: string;
  toolName: string;
  status: 'pending' | 'executing' | 'completed' | 'error';
  input?: Record<string, unknown>;
  output?: unknown;
  argsTextDelta?: string;
}

interface UIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  error?: string;
  errorCode?: string;
  toolCalls?: ToolCallState[];
}

interface ChatConversationProps {
  messages: UIMessage[];
  onSendMessage: (content: string) => void;
  onRetry?: () => void;
  isStreaming?: boolean;
  isLoadingMessages?: boolean;
  selectedProvider?: string | null;
  selectedModel?: string | null;
  onSelectModel?: (
    provider: string,
    model: string,
    configId: string,
  ) => void;
}

/** Check if the last message is a streaming assistant message */
function hasStreamingMessage(messages: UIMessage[]): boolean {
  if (messages.length === 0) return false;
  const last = messages[messages.length - 1];
  return last.id === 'streaming' && last.role === 'assistant';
}

/** Copy button — shows checkmark for 2s after copying */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

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

/** Format tool name for display */
function formatToolName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Display a single tool call with its status and result */
function ToolCallDisplay({ toolCall }: { toolCall: ToolCallState }) {
  const [expanded, setExpanded] = useState(false);

  const statusIcon = {
    pending: <Loader2 className="size-3.5 animate-spin text-muted-foreground" />,
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

/**
 * Chat conversation component.
 * Layout: scrollable message area (flex-1) + sticky input bar at bottom.
 * The outer container must be `overflow-hidden` with a fixed height.
 */
export function ChatConversation({
  messages,
  onSendMessage,
  onRetry,
  isStreaming = false,
  isLoadingMessages = false,
  selectedProvider,
  selectedModel,
  onSelectModel,
}: ChatConversationProps) {
  const [input, setInput] = useState('');

  const handleSubmit = (message: PromptInputMessage) => {
    if (message.text.trim() && !isStreaming) {
      onSendMessage(message.text.trim());
      setInput('');
    }
  };

  const isEmpty = !isLoadingMessages && messages.length === 0;
  const lastAssistantIdx = messages.reduce(
    (acc, m, i) => (m.role === 'assistant' ? i : acc),
    -1,
  );

  return (
    // This div must have a definite height set by the parent (agents.tsx uses calc(100vh - 4rem))
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Scrollable messages ── */}
      <Conversation className="flex-1 min-h-0">
        <ConversationContent className="max-w-3xl mx-auto w-full px-4 py-6 gap-6">
          {isLoadingMessages ? (
            <ConversationEmptyState
              icon={<Bot className="size-12 animate-pulse" />}
              title="Loading messages…"
              description="Fetching your conversation history."
            />
          ) : isEmpty ? (
            <ConversationEmptyState
              icon={<ShieldAlert className="size-12" />}
              title="Security AI ready"
              description="Ask anything about vulnerabilities, secure coding, and best practices."
            />
          ) : (
            messages.map((message, idx) => (
              <Message key={message.id} from={message.role}>
                <MessageContent>
                  {message.error ? (
                    <div className="flex items-start gap-2 rounded-lg px-4 py-3 bg-destructive/10 text-destructive text-sm [&_*]:text-destructive">
                      <AlertCircle className="size-4 shrink-0 mt-0.5" />
                      <div className="flex flex-col gap-0.5">
                        <p className="font-semibold">Error</p>
                        <p className="break-words">{message.error}</p>
                        {message.errorCode && (
                          <p className="text-xs text-destructive/70">
                            Code: {message.errorCode}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {message.toolCalls && message.toolCalls.length > 0 && (
                        <div className="space-y-2">
                          {message.toolCalls.map((toolCall) => (
                            <ToolCallDisplay
                              key={toolCall.toolCallId}
                              toolCall={toolCall}
                            />
                          ))}
                        </div>
                      )}
                      {message.content && (
                        <Markdown content={message.content} preview={false} />
                      )}
                    </div>
                  )}
                </MessageContent>

                {message.role === 'assistant' &&
                  (message.content || (message.toolCalls && message.toolCalls.length > 0)) &&
                  message.id !== 'streaming' && (
                    <MessageActions>
                      {!message.error && message.content && <CopyButton text={message.content} />}
                      {idx === lastAssistantIdx && onRetry && !isStreaming && (
                        <MessageAction
                          onClick={onRetry}
                          label="Try again"
                          tooltip="Try again"
                        >
                          <RefreshCcwIcon className="size-3.5" />
                        </MessageAction>
                      )}
                    </MessageActions>
                  )}
              </Message>
            ))
          )}

          {/* Typing indicator */}
          {isStreaming && !hasStreamingMessage(messages) && (
            <Message from="assistant">
              <MessageContent>
                <div className="flex items-center gap-1 py-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" />
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.15s]" />
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.3s]" />
                </div>
              </MessageContent>
            </Message>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* ── Sticky input bar ── */}
      <div className="shrink-0 bg-background/90 backdrop-blur-sm px-4 pt-3 pb-4">
        <div className="max-w-3xl mx-auto w-full flex flex-col gap-2">
          <PromptInput onSubmit={handleSubmit} className="w-full shadow-sm">
            <PromptInputBody>
              {/* Grows from min 52px up to 33vh before scrolling */}
              <PromptInputTextarea
                value={input}
                onChange={(e) => setInput(e.currentTarget.value)}
                placeholder="Ask anything about security…"
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
