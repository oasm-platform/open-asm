import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  BanIcon,
  CheckCircleIcon,
  CircleIcon,
  ClockIcon,
  ListChecksIcon,
  WrenchIcon,
  XCircleIcon,
} from 'lucide-react';
import { motion } from 'framer-motion';
import type { RemoteExecuteStreamEvent } from '@/hooks/use-remote-execute-stream';
import { RemoteExecuteTerminal } from './remote-execute-terminal';

export interface ToolCallState {
  toolCallId: string;
  toolName: string;
  status:
    | 'pending'
    | 'executing'
    | 'completed'
    | 'error'
    | 'rejected'
    /** Refused until the user approves a plan (PLAN approval mode) */
    | 'needs-plan';
  input?: Record<string, unknown>;
  output?: unknown;
}

const statusConfig: Record<
  ToolCallState['status'],
  { label: string; icon: typeof CheckCircleIcon; color: string }
> = {
  pending: { label: 'Pending', icon: CircleIcon, color: 'text-muted-foreground' },
  executing: { label: 'Running', icon: ClockIcon, color: 'text-blue-500' },
  completed: { label: 'Done', icon: CheckCircleIcon, color: 'text-green-500' },
  error: { label: 'Error', icon: XCircleIcon, color: 'text-red-500' },
  rejected: { label: 'Rejected', icon: BanIcon, color: 'text-amber-500' },
  'needs-plan': {
    label: 'Needs plan',
    icon: ListChecksIcon,
    color: 'text-amber-500',
  },
};

function formatToolName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const PLAN_TOOL = 'formulate_plan';

/** Steps of a formulate_plan call: the saved plan if any, else what was asked */
function planSteps(toolCall: ToolCallState): string[] {
  const output = toolCall.output as
    | { todos?: Array<{ content?: unknown }> }
    | null
    | undefined;
  if (Array.isArray(output?.todos) && output.todos.length > 0) {
    return output.todos.map((t) => String(t.content ?? ''));
  }
  const steps = toolCall.input?.steps;
  return Array.isArray(steps) ? steps.map((step) => String(step)) : [];
}

const planStatusLabel: Record<ToolCallState['status'], string> = {
  pending: 'Planning',
  executing: 'Planning',
  completed: 'Plan ready',
  error: 'Error',
  rejected: 'Not approved',
  'needs-plan': 'Needs plan',
};

/** A plan rendered in the chat, so the user sees it as soon as it is made. */
function PlanCallDisplay({ toolCall }: { toolCall: ToolCallState }) {
  const steps = planSteps(toolCall);
  // e.g. refused because another plan is still running
  const notSet =
    toolCall.status === 'completed' &&
    (toolCall.output as { success?: unknown } | null | undefined)?.success ===
      false;
  const status = notSet ? 'error' : toolCall.status;
  const config = statusConfig[status];
  const StatusIcon = config.icon;
  const discarded = status === 'rejected' || notSet;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-lg border bg-muted/30 p-3 text-sm"
    >
      <div className="flex items-center gap-2">
        <ListChecksIcon className="size-4 text-muted-foreground shrink-0" />
        <span className="font-medium">Plan</span>
        {steps.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {steps.length} {steps.length === 1 ? 'step' : 'steps'}
          </span>
        )}
        <Badge
          variant="secondary"
          className={cn(
            'ml-auto gap-1 rounded-full text-xs shrink-0',
            status === 'executing' && 'animate-pulse',
          )}
        >
          <StatusIcon className={cn('size-3', config.color)} />
          {notSet ? 'Not set' : planStatusLabel[status]}
        </Badge>
      </div>
      {steps.length > 0 && (
        <ol
          className={cn(
            'mt-2 list-decimal space-y-0.5 pl-6 text-muted-foreground',
            discarded && 'line-through opacity-60',
          )}
        >
          {steps.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ol>
      )}
    </motion.div>
  );
}

export function ToolCallDisplay({
  toolCall,
  streamEvents,
}: {
  toolCall: ToolCallState;
  streamEvents?: RemoteExecuteStreamEvent[];
}) {
  if (toolCall.toolName === 'execute_remote_command') {
    return (
      <RemoteExecuteTerminal toolCall={toolCall} streamEvents={streamEvents} />
    );
  }
  if (toolCall.toolName === PLAN_TOOL) {
    return <PlanCallDisplay toolCall={toolCall} />;
  }

  const config = statusConfig[toolCall.status];
  const StatusIcon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-2 text-sm"
    >
      <WrenchIcon className="size-3.5 text-muted-foreground shrink-0" />
      <span className="font-medium truncate">
        {formatToolName(toolCall.toolName)}
      </span>
      <Badge
        variant="secondary"
        className={cn(
          'gap-1 rounded-full text-xs shrink-0',
          toolCall.status === 'executing' && 'animate-pulse',
        )}
      >
        <StatusIcon className={cn('size-3', config.color)} />
        {config.label}
      </Badge>
    </motion.div>
  );
}
