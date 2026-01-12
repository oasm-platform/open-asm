import { Button } from '@/components/ui/button';
import { MessageCircle } from 'lucide-react';
import { memo } from 'react';

const DEFAULT_SUGGESTIONS: string[] = [
  'What is the current system security status?',
  'Are there any high-risk vulnerabilities detected?',
  'How should I configure the WAF for better protection?',
  'Can you explain the results of the last scan?',
  'What specific security actions do you recommend now?',
];

interface ChatSuggestionsProps {
  suggestions?: string[];
  onSuggestionClick: (suggestion: string) => void;
}

export const ChatSuggestions = memo(function ChatSuggestions({
  suggestions = DEFAULT_SUGGESTIONS,
  onSuggestionClick,
}: ChatSuggestionsProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="mb-8 text-center space-y-2">
        <div className="bg-primary/10 p-3 rounded-full w-fit mx-auto text-primary mb-4">
          <MessageCircle className="h-8 w-8" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">
          I am OASM Security Assistant
        </h3>
        <p className="text-sm text-muted-foreground max-w-[280px] mx-auto">
          How can I help you today?
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 w-full max-w-sm">
        {suggestions.map((s) => (
          <Button
            key={s}
            variant="outline"
            className="justify-start font-normal h-auto py-3 px-4 bg-muted/30 border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-all text-left whitespace-normal break-words"
            onClick={() => onSuggestionClick(s)}
          >
            <span className="text-sm">{s}</span>
          </Button>
        ))}
      </div>
    </div>
  );
});
