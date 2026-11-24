import { useT } from '@/lib/i18n-dictionary';
import { Button } from '@/components/ui/button';
import { useAiChat } from '@/hooks/useAiChat';
import { Sparkles } from 'lucide-react';
import { useCallback, type ComponentProps } from 'react';

/**
 * Opens the AI chat sidebar on a new Ask-mode chat and sends `query` straight
 * away, so a search with no results still ends in an answer instead of a dead
 * end, without leaving the page.
 */
export function useAskAi() {
  const { openChat } = useAiChat();
  return useCallback(
    (query: string) => {
      const text = query.trim();
      if (!text) return;
      openChat({ text, agentMode: 'ask' });
    },
    [openChat],
  );
}

interface AskAiButtonProps
  extends Omit<ComponentProps<typeof Button>, 'onClick'> {
  query: string;
  onAsk?: () => void;
}

export function AskAiButton({ query, onAsk, ...props }: AskAiButtonProps) {
  const askAi = useAskAi();
  const t = useT();
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
      {t('components.askAi.label')}
    </Button>
  );
}
