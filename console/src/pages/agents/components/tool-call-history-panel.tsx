import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { UIMessage } from 'ai';
import { ChevronDown, LocateFixed, Terminal } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { RemoteExecuteTerminal } from '@/components/common/remote-execute-terminal';
import {
  ToolCallLabel,
  type ToolCallState,
} from '@/components/common/tool-call-display';
import type { RemoteExecuteStreamEvent } from '@/hooks/use-remote-execute-stream';
import { getToolStatus } from './chat-helpers';
import { SIDE_PANEL_INDENT, SIDE_PANEL_ROW } from './side-panel-layout';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolCallEntry {
  toolCallId: string;
  toolName: string;
  status: ToolCallState['status'];
  input?: unknown;
  output?: unknown;
  /** Set when the call failed (state output-error) */
  errorText?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function extractToolCalls(messages: UIMessage[]): ToolCallEntry[] {
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
          errorText?: string;
        };

        // Deduplicate by toolCallId, keep latest state
        if (seen.has(tp.toolCallId)) {
          const idx = entries.findIndex(
            (e) => e.toolCallId === tp.toolCallId,
          );
          if (idx >= 0) {
            entries[idx] = {
              ...entries[idx],
              status: getToolStatus(tp.state, tp.output),
              output: tp.output,
              errorText: tp.errorText,
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
          status: getToolStatus(tp.state, tp.output),
          input: tp.input,
          output: tp.output,
          errorText: tp.errorText,
        });
      }
    }
  }

  return entries;
}

/** Longer values start cut: tool outputs can be megabytes */
const VALUE_PREVIEW_LENGTH = 2_000;

/** Shown as a terminal, as in the chat */
const COMMAND_TOOL = 'execute_remote_command';

/** Statuses a call never leaves: its input and output are final */
const FINAL_STATUSES = new Set<ToolCallEntry['status']>([
  'completed',
  'error',
  'rejected',
  'needs-plan',
]);

/**
 * A tool input or output as text: strings as they are, command output as
 * its streams, anything else as pretty JSON. Empty values give ''.
 */
function formatToolValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const { stdout, stderr } = value as { stdout?: unknown; stderr?: unknown };
    if (typeof stdout === 'string' || typeof stderr === 'string') {
      return [stdout, stderr]
        .filter((s): s is string => typeof s === 'string' && s.length > 0)
        .join('\n');
    }
    if (Object.keys(value).length === 0) return '';
  }
  return JSON.stringify(value, null, 2) ?? '';
}

function inputRecord(input: unknown): Record<string, unknown> | undefined {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : undefined;
}

// ---------------------------------------------------------------------------
// ToolCallDetail
// ---------------------------------------------------------------------------

function ToolValue({
  label,
  text,
  error = false,
}: {
  label: string;
  text: string;
  error?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > VALUE_PREVIEW_LENGTH;
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <pre
        className={cn(
          'max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted/60 p-3 font-mono text-xs',
          error && 'text-destructive',
        )}
      >
        {long && !expanded ? `${text.slice(0, VALUE_PREVIEW_LENGTH)}…` : text}
      </pre>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-primary underline-offset-2 hover:underline cursor-pointer"
        >
          {expanded
            ? 'Show less'
            : `Show all (${text.length.toLocaleString()} characters)`}
        </button>
      )}
    </div>
  );
}

/**
 * One tool call with its input and output (a command: its terminal, live
 * while it runs), shown until folded. A finished call only re-renders for
 * new terminal events: the chat stream rebuilds the newest message on every
 * chunk, and its big outputs would be formatted again each time.
 */
