import { useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Send, Sparkles } from 'lucide-react';
import type { ChatInputProps } from '../types/types';

export function ChatInput({
  inputMessage,
  setInputMessage,
  onSendMessage,
  isSending,
  onKeyPress,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height =
        textareaRef.current.scrollHeight + 'px';
    }
  }, [inputMessage]);

  return (
    <div className="relative group">
      {/* Glow effect - Reduced opacity */}
      <div className="relative flex items-center gap-2 bg-background p-1.5 rounded-3xl border border-input shadow-sm focus-within:border-ring focus-within:shadow-md transition-all duration-200">
        {/* AI Icon Adornment */}
        {/* AI Icon Adornment */}
        <div className="pl-3 text-zinc-500">
          <Sparkles className="w-5 h-5" />
        </div>
        {/* AI Icon Adornment */}
        <textarea
          ref={textareaRef}
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (inputMessage.trim() && !isSending) {
                onSendMessage();
                // Height reset handled by useEffect on inputMessage change
              }
              return; // Stop here, do not call onKeyPress for the handled Enter
            }
            onKeyPress?.(e);
          }}
          placeholder="Ask AI anything..."
          rows={1}
          className="flex-1 border-none outline-none shadow-none px-2 py-3 bg-transparent text-foreground text-base placeholder:text-muted-foreground font-medium resize-none overflow-hidden min-h-[44px] max-h-[200px]"
          disabled={isSending}
        />

        <Button
          onClick={onSendMessage}
          disabled={isSending || inputMessage.trim() === ''}
          size="icon"
          className="h-10 w-10 rounded-full bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm hover:shadow-md transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          <Send className="w-4 h-4 ml-0.5" />
        </Button>
      </div>
    </div>
  );
}
