import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  Loader2,
  Target,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { SIDE_PANEL_ROW, SidePanelSection } from './side-panel-layout';

export interface AgentTodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  sortOrder: number;
  updatedAt: string;
}

interface AgentTodoPanelProps {
  todos?: AgentTodoItem[];
  /** Goal of the plan: pinned above the steps, visible even when collapsed */
  goal?: string | null;
  /** Whether the steps start expanded. Default true */
  defaultOpen?: boolean;
  /**
   * False lays it out for a side panel tab: no card and no header to fold
   * it, a Goal and a Steps section with every step, uncapped. Default true
   */
  collapsible?: boolean;
  className?: string;
}

const STATUS_CONFIG = {
  pending: {
    icon: Circle,
    className: 'text-muted-foreground/40',
    label: 'Pending',
  },
  in_progress: {
    icon: Loader2,
    className: 'text-blue-500',
    label: 'In Progress',
  },
  completed: {
    icon: CheckCircle2,
    className: 'text-green-500',
    label: 'Completed',
  },
  failed: {
    icon: XCircle,
    className: 'text-red-500',
    label: 'Failed',
  },
} as const;

function TodoStatusIcon({ status }: { status: AgentTodoItem['status'] }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <>
      <Icon
        aria-hidden="true"
        className={cn(
          'size-4 shrink-0 mt-0.5',
          config.className,
          status === 'in_progress' && 'animate-spin',
        )}
      />
      <span className="sr-only">{config.label}</span>
    </>
  );
}

/**
 * The plan's goal, pinned until every step is completed or failed.
 * `embedded`: in a side panel section, which titles it and sets the margins.
 */
function PinnedGoal({
  goal,
  finished,
  expanded,
  embedded = false,
}: {
  goal: string;
  finished: boolean;
  expanded: boolean;
  embedded?: boolean;
}) {
  const Icon = finished ? CheckCircle2 : Target;
  return (
    <div
      className={cn(
        'flex items-start rounded-lg border',
        embedded ? 'gap-2.5 px-2 py-2' : 'mx-3 mb-2 gap-2 px-2.5 py-2',
        finished
          ? 'border-green-500/20 bg-green-500/5'
          : 'border-primary/20 bg-primary/5',
      )}
      title={expanded ? undefined : goal}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          'size-4 shrink-0 mt-0.5',
          finished ? 'text-green-500' : 'text-primary',
        )}
      />
      <div className="min-w-0 flex-1">
        {!embedded && (
          <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {finished ? 'Goal · done' : 'Goal'}
          </span>
        )}
        <p
          className={cn(
            'text-sm leading-snug text-foreground break-words',
            !expanded && 'line-clamp-2',
          )}
        >
          {goal}
        </p>
      </div>
    </div>
  );
}

export function AgentTodoPanel({
  todos,
  goal,
  defaultOpen = true,
  collapsible = true,
  className,
}: AgentTodoPanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const hasTodos = !!todos && todos.length > 0;
  if (!hasTodos) {
    // The goal arrives before the plan (auto-generated like the title): show it
    // on its own until the first step exists.
    if (!goal) return null;
    if (!collapsible) {
      return (
        <SidePanelSection title="Goal" className={className}>
          <PinnedGoal goal={goal} finished={false} expanded embedded />
        </SidePanelSection>
      );
    }
    return (
      <div
        className={cn(
          'rounded-xl border border-border bg-card shadow-xs pt-3 pb-1',
          className,
        )}
      >
        <PinnedGoal goal={goal} finished={false} expanded />
      </div>
    );
  }

  const sortedTodos = [...todos].sort((a, b) => a.sortOrder - b.sortOrder);
  const counts = {
    pending: sortedTodos.filter((t) => t.status === 'pending').length,
    in_progress: sortedTodos.filter((t) => t.status === 'in_progress').length,
    completed: sortedTodos.filter((t) => t.status === 'completed').length,
    failed: sortedTodos.filter((t) => t.status === 'failed').length,
  };

  const activeCount = counts.in_progress + counts.pending;
  const finished = activeCount === 0;
  const currentTask = sortedTodos.find((t) => t.status === 'in_progress');
  const progress = (counts.completed / todos.length) * 100;

  // Thin progress line: completed / all steps
  const progressBar = (
    <div
      className={cn(
        'h-1 overflow-hidden rounded-full bg-muted',
        collapsible ? 'mx-3 mb-2' : 'mx-2 mb-1.5',
      )}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500 ease-out',
          finished ? 'bg-green-500' : 'bg-primary',
        )}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
  const list = (
    <ul
      className={cn(
        'space-y-0.5',
        collapsible && 'max-h-[40vh] overflow-y-auto px-3 pb-2',
      )}
    >
      {sortedTodos.map((todo) => (
        <li
          key={todo.id}
          className={cn(SIDE_PANEL_ROW, 'group transition-colors hover:bg-muted/50')}
        >
          <TodoStatusIcon status={todo.status} />
          <div className="flex-1 min-w-0">
            <span
              className={cn(
                'block text-sm leading-snug',
                todo.status === 'completed' &&
                  'text-muted-foreground/60 line-through',
                todo.status === 'failed' && 'text-red-600/80',
                todo.status === 'in_progress' && 'font-medium',
              )}
            >
              {todo.content}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );

  if (!collapsible) {
    return (
      <div className={cn('space-y-5', className)}>
        {goal && (
          <SidePanelSection title={finished ? 'Goal · done' : 'Goal'}>
            <PinnedGoal goal={goal} finished={finished} expanded embedded />
          </SidePanelSection>
        )}
        <SidePanelSection
          title="Steps"
          meta={`${counts.completed}/${todos.length} done`}
        >
          {progressBar}
          {list}
        </SidePanelSection>
      </div>
    );
  }

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn(
        'overflow-hidden rounded-xl border border-border bg-card shadow-xs',
        className,
      )}
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="group flex w-full items-center justify-between px-3 py-2.5 text-left cursor-pointer"
        >
          <span className="flex items-center gap-1.5 text-sm font-medium text-foreground min-w-0">
            <ChevronDown
              className={cn(
                'size-4 text-muted-foreground shrink-0 transition-transform',
                !isOpen && '-rotate-90',
              )}
            />
            {currentTask && !isOpen ? (
              <span className="truncate text-muted-foreground font-normal">
                <span className="text-foreground font-medium">Todo</span> —{' '}
                {currentTask.content}
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <span>Todo</span>
                <span className="text-muted-foreground/60 tabular-nums">
                  {counts.completed}/{todos.length}
                </span>
              </span>
            )}
          </span>
          <span className="flex items-center gap-2 shrink-0">
            {activeCount > 0 &&
              (counts.in_progress > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                  <Loader2 className="size-3 animate-spin" />
                  {activeCount} left
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {activeCount} left
                </span>
              ))}
            {counts.completed > 0 && counts.completed === todos.length && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">
                <CheckCircle2 className="size-3" />
                Done
              </span>
            )}
          </span>
        </button>
      </CollapsibleTrigger>
      {progressBar}
      {goal && <PinnedGoal goal={goal} finished={finished} expanded={isOpen} />}
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        {list}
      </CollapsibleContent>
    </Collapsible>
  );
}
