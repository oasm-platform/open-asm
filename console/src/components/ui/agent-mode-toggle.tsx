import { GlobeIcon } from 'lucide-react';
import { memo } from 'react';
import { PromptInputButton } from '@/components/ai-elements/prompt-input';

interface AgentModeToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export const AgentModeToggle = memo(function AgentModeToggle({
  enabled,
  onToggle,
}: AgentModeToggleProps) {
  return (
    <PromptInputButton
      onClick={() => onToggle(!enabled)}
      tooltip={{
        content: enabled ? 'Disable Agent Mode' : 'Enable Agent Mode',
        shortcut: enabled ? 'ON' : 'OFF',
      }}
      className={enabled ? 'text-blue-600 dark:text-blue-400' : ''}
    >
      <GlobeIcon size={16} />
      <span className="hidden sm:inline">Agent</span>
    </PromptInputButton>
  );
});
