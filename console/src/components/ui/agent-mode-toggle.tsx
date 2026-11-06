import { PromptInputButton } from '@/components/ai-elements/prompt-input';
import { SendMessageDtoAgentMode } from '@/services/apis/gen/queries';
import { useAgentWorkers } from '@/hooks/use-agent-workers';
import { useConnectWorkerState } from '@/hooks/useConnectWorkerState';
import { InfinityIcon } from 'lucide-react';
import { memo } from 'react';
import { toast } from 'sonner';

interface AgentModeToggleProps {
  value: string;
  onChange: (mode: string) => void;
  onWorkerChange?: (workerId: string | null) => void;
}

/** The "Agent" button that switches between ask and agent mode. */
export const AgentModeToggle = memo(function AgentModeToggle({
  value,
  onChange,
  onWorkerChange,
}: AgentModeToggleProps) {
  const isAgent = value === SendMessageDtoAgentMode.agent;
  const { workers } = useAgentWorkers();
  const { openDialog } = useConnectWorkerState();

  const handleToggle = () => {
    const next = isAgent
      ? SendMessageDtoAgentMode.ask
      : SendMessageDtoAgentMode.agent;
    if (next === SendMessageDtoAgentMode.agent && workers.length === 0) {
      openDialog();
      return;
    }
    if (next === SendMessageDtoAgentMode.agent) {
      toast.success('Agent mode enabled');
    }
    if (next === SendMessageDtoAgentMode.ask) {
      onWorkerChange?.(null);
    }
    onChange(next);
  };

  return (
    <PromptInputButton
      onClick={handleToggle}
      className={
        isAgent
          ? 'flex items-center gap-2 text-orange-500 hover:bg-transparent hover:text-orange-500'
          : ''
      }
    >
      <InfinityIcon size={16} />
      <span>Agent</span>
    </PromptInputButton>
  );
});
