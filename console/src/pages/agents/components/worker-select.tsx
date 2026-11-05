import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAgentWorkers } from '@/hooks/use-agent-workers';
import { cn } from '@/lib/utils';
import { WorkerInstanceScope } from '@/services/apis/gen/queries';
import { MonitorIcon } from 'lucide-react';
import { useEffect } from 'react';
import { toast } from 'sonner';

const AUTO = 'auto';

interface WorkerSelectProps {
  value: string | null;
  onChange: (workerId: string | null) => void;
  className?: string;
}

/** The worker (device) an agent chat runs commands on, picked next to the project. */
export function WorkerSelect({
  value,
  onChange,
  className,
}: WorkerSelectProps) {
  const { workers, isSuccess, isFetching, refetch } = useAgentWorkers();

  // A chosen worker that went offline drops out of the list; fall back to
  // Auto rather than send a pick the server would reject.
  const selectedIsOffline =
    !!value &&
    isSuccess &&
    !isFetching &&
    !workers.some((worker) => worker.id === value);
  useEffect(() => {
    if (!selectedIsOffline) return;
    onChange(null);
    toast.info('The selected worker went offline, switched to Auto');
  }, [selectedIsOffline, onChange]);

  return (
    <Select
      value={value ?? AUTO}
      onValueChange={(id) => onChange(id === AUTO ? null : id)}
      // Re-check on open: a worker can come online without an event reaching
      // this list (its RemoteExecute stream opens after join).
      onOpenChange={(open) => {
        if (open) void refetch();
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label="Device"
        className={cn(
          'w-auto max-w-64 data-[size=sm]:h-7 gap-1.5 border-none bg-transparent px-2 text-xs text-muted-foreground shadow-none hover:bg-accent dark:bg-transparent',
          className,
        )}
      >
        <MonitorIcon
          className={cn('size-3.5', workers.length > 0 && 'text-green-500')}
        />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start">
        <SelectItem value={AUTO}>Auto (any worker)</SelectItem>
        {workers.map((worker) => (
          <SelectItem key={worker.id} value={worker.id}>
            {worker.name ?? worker.id.slice(0, 8)}
            {worker.scope === WorkerInstanceScope.cloud && ' (Global)'}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
