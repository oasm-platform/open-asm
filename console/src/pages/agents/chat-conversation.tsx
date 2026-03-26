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
  MessageResponse,
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
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion';
import {
  AlertCircle,
  Bot,
  CheckIcon,
  CopyIcon,
  RefreshCcwIcon,
  ShieldAlert,
} from 'lucide-react';
import { useCallback, useState } from 'react';

interface UIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  error?: string;
  errorCode?: string;
}

interface ChatConversationProps {
  messages: UIMessage[];
  onSendMessage: (content: string) => void;
  onRetry?: () => void;
  isStreaming?: boolean;
  isLoadingMessages?: boolean;
}

const QUICK_SUGGESTIONS = [
  'Find SQL injection vulnerabilities',
  'Review my API authentication',
  'Explain XSS attacks',
  'How to implement rate limiting?',
  'Check for CORS misconfiguration',
  'OWASP Top 10 overview',
];

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
}: ChatConversationProps) {
  const [input, setInput] = useState('');

  const handleSubmit = (message: PromptInputMessage) => {
    if (message.text.trim() && !isStreaming) {
      onSendMessage(message.text.trim());
      setInput('');
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    if (!isStreaming) {
      onSendMessage(suggestion);
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
      <Conversation className="flex-1 overflow-y-auto min-h-0">
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
                    <div className="flex items-start gap-2 rounded-lg px-4 py-3 bg-destructive/10 text-destructive text-sm">
                      <AlertCircle className="size-4 shrink-0 mt-0.5" />
                      <div className="flex flex-col gap-0.5">
                        <p className="font-semibold">Error</p>
                        <p>{message.error}</p>
                        {message.errorCode && (
                          <p className="text-xs text-muted-foreground">
                            Code: {message.errorCode}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <MessageResponse className="text-[15px] leading-relaxed">{message.content}</MessageResponse>
                  )}
                </MessageContent>

                {message.role === 'assistant' &&
                  message.content &&
                  message.id !== 'streaming' && (
                    <MessageActions>
                      {!message.error && <CopyButton text={message.content} />}
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
      <div className="shrink-0 border-t bg-background/90 backdrop-blur-sm px-4 pt-3 pb-4">
        <div className="max-w-3xl mx-auto w-full flex flex-col gap-2">
          {/* Horizontal suggestions — always scrollable */}
          <Suggestions className="pb-1">
            {QUICK_SUGGESTIONS.map((suggestion) => (
              <Suggestion
                key={suggestion}
                onClick={handleSuggestionClick}
                suggestion={suggestion}
                disabled={isStreaming}
              />
            ))}
          </Suggestions>

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
              <PromptInputTools />
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
