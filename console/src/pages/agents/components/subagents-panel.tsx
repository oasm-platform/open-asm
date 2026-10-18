import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import {
  SubagentResponseDtoStatus,
  type SubagentResponseDto,
} from '@/services/apis/gen/queries';
import {
  CheckCircle2,
  ChevronDown,
  Clock,
  Loader2,
  Network,
  XCircle,
} from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { formatDuration, formatTokens } from './turn-stats-panel';

/** How often the run time of running subagents ticks (local clock only). */
export const SUBAGENTS_TICK_MS = 1_000;

export const isSubagentActive = (s: SubagentResponseDto) =>
  s.status === SubagentResponseDtoStatus.pending ||
  s.status === SubagentResponseDtoStatus.in_progress;

const STATUS: Record<
  SubagentResponseDto['status'],
  { label: string; icon: typeof Clock; className: string }
> = {
  pending: { label: 'Queued', icon: Clock, className: 'text-muted-foreground' },
  in_progress: {
    label: 'Running',
    icon: Loader2,
    className: 'text-sky-500 animate-spin',
  },
  completed: {
    label: 'Done',
    icon: CheckCircle2,
    className: 'text-emerald-500',
  },
  failed: { label: 'Failed', icon: XCircle, className: 'text-destructive' },
};

/** Run time so far (running) or in total (finished). */
function elapsed(s: SubagentResponseDto, now: number): number | null {
  if (!s.startedAt) return null;
  const end = s.completedAt ? new Date(s.completedAt).getTime() : now;
  return Math.max(0, end - new Date(s.startedAt).getTime());
}

function SubagentRow({
  subagent,
  now,
}: {
  subagent: SubagentResponseDto;
  now: number;
}) {
  const [open, setOpen] = useState(false);
  const status = STATUS[subagent.status];
  const Icon = status.icon;
  const time = elapsed(subagent, now);
  const output = subagent.error ?? subagent.result;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-start gap-2 rounded-md px-1 py-1 text-left hover:bg-muted/50 cursor-pointer">
        <Icon
          className={cn('mt-0.5 size-3.5 shrink-0', status.className)}
          aria-label={status.label}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-foreground">
              @{subagent.name}
            </span>
            <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
              {time === null ? status.label : formatDuration(time)}
            </span>
          </div>
          <p className={cn('text-muted-foreground', !open && 'line-clamp-2')}>
            {subagent.task}
          </p>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-1 pb-1 pl-6 pr-1">
        {subagent.stats && (
          <p className="tabular-nums text-muted-foreground">
            {subagent.stats.steps} steps ·{' '}
            {formatTokens(subagent.stats.inputTokens)} ↑ ·{' '}
            {formatTokens(subagent.stats.outputTokens)} ↓
          </p>
        )}
        {output && (
          <pre
            className={cn(
              'max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-2 font-sans',
              subagent.error && 'text-destructive',
            )}
          >
            {output}
          </pre>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

interface SubagentsPanelProps {
  /** From the conversation detail, kept current by the chat stream */
  subagents: SubagentResponseDto[];
}

/** Background subagents of the conversation. */
export const SubagentsPanel = memo(function SubagentsPanel({
  subagents,
}: SubagentsPanelProps) {
  const [open, setOpen] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const running = subagents.filter(isSubagentActive).length;

  // Ticks the elapsed time of running subagents
  useEffect(() => {
    if (running === 0) return;
    const timer = setInterval(() => setNow(Date.now()), SUBAGENTS_TICK_MS);
    return () => clearInterval(timer);
  }, [running]);

  if (subagents.length === 0) return null;

  return (
    <div className="shrink-0 border-b px-3 py-2 text-xs">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center gap-2 py-1 text-sm font-medium text-foreground cursor-pointer">
          <Network className="size-4" />
          <span>Subagents</span>
          <ChevronDown
            className={cn(
              'size-3.5 text-muted-foreground transition-transform',
              !open && '-rotate-90',
            )}
          />
          <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">
            {running > 0 ? `${running} running` : `${subagents.length} done`}
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent className="max-h-72 space-y-0.5 overflow-y-auto pt-1">
          {subagents.map((s) => (
            <SubagentRow key={s.id} subagent={s} now={now} />
          ))}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
});
