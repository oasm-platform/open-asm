import { useT } from '@/lib/i18n-dictionary';
import { AiButton } from '@/components/ui/ai-button';
import { useAiChatPanelOpen } from '@/hooks/useAiChatPanel';
import { usePermission } from '@/hooks/usePermission';

/** Header button that opens and closes the AI chat panel */
export function AiChatPanelToggle() {
  const t = useT();
  const { state: isOpen, toggle } = useAiChatPanelOpen();
  const { hasPermission } = usePermission();

  if (!hasPermission('agent.read')) return null;

  return (
    <AiButton
      // Borderless and unfilled, so it does not read as a second search box
      variant="ghost"
      label={t('components.askAi.label')}
      // Small screens keep only the icon, beside the search icon
      labelClassName="hidden md:inline"
      // Dark mode: the icon takes the label's color, not the accent
      className="shrink-0 dark:[&_svg]:text-current"
      aria-label={isOpen ? t('components.aiChat.close') : t('components.aiChat.open')}
      aria-pressed={isOpen}
      title={isOpen ? t('components.aiChat.close') : t('components.askAi.label')}
      onClick={toggle}
    />
  );
}
