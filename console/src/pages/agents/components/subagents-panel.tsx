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
import { SIDE_PANEL_INDENT, SIDE_PANEL_ROW } from './side-panel-layout';
import { SubagentTranscript } from './subagent-transcript';
import { formatDuration } from './turn-stats-panel';

/** How often the run time of running subagents ticks (local clock only). */
export const SUBAGENTS_TICK_MS = 1_000;

export const isSubagentActive = (s: SubagentResponseDto) =>
  s.status === SubagentResponseDtoStatus.pending ||
  s.status === SubagentResponseDtoStatus.in_progress;

export interface SubagentStatusView {
  label: string;
  icon: typeof Clock;
  className: string;
}

const STATUS: Record<SubagentResponseDto['status'], SubagentStatusView> = {
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
  cancelled: {
    label: 'Cancelled',
    icon: XCircle,
    className: 'text-muted-foreground',
  },
};

/** Run time so far (running) or in total (finished). */
function elapsed(s: SubagentResponseDto, now: number): number | null {
  if (!s.startedAt) return null;
  const end = s.completedAt ? new Date(s.completedAt).getTime() : now;
  return Math.max(0, end - new Date(s.startedAt).getTime());
}

/** One subagent; opens in place to its transcript once it can load one. */
function SubagentRow({
  subagent,
  now,
  conversationId,
  embedded,
}: {
  subagent: SubagentResponseDto;
  now: number;
  conversationId?: string;
  /** Side panel row: text-sm name and a size-4 icon, like the other tabs */
  embedded: boolean;
}) {
  const [open, setOpen] = useState(false);
  const status = STATUS[subagent.status];
  const Icon = status.icon;
  const time = elapsed(subagent, now);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        disabled={!conversationId}
        className={cn(
          'w-full text-left transition-colors hover:bg-muted/60 cursor-pointer disabled:cursor-default',
          embedded
            ? SIDE_PANEL_ROW
            : 'flex items-start gap-2 rounded-lg px-2 py-1.5',
        )}
      >
        <Icon
          className={cn(
            'mt-0.5 shrink-0',
            embedded ? 'size-4' : 'size-3.5',
            status.className,
          )}
          aria-label={status.label}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-foreground">
              @{subagent.name}
            </span>
            <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
              {time === null ? status.label : formatDuration(time)}
            </span>
            {conversationId && (
              <ChevronDown
                className={cn(
                  'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
                  !open && '-rotate-90',
                )}
              />
            )}
          </div>
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {subagent.task}
          </p>
        </div>
      </CollapsibleTrigger>
      {conversationId && (
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          {/* Lined up with the row's text, past its status icon */}
          <div
            className={cn(
              'pt-2 pr-2 pb-4',
              embedded ? SIDE_PANEL_INDENT : 'pl-7.5',
            )}
          >
            <SubagentTranscript
              subagent={subagent}
              conversationId={conversationId}
            />
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

interface SubagentsPanelProps {
  /** From the conversation detail, kept current by the chat stream */
  subagents: SubagentResponseDto[];
  /** Lets a picked subagent load its transcript */
  conversationId?: string;
  /**
   * False lays it out for a side panel tab, which already names it: no card
   * and no header to fold it, just the rows, uncapped. Default true
   */
  collapsible?: boolean;
  className?: string;
}

/** Background subagents of the conversation; each opens in place. */
export const SubagentsPanel = memo(function SubagentsPanel({
  subagents,
  conversationId,
  collapsible = true,
  className,
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

  const list = (
    <div
      className={cn(
        'space-y-0.5',
        collapsible && 'max-h-72 overflow-y-auto px-1.5 pb-1.5',
      )}
    >
      {subagents.map((s) => (
        <SubagentRow
          key={s.id}
          subagent={s}
          now={now}
          conversationId={conversationId}
          embedded={!collapsible}
        />
      ))}
    </div>
  );

  return (
    // Inside a tab the tab is the frame: no card around the list
    <div
      className={cn(
        collapsible &&
          'shrink-0 overflow-hidden rounded-xl border bg-card text-xs shadow-xs',
        className,
      )}
    >
      {collapsible ? (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-medium text-foreground cursor-pointer">
            <Network className="size-4 text-muted-foreground" />
            <span>Subagents</span>
            <ChevronDown
              className={cn(
                'size-3.5 text-muted-foreground transition-transform',
                !open && '-rotate-90',
              )}
            />
            <span
              className={cn(
                'ml-auto rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
                running > 0
                  ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {running > 0 ? `${running} running` : `${subagents.length} done`}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
            {list}
          </CollapsibleContent>
        </Collapsible>
      ) : (
        list
      )}
    </div>
  );
});
