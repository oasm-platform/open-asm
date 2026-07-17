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
  XCircle,
} from 'lucide-react';
import { useState } from 'react';

export interface AgentTodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  sortOrder: number;
  updatedAt: string;
}

interface AgentTodoPanelProps {
  todos: AgentTodoItem[];
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
    <Icon
      className={cn(
        'size-4 shrink-0 mt-0.5',
        config.className,
        status === 'in_progress' && 'animate-spin',
      )}
    />
  );
}

export function AgentTodoPanel({ todos, className }: AgentTodoPanelProps) {
  const [isOpen, setIsOpen] = useState(true);

  if (!todos || todos.length === 0) return null;

  const sortedTodos = [...todos].sort((a, b) => a.sortOrder - b.sortOrder);
  const counts = {
    pending: sortedTodos.filter((t) => t.status === 'pending').length,
    in_progress: sortedTodos.filter((t) => t.status === 'in_progress').length,
    completed: sortedTodos.filter((t) => t.status === 'completed').length,
    failed: sortedTodos.filter((t) => t.status === 'failed').length,
  };

  const activeCount = counts.in_progress + counts.pending;
  const currentTask = sortedTodos.find((t) => t.status === 'in_progress');

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn(
        'rounded-xl border border-border bg-background/80 backdrop-blur-sm shadow-xs',
        className,
      )}
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="group flex w-full items-center justify-between px-3 py-2 text-left"
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
                <span className="text-foreground font-medium">Todo</span> — {currentTask.content}
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
            {activeCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                <Loader2 className="size-3 animate-spin" />
                {activeCount} active
              </span>
            )}
            {counts.completed > 0 && counts.completed === todos.length && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">
                <CheckCircle2 className="size-3" />
                Done
              </span>
            )}
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="space-y-1 px-3 pb-2">
          {sortedTodos.map((todo) => (
            <li
              key={todo.id}
              className="group flex items-start gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
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
      </CollapsibleContent>
    </Collapsible>
  );
}
