import { Markdown } from '@/components/common/markdown';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AlertCircle, Bot, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

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
  isStreaming?: boolean;
  isLoadingMessages?: boolean;
}

/**
 * Chat conversation component with message display and input
 * Supports streaming responses and auto-scroll to latest message
 */
export function ChatConversation({
  messages,
  onSendMessage,
  isStreaming = false,
  isLoadingMessages = false,
}: ChatConversationProps) {
  const [input, setInput] = useState('');
  const [isMultiLine, setIsMultiLine] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive or streaming updates
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  // Auto-resize textarea height and detect multi-line
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
    setIsMultiLine(textarea.scrollHeight > 48);
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) {
      return;
    }
    onSendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6.5rem)]">
      <div
        ref={scrollRef}
        className="flex-1 flex flex-col overflow-y-auto scrollbar-thin"
      >
        <div className="w-full mx-auto flex flex-col flex-1 space-y-6">
          {isLoadingMessages && (
            <div className="flex flex-col items-center justify-center flex-1 py-20 text-center">
              <Bot className="h-12 w-12 text-muted-foreground mb-4 animate-pulse" />
              <p className="text-base text-muted-foreground">
                Loading messages...
              </p>
            </div>
          )}
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'flex gap-3',
                message.role === 'user' ? 'justify-end' : 'justify-start',
              )}
            >
              {message.role === 'assistant' ? (
                <div className="max-w-[80%] text-base">
                  {message.error ? (
                    <div className="flex items-start gap-2 rounded-2xl px-4 py-3 bg-destructive/10 text-destructive">
                      <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                      <div className="flex flex-col gap-1">
                        <p className="font-medium">Error</p>
                        <p className="text-sm">{message.error}</p>
                        {message.errorCode && (
                          <p className="text-xs text-muted-foreground">
                            Code: {message.errorCode}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <Markdown content={message.content} />
                  )}
                </div>
              ) : (
                <div className="max-w-[80%] rounded-2xl px-4 py-2.5 text-base bg-muted text-foreground">
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
              )}
            </div>
          ))}
          {isStreaming && !hasStreamingMessage(messages) && (
            <div className="flex gap-3 justify-start">
              <div className="flex items-center gap-1.5 rounded-2xl px-4 py-2.5 bg-muted">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" />
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.15s]" />
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.3s]" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="shrink-0 py-3">
        <form onSubmit={handleSubmit} className="w-full mx-auto">
          <div
            className={cn(
              'bg-muted flex items-center',
              isMultiLine ? 'rounded-2xl' : 'rounded-full',
            )}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              rows={1}
              disabled={isStreaming}
              className="flex-1 resize-none bg-transparent px-5 py-4 text-base placeholder:text-muted-foreground outline-none min-h-[48px] max-h-[33vh] disabled:opacity-50 overflow-y-auto"
            />
            {input.trim() && (
              <Button
                type="submit"
                size="icon"
                variant="ghost"
                disabled={isStreaming}
                className="shrink-0 mr-2"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

/** Check if the last message is a streaming assistant message */
function hasStreamingMessage(messages: UIMessage[]): boolean {
  if (messages.length === 0) return false;
  const last = messages[messages.length - 1];
  return last.id === 'streaming' && last.role === 'assistant';
}