const ToolCallDetail = memo(
  function ToolCallDetail({
    entry,
    streamEvents,
    onSelect,
  }: {
    entry: ToolCallEntry;
    /** Live output of a remote command */
    streamEvents?: RemoteExecuteStreamEvent[];
    onSelect?: (toolCallId: string) => void;
  }) {
    const [open, setOpen] = useState(true);
    const isCommand = entry.toolName === COMMAND_TOOL;
    const input = useMemo(
      () => (isCommand ? '' : formatToolValue(entry.input)),
      [isCommand, entry.input],
    );
    const result = useMemo(
      () => (isCommand ? '' : formatToolValue(entry.errorText ?? entry.output)),
      [isCommand, entry.errorText, entry.output],
    );
    const running = !FINAL_STATUSES.has(entry.status);
    const failed = !!entry.errorText || entry.status === 'error';
    const toolCall: ToolCallState = {
      toolCallId: entry.toolCallId,
      toolName: entry.toolName,
      status: entry.status,
      input: inputRecord(entry.input),
      output: entry.output,
    };

    return (
      <Collapsible open={open} onOpenChange={setOpen}>
        {/* A side panel row: size-4 status icon first, like the other tabs;
            the fold chevron and the jump button trail */}
        <div className="flex items-center rounded-lg pr-1 transition-colors hover:bg-muted/50">
          <CollapsibleTrigger
            className={cn(
              SIDE_PANEL_ROW,
              'min-w-0 flex-1 items-center text-left cursor-pointer',
            )}
          >
            <ToolCallLabel
              toolCall={toolCall}
              className="min-w-0 flex-1 [&>svg]:mr-2.5 [&>svg]:size-4"
            />
            <ChevronDown
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
                !open && '-rotate-90',
              )}
            />
          </CollapsibleTrigger>
          {onSelect && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-muted-foreground hover:cursor-pointer"
              aria-label="Show in chat"
              title="Show in chat"
              onClick={() => onSelect(entry.toolCallId)}
            >
              <LocateFixed />
            </Button>
          )}
        </div>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <div className={cn('space-y-3 pt-1.5 pb-1 pr-2', SIDE_PANEL_INDENT)}>
            {isCommand ? (
              <RemoteExecuteTerminal
                toolCall={toolCall}
                streamEvents={streamEvents}
              />
            ) : (
              <>
                {input && <ToolValue label="Input" text={input} />}
                {result ? (
                  <ToolValue
                    label={failed ? 'Error' : 'Output'}
                    text={result}
                    error={failed}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {running ? 'Running…' : 'No output.'}
                  </p>
                )}
              </>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  },
  (prev, next) =>
    prev.onSelect === next.onSelect &&
    prev.streamEvents === next.streamEvents &&
    prev.entry.toolCallId === next.entry.toolCallId &&
    prev.entry.status === next.entry.status &&
    FINAL_STATUSES.has(next.entry.status),
);

// ---------------------------------------------------------------------------
// ToolCallHistoryPanel
// ---------------------------------------------------------------------------

export const ToolCallHistoryPanel = memo(function ToolCallHistoryPanel({
  messages,
  remoteExecuteEvents,
  onSelectToolCall,
  showHeader = true,
  className,
}: {
  messages: UIMessage[];
  /** Live output of remote commands, by tool call id */
  remoteExecuteEvents?: Map<string, RemoteExecuteStreamEvent[]>;
  onSelectToolCall?: (toolCallId: string) => void;
  /** False drops the title row, e.g. inside a tab that already names it */
  showHeader?: boolean;
  className?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  const toolCalls = useMemo(() => extractToolCalls(messages), [messages]);

  const completedCount = toolCalls.filter(
    (t) => t.status === 'completed',
  ).length;

  // Auto-scroll to bottom when new tool calls arrive. Scrolls the list only,
  // never the panel or page around it
  useEffect(() => {
    const list = listRef.current;
    list?.scrollTo?.({ top: list.scrollHeight, behavior: 'smooth' });
  }, [toolCalls.length]);

  if (toolCalls.length === 0) {
    return null;
  }

  return (
    // Lives in a side panel tab, which frames it: no card. The list scrolls
    // itself (to follow new calls) with the tab's padding inside the scroll
    <div className={cn('flex min-h-0 flex-col overflow-hidden', className)}>
      {showHeader && (
        <div className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-foreground shrink-0">
          <Terminal className="size-4" />
          <span>Tool Calls</span>
          <span className="text-muted-foreground/60 tabular-nums">
            {completedCount}/{toolCalls.length}
          </span>
        </div>
      )}
      <div
        ref={listRef}
        className="flex-1 min-h-0 space-y-3 overflow-y-auto px-3 py-4"
      >
        {toolCalls.map((tc) => (
          <ToolCallDetail
            key={tc.toolCallId}
            entry={tc}
            streamEvents={remoteExecuteEvents?.get(tc.toolCallId)}
            onSelect={onSelectToolCall}
          />
        ))}
      </div>
    </div>
  );
});
