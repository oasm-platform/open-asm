import {
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionMenuTrigger,
  PromptInputButton,
} from '@/components/ai-elements/prompt-input';
import {
  getAgentsControllerGetAgentModesQueryKey,
  SendMessageDtoAgentMode,
  useAgentsControllerGetAgentModes,
  WorkerInstanceScope,
} from '@/services/apis/gen/queries';
import { ApprovalModeSelect } from '@/components/ui/approval-mode-select';
import { Badge } from '@/components/ui/badge';
import { useConnectWorkerState } from '@/hooks/useConnectWorkerState';
import { useLiveEvents } from '@/hooks/use-live-events';
import { useQueryClient } from '@tanstack/react-query';
import { CheckIcon, InfinityIcon, MonitorIcon } from 'lucide-react';
import { memo, useEffect } from 'react';
import { toast } from 'sonner';

/**
 * The workers agents can use right now. The server lists only online ones;
 * worker lifecycle events refresh the list so it never shows a stale worker.
 */
function useAgentWorkers() {
  const queryClient = useQueryClient();
  const query = useAgentsControllerGetAgentModes();

  useLiveEvents('worker.*', () => {
    void queryClient.invalidateQueries({
      queryKey: getAgentsControllerGetAgentModesQueryKey(),
    });
  });

  return { ...query, workers: query.data?.workers ?? [] };
}

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
          ? 'text-orange-500 flex items-center gap-2 bg-orange-500/10 border border-orange-500 hover:bg-orange-500/20 hover:text-orange-500'
          : ''
      }
    >
      <InfinityIcon size={16} />
      <span>Agent</span>
    </PromptInputButton>
  );
});

interface AgentModeSelectProps {
  value: string;
  onChange: (mode: string) => void;
  selectedWorkerId?: string | null;
  onWorkerChange?: (workerId: string | null) => void;
  /** False when the page renders AgentModeToggle somewhere else. */
  showToggle?: boolean;
}

export const AgentModeSelect = memo(function AgentModeSelect({
  value,
  onChange,
  selectedWorkerId,
  onWorkerChange,
  showToggle = true,
}: AgentModeSelectProps) {
  const isAgent = value === SendMessageDtoAgentMode.agent;
  const { workers, isSuccess, isFetching, refetch } = useAgentWorkers();

  // A chosen worker that went offline drops out of the list; fall back to
  // Auto rather than send a pick the server would reject.
  const selectedIsOffline =
    !!selectedWorkerId &&
    isSuccess &&
    !isFetching &&
    !workers.some((worker) => worker.id === selectedWorkerId);
  useEffect(() => {
    if (!selectedIsOffline) return;
    onWorkerChange?.(null);
    toast.info('The selected worker went offline, switched to Auto');
  }, [selectedIsOffline, onWorkerChange]);

  const handleWorkerSelect = (workerId: string) => {
    // Toggle selection: deselect if same worker is clicked again
    const newId = selectedWorkerId === workerId ? null : workerId;
    onWorkerChange?.(newId);
  };

  return (
    <>
      <ApprovalModeSelect />

      {isAgent && (
        <PromptInputActionMenu
          // Re-check on open: a worker can come online without an event
          // reaching this list (its RemoteExecute stream opens after join).
          onOpenChange={(open) => {
            if (open) void refetch();
          }}
        >
          <PromptInputActionMenuTrigger tooltip="Online workers">
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
                      {/* Shared by every workspace */}
                      {worker.scope === WorkerInstanceScope.cloud && (
                        <Badge variant="outline" className="text-[10px]">
                          Global
                        </Badge>
                      )}
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
                No online workers
              </PromptInputActionMenuItem>
            )}
          </PromptInputActionMenuContent>
        </PromptInputActionMenu>
      )}
      {showToggle && (
        <AgentModeToggle
          value={value}
          onChange={onChange}
          onWorkerChange={onWorkerChange}
        />
      )}
    </>
  );
});
