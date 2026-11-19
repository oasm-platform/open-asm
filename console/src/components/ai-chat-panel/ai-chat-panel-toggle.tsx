import { AiButton } from '@/components/ui/ai-button';
import { useAiChatPanelOpen } from '@/hooks/useAiChatPanel';
import { usePermission } from '@/hooks/usePermission';

/** Header button that opens and closes the AI chat panel */
export function AiChatPanelToggle() {
  const { state: isOpen, toggle } = useAiChatPanelOpen();
  const { hasPermission } = usePermission();

  if (!hasPermission('agent.read')) return null;

  return (
    <AiButton
      variant="outline"
      label="Ask AI"
      // Small screens keep only the icon, beside the search icon
      labelClassName="hidden md:inline"
      // Dark mode: borderless and unfilled, so it does not read as a second
      // search box, and the icon takes the label's color, not the accent
      className="shrink-0 dark:border-transparent dark:aria-pressed:border-transparent dark:bg-transparent dark:shadow-none dark:[&_svg]:text-current"
      aria-label={isOpen ? 'Close AI chat' : 'Open AI chat'}
      aria-pressed={isOpen}
      title={isOpen ? 'Close AI chat' : 'Ask AI'}
      onClick={toggle}
    />
  );
}
