import { cn } from '@/lib/utils';
import type { UIMessage } from 'ai';
import {
  CheckCircle2,
  Circle,
  Loader2,
  Terminal,
  XCircle,
} from 'lucide-react';
import { memo, useEffect, useMemo, useRef } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToolCallEntry {
  toolCallId: string;
  toolName: string;
  status: 'pending' | 'executing' | 'completed' | 'error';
  input?: unknown;
  output?: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getToolStatus(state?: string): ToolCallEntry['status'] {
  if (!state) return 'pending';
  if (state === 'output-available' || state === 'result') return 'completed';
  if (state === 'output-error') return 'error';
  if (
    state === 'call' ||
    state === 'input-available' ||
    state === 'input-streaming'
  )
    return 'executing';
  return 'pending';
}

function extractToolCalls(messages: UIMessage[]): ToolCallEntry[] {
  const entries: ToolCallEntry[] = [];
  const seen = new Set<string>();

  for (const message of messages) {
    const parts = message.parts || [];
    for (const part of parts) {
      if (part.type === 'dynamic-tool' || part.type.startsWith('tool-')) {
        const tp = part as {
          toolCallId: string;
          toolName?: string;
          state?: string;
          input?: unknown;
          output?: unknown;
        };

        // Deduplicate by toolCallId, keep latest state
        if (seen.has(tp.toolCallId)) {
          const idx = entries.findIndex(
            (e) => e.toolCallId === tp.toolCallId,
          );
          if (idx >= 0) {
            entries[idx] = {
              ...entries[idx],
              status: getToolStatus(tp.state),
              output: tp.output,
            };
          }
          continue;
        }

        seen.add(tp.toolCallId);
        const effectiveToolName =
          part.type === 'dynamic-tool'
            ? tp.toolName || 'dynamic-tool'
            : part.type.replace(/^tool-/, '');

        entries.push({
          toolCallId: tp.toolCallId,
          toolName: effectiveToolName,
          status: getToolStatus(tp.state),
          input: tp.input,
          output: tp.output,
        });
      }
    }
  }

  return entries;
}

function formatToolName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_CONFIG = {
  pending: { icon: Circle, className: 'text-muted-foreground/40' },
  executing: { icon: Loader2, className: 'text-blue-500' },
  completed: { icon: CheckCircle2, className: 'text-green-500' },
  error: { icon: XCircle, className: 'text-red-500' },
} as const;

function ToolStatusIcon({ status }: { status: ToolCallEntry['status'] }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <Icon
      className={cn(
        'size-3.5 shrink-0',
        config.className,
        status === 'executing' && 'animate-spin',
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// ToolCallHistoryPanel
// ---------------------------------------------------------------------------

export const ToolCallHistoryPanel = memo(function ToolCallHistoryPanel({
  messages,
  onSelectToolCall,
}: {
  messages: UIMessage[];
  onSelectToolCall?: (toolCallId: string) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const toolCalls = useMemo(() => extractToolCalls(messages), [messages]);

  const completedCount = toolCalls.filter(
    (t) => t.status === 'completed',
  ).length;

  // Auto-scroll to bottom when new tool calls arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [toolCalls.length]);

  if (toolCalls.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-2 py-2 text-sm font-medium text-foreground shrink-0">
        <Terminal className="size-4" />
        <span>Tool Calls</span>
        <span className="text-muted-foreground/60 tabular-nums">
          {completedCount}/{toolCalls.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0">
        {toolCalls.map((tc) => (
          <button
            key={tc.toolCallId}
            type="button"
            onClick={() => onSelectToolCall?.(tc.toolCallId)}
            className="w-full text-left flex items-center gap-2 rounded-md px-2 py-1.5 text-xs cursor-pointer hover:bg-muted/50 transition-colors"
          >
            <ToolStatusIcon status={tc.status} />
            <span className="truncate text-foreground">
              {formatToolName(tc.toolName)}
            </span>
          </button>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
});
