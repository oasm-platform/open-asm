import { useRef, useEffect, useCallback, memo } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Sparkles } from 'lucide-react';
import type { ChatInputProps } from '../types/types';

export const ChatInput = memo(function ChatInput({
  inputMessage,
  setInputMessage,
  onSendMessage,
  isSending,
}: Omit<ChatInputProps, 'onKeyPress'>) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      textarea.style.height = `${Math.min(scrollHeight, 200)}px`;
    }
  }, [inputMessage]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (inputMessage.trim() && !isSending) {
        onSendMessage();
      }
    },
    [inputMessage, isSending, onSendMessage],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInputMessage(e.target.value);
    },
    [setInputMessage],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (inputMessage.trim() && !isSending) {
          onSendMessage();
        }
      }
    },
    [inputMessage, isSending, onSendMessage],
  );

  const isDisabled = isSending || inputMessage.trim() === '';

  return (
    <form onSubmit={handleSubmit} className="relative group">
      <div className="relative flex items-end gap-2 bg-background p-1.5 rounded-3xl border border-input shadow-sm focus-within:border-ring focus-within:shadow-md transition-all duration-200">
        <div className="pl-3 pb-3 text-zinc-500 shrink-0">
          <Sparkles className="w-5 h-5" />
        </div>

        <Textarea
          ref={textareaRef}
          value={inputMessage}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Ask AI anything..."
          rows={1}
          className="flex-1 !bg-transparent border-none outline-none shadow-none ring-0 focus-visible:ring-0 px-2 py-3 text-foreground text-base placeholder:text-muted-foreground font-medium resize-none overflow-y-auto min-h-[44px] max-h-[200px] scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-600"
          disabled={isSending}
        />

        <Button
          type="submit"
          disabled={isDisabled}
          size="icon"
          className="h-10 w-10 mb-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm hover:shadow-md transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shrink-0"
        >
          <Send className="w-4 h-4 ml-0.5" />
        </Button>
      </div>
    </form>
  );
});
