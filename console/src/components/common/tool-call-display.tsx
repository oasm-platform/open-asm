import { useT } from '@/lib/i18n-dictionary';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  BanIcon,
  CheckCircleIcon,
  CircleIcon,
  ClockIcon,
  ListChecksIcon,
  Loader2Icon,
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
    /** Refused until the user approves a plan (Agent mode) */
    | 'needs-plan';
  input?: Record<string, unknown>;
  output?: unknown;
}

const statusConfig: Record<
  ToolCallState['status'],
  { labelKey: string; icon: typeof CheckCircleIcon; color: string }
> = {
  pending: { labelKey: 'components.toolCall.status.pending', icon: CircleIcon, color: 'text-muted-foreground' },
  executing: { labelKey: 'components.toolCall.status.running', icon: ClockIcon, color: 'text-blue-500' },
  completed: { labelKey: 'components.toolCall.status.done', icon: CheckCircleIcon, color: 'text-green-500' },
  error: { labelKey: 'common.error', icon: XCircleIcon, color: 'text-red-500' },
  rejected: { labelKey: 'components.toolCall.status.rejected', icon: BanIcon, color: 'text-amber-500' },
  'needs-plan': {
    labelKey: 'components.toolCall.status.needsPlan',
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
  pending: 'components.toolCall.plan.planning',
  executing: 'components.toolCall.plan.planning',
  completed: 'components.toolCall.plan.ready',
  error: 'common.error',
  rejected: 'components.toolCall.plan.notApproved',
  'needs-plan': 'components.toolCall.status.needsPlan',
};

/** A plan rendered in the chat, so the user sees it as soon as it is made. */
function PlanCallDisplay({ toolCall }: { toolCall: ToolCallState }) {
  const t = useT();
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
      className="rounded-xl border bg-card p-3 text-sm shadow-xs"
    >
      <div className="flex items-center gap-2">
        <ListChecksIcon className="size-4 text-muted-foreground shrink-0" />
        <span className="font-medium">{t('components.toolCall.plan.title')}</span>
        {steps.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {t('components.toolCall.plan.steps', { count: steps.length })}
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
          {t(notSet ? 'components.toolCall.plan.notSet' : planStatusLabel[status])}
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <ToolCallLabel toolCall={toolCall} />
    </motion.div>
  );
}

/** Name color per status; completed keeps the surrounding text color */
const labelTextClass: Record<ToolCallState['status'], string | undefined> = {
  pending: 'tool-call-running',
  executing: 'tool-call-running',
  completed: undefined,
  error: 'text-red-500',
  rejected: 'text-amber-500',
  'needs-plan': 'text-amber-500',
};

/** Leading icon per status: a neutral wrench once done, so only problems stand out */
const labelIcon: Record<
  ToolCallState['status'],
  { icon: typeof CheckCircleIcon; className: string }
> = {
  pending: { icon: Loader2Icon, className: 'animate-spin text-muted-foreground' },
  executing: {
    icon: Loader2Icon,
    className: 'animate-spin text-muted-foreground',
  },
  completed: { icon: WrenchIcon, className: 'text-muted-foreground/70' },
  error: { icon: XCircleIcon, className: 'text-red-500' },
  rejected: { icon: BanIcon, className: 'text-amber-500' },
  'needs-plan': { icon: ListChecksIcon, className: 'text-amber-500' },
};

/**
 * What a call is about, after its name: the connector slug and target of
 * run_tool_connector ("nuclei example.com"), or the subagent and objective
 * of dispatch_subagent ("@recon · Map api.example.com").
 */
function toolCallDetail(toolCall: ToolCallState): string | null {
  const input = toolCall.input ?? {};
  if (toolCall.toolName === 'run_tool_connector') {
    const detail = [input.tool, input.target]
      .filter((value) => typeof value === 'string' && value)
      .join(' ');
    return detail || null;
  }
  if (toolCall.toolName === 'dispatch_subagent') {
    const name = typeof input.name === 'string' ? `@${input.name}` : '';
    const objective =
      typeof input.objective === 'string' ? input.objective : '';
    return [name, objective].filter(Boolean).join(' · ') || null;
  }
  if (toolCall.toolName === 'continue_subagent') {
    return typeof input.message === 'string' ? input.message : null;
  }
  return null;
}

/** One-line label of a tool call: the name, colored by its status. */
export function ToolCallLabel({
  toolCall,
  className,
}: {
  toolCall: ToolCallState;
  className?: string;
}) {
  const t = useT();
  const config = statusConfig[toolCall.status];
  const detail = toolCallDetail(toolCall);
  const { icon: Icon, className: iconClassName } = labelIcon[toolCall.status];

  return (
    <div
      className={cn('flex min-w-0 items-center text-sm', className)}
      title={t(config.labelKey)}
    >
      <Icon
        aria-hidden="true"
        className={cn('mr-2 size-3.5 shrink-0', iconClassName)}
      />
      <span
        className={cn(
          'font-medium truncate',
          detail && 'shrink-0',
          labelTextClass[toolCall.status],
        )}
      >
        {formatToolName(toolCall.toolName)}
      </span>
      {detail && (
        <span
          className="ml-1.5 truncate text-xs text-muted-foreground"
          title={detail}
        >
          {detail}
        </span>
      )}
      <span className="sr-only"> ({t(config.labelKey)})</span>
    </div>
  );
}
