import {
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionMenuTrigger,
  PromptInputButton,
} from '@/components/ai-elements/prompt-input';
import {
  SendMessageDtoAgentMode,
  useAgentsControllerGetAgentModes,
} from '@/services/apis/gen/queries';
import { useConnectWorkerState } from '@/hooks/useConnectWorkerState';
import { CheckIcon, InfinityIcon, MonitorIcon } from 'lucide-react';
import { memo } from 'react';
import { toast } from 'sonner';

interface AgentModeSelectProps {
  value: string;
  onChange: (mode: string) => void;
  selectedWorkerId?: string | null;
  onWorkerChange?: (workerId: string | null) => void;
}

export const AgentModeSelect = memo(function AgentModeSelect({
  value,
  onChange,
  selectedWorkerId,
  onWorkerChange,
}: AgentModeSelectProps) {
  const isAgent = value === SendMessageDtoAgentMode.agent;
  const { data } = useAgentsControllerGetAgentModes();

  const workers = data?.workers ?? [];

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

  const handleWorkerSelect = (workerId: string) => {
    // Toggle selection: deselect if same worker is clicked again
    const newId = selectedWorkerId === workerId ? null : workerId;
    onWorkerChange?.(newId);
  };

  return (
    <>
      {isAgent && (
        <PromptInputActionMenu>
          <PromptInputActionMenuTrigger tooltip="Connected workers">
            <MonitorIcon
              size={16}
              className={
                workers.length > 0 ? 'text-green-500 hover:!text-green-500' : ''
              }
            />
          </PromptInputActionMenuTrigger>
          <PromptInputActionMenuContent>
            {workers.length > 0 ? (
              <>
                <PromptInputActionMenuItem
                  className="flex items-center gap-2 cursor-pointer"
                  onClick={() => onWorkerChange?.(null)}
                >
                  <span className="flex-1 font-medium">Auto (any worker)</span>
                  {!selectedWorkerId && (
                    <CheckIcon className="size-4 text-green-500" />
                  )}
                </PromptInputActionMenuItem>
                {workers.map((worker) => {
                  const isSelected = selectedWorkerId === worker.id;
                  return (
                    <PromptInputActionMenuItem
                      key={worker.id}
                      className="flex items-center gap-2 cursor-pointer"
                      onClick={() => handleWorkerSelect(worker.id)}
                    >
                      {worker.os && (
                        <img
                          className="size-5 dark:brightness-0 dark:invert"
                          src={`/${worker.os}.svg`}
                          alt={worker.os}
                        />
                      )}
                      <span className="flex-1">
                        {worker.name ?? worker.id.slice(0, 8)}
                      </span>
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                      </span>
                      {isSelected && (
                        <CheckIcon className="size-4 text-green-500 ml-1" />
                      )}
                    </PromptInputActionMenuItem>
                  );
                })}
              </>
            ) : (
              <PromptInputActionMenuItem disabled>
                No workers connected
              </PromptInputActionMenuItem>
            )}
          </PromptInputActionMenuContent>
        </PromptInputActionMenu>
      )}
      <PromptInputButton
        onClick={handleToggle}
        className={
          isAgent
            ? 'text-orange-500 flex items-center gap-2 bg-orange-500/10 border border-orange-500 hover:bg-orange-500/20 hover:text-orange-500'
            : ''
        }
      >
        <InfinityIcon size={16} />
        <span>Agent</span>
      </PromptInputButton>
    </>
  );
});
