import { Button } from '@/components/ui/button';
import { useNavigate } from '@tanstack/react-router';
import { Sparkles } from 'lucide-react';
import { useCallback, type ComponentProps } from 'react';

/**
 * Opens AI Studio in Ask mode and sends `query` straight away, so a search
 * with no results still ends in an answer instead of a dead end.
 */
export function useAskAi() {
  const navigate = useNavigate();
  return useCallback(
    (query: string) => {
      const text = query.trim();
      if (!text) return;
      void navigate({ to: '/aistudio', search: { text, mode: 'ask' } });
    },
    [navigate],
  );
}

interface AskAiButtonProps
  extends Omit<ComponentProps<typeof Button>, 'onClick'> {
  query: string;
  onAsk?: () => void;
}

export function AskAiButton({ query, onAsk, ...props }: AskAiButtonProps) {
  const askAi = useAskAi();
  return (
    <Button
      type="button"
      onClick={() => {
        onAsk?.();
        askAi(query);
      }}
      {...props}
    >
      <Sparkles className="size-4" aria-hidden />
      Ask AI
    </Button>
  );
}
