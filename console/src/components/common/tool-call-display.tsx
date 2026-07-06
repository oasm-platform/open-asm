import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  CheckCircleIcon,
  CircleIcon,
  ClockIcon,
  WrenchIcon,
  XCircleIcon,
} from 'lucide-react';
import { motion } from 'framer-motion';
import type { RemoteExecuteStreamEvent } from '@/hooks/use-remote-execute-stream';
import { RemoteExecuteTerminal } from './remote-execute-terminal';

export interface ToolCallState {
  toolCallId: string;
  toolName: string;
  status: 'pending' | 'executing' | 'completed' | 'error';
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
};

function formatToolName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
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
