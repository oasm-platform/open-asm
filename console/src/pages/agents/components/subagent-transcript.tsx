import { ToolCallLabel } from '@/components/common/tool-call-display';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  SubagentResponseDtoStatus,
  useAgentsControllerGetConversationSubagent,
  type SubagentDetailResponseDto,
  type SubagentResponseDto,
  type SubagentToolCallDto,
} from '@/services/apis/gen/queries';
import type { UIMessage } from 'ai';
import { ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChatMessage } from './chat-message';
import { formatTokens } from './turn-stats-panel';

/** How often the transcript of an open, running subagent is refetched. */
export const SUBAGENT_TRANSCRIPT_POLL_MS = 3_000;

/** A stored tool input/output back to its value; cut-off JSON stays text. */
function parseJson(text: string | null): unknown {
  if (text === null) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/** Pretty JSON when the text parses, else as is. */
function formatJson(text: string): string {
  const value = parseJson(text);
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

/** Tool input as an object, for the connector detail of the label. */
function inputRecord(text: string | null): Record<string, unknown> | undefined {
  const value = parseJson(text);
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** A finished tool call as the tool part the chat renders. */
function toolPart(call: SubagentToolCallDto): UIMessage['parts'][number] {
  const base = {
    type: 'dynamic-tool' as const,
    toolName: call.toolName,
    toolCallId: call.toolCallId,
    input: parseJson(call.input),
  };
  return call.error
    ? { ...base, state: 'output-error', errorText: call.error }
    : { ...base, state: 'output-available', output: parseJson(call.output) };
}

/**
 * The run as chat messages: the task from the main agent, then one assistant
 * message with each step's text and tool calls. `result` holds the final
 * answer uncut, so it stands in for the last step's (cut) text.
 */
export function toSubagentMessages(
  subagent: SubagentResponseDto,
  detail?: SubagentDetailResponseDto,
): UIMessage[] {
  const steps = detail?.transcript ?? [];
  const done = subagent.status === SubagentResponseDtoStatus.completed;
  const finalInLastStep =
    done && steps.length > 0 && !detail?.transcriptTruncated;

  const parts: UIMessage['parts'] = [];
  steps.forEach((step, i) => {
    const text =
      finalInLastStep && i === steps.length - 1 ? subagent.result : step.text;
    if (text?.trim()) parts.push({ type: 'text', text });
    parts.push(...step.toolCalls.map(toolPart));
  });
  if (done && !finalInLastStep && subagent.result) {
    parts.push({ type: 'text', text: subagent.result });
  }

  const messages: UIMessage[] = [
    {
      id: `${subagent.id}-task`,
      role: 'user',
      parts: [{ type: 'text', text: subagent.task }],
    },
  ];
  // A running one shows its thinking indicator even before its first step
  if (
    parts.length > 0 ||
    subagent.status === SubagentResponseDtoStatus.in_progress
  ) {
    messages.push({ id: `${subagent.id}-run`, role: 'assistant', parts });
  }
  return messages;
}

function ToolCallDetail({ call }: { call: SubagentToolCallDto }) {
  const [open, setOpen] = useState(false);
  const result = call.error ?? call.output;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-1 rounded px-1 py-1 text-left hover:bg-muted/50 cursor-pointer">
        <ChevronRight
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-90',
          )}
        />
        {/* Steps are saved once they end, so every call has finished */}
        <ToolCallLabel
          toolCall={{
            toolCallId: call.toolCallId,
            toolName: call.toolName,
            status: call.error ? 'error' : 'completed',
            input: inputRecord(call.input),
          }}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-1.5 py-1 pl-5 text-xs">
        {call.input && (
          <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/50 p-2">
            {formatJson(call.input)}
          </pre>
        )}
        {result && (
          <pre
            className={cn(
              'max-h-60 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/50 p-2',
              call.error && 'text-destructive',
            )}
          >
            {formatJson(result)}
          </pre>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * A pill toggle rather than the underlined tabs: it sits inside a side panel
 * tab, whose own tab bar already uses those.
 */
const SEGMENT =
  'h-6 rounded-md px-2.5 text-xs data-[state=active]:bg-background data-[state=active]:shadow-xs data-[state=active]:after:hidden';

interface SubagentTranscriptProps {
  subagent: SubagentResponseDto;
  conversationId: string;
}

/**
 * A subagent run as a conversation, with the list of its tool calls. Mounted
 * only while its row is open, so the transcript loads (and, while the run is
 * active, polls) only then.
 */
export function SubagentTranscript({
  subagent,
  conversationId,
}: SubagentTranscriptProps) {
  const [tab, setTab] = useState('conversation');
  const running = subagent.status === SubagentResponseDtoStatus.in_progress;
  const active =
    running || subagent.status === SubagentResponseDtoStatus.pending;

  const { data: detail, refetch } = useAgentsControllerGetConversationSubagent(
    conversationId,
    subagent.id,
    {
      query: {
        refetchInterval: active ? SUBAGENT_TRANSCRIPT_POLL_MS : false,
      },
    },
  );

  // The last steps are saved before the status changes: fetch them then
  const lastStatus = useRef(subagent.status);
  useEffect(() => {
    if (lastStatus.current === subagent.status) return;
    lastStatus.current = subagent.status;
    void refetch();
  }, [subagent.status, refetch]);

  const messages = useMemo(
    () => toSubagentMessages(subagent, detail),
    [subagent, detail],
  );
  const calls = useMemo(
    () => detail?.transcript.flatMap((step) => step.toolCalls) ?? [],
    [detail],
  );
  const truncated = detail?.transcriptTruncated ?? false;
  // Status and run time are on the row above
  const stats = subagent.stats && [
    `${subagent.stats.steps} steps`,
    `${formatTokens(subagent.stats.inputTokens)} ↑ · ${formatTokens(subagent.stats.outputTokens)} ↓`,
  ];

  return (
    <Tabs value={tab} onValueChange={setTab} className="gap-3">
      <div className="flex items-center gap-3">
        <TabsList className="h-7 gap-0.5 rounded-lg bg-muted p-0.5">
          <TabsTrigger value="conversation" className={SEGMENT}>
            Conversation
          </TabsTrigger>
          <TabsTrigger value="tools" className={SEGMENT}>
            Tool calls{calls.length > 0 && ` (${calls.length})`}
          </TabsTrigger>
        </TabsList>
        {stats && (
          <span className="ml-auto truncate text-xs tabular-nums text-muted-foreground">
            {stats.join(' · ')}
          </span>
        )}
      </div>

      <TabsContent value="conversation" className="flex flex-col gap-5">
        {truncated && (
          <p className="text-xs text-muted-foreground">
            Only the first steps were recorded: the transcript reached its size
            limit.
          </p>
        )}
        {messages.map((message, i) => (
          <ChatMessage
            key={message.id}
            message={message}
            idx={i}
            messagesLength={messages.length}
            isStreaming={running}
          />
        ))}
        {subagent.status === SubagentResponseDtoStatus.pending && (
          <p className="text-sm text-muted-foreground">
            Queued, waiting for a free slot…
          </p>
        )}
        {subagent.status === SubagentResponseDtoStatus.cancelled && (
          <p className="text-sm text-muted-foreground">
            Cancelled when the conversation was stopped.
          </p>
        )}
        {subagent.error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm whitespace-pre-wrap text-destructive">
            {subagent.error}
          </div>
        )}
      </TabsContent>

      {/* -ml-1 cancels the rows' px-1 so their chevrons line up with the
          toggle above */}
      <TabsContent value="tools" className="-ml-1">
        {calls.length === 0 ? (
          <p className="px-1 text-sm text-muted-foreground">
            {active ? 'No tool calls yet.' : 'No tool calls recorded.'}
          </p>
        ) : (
          calls.map((call) => (
            <ToolCallDetail key={call.toolCallId} call={call} />
          ))
        )}
        {truncated && (
          <p className="px-1 pt-2 text-xs text-muted-foreground">
            Later tool calls were not recorded.
          </p>
        )}
      </TabsContent>
    </Tabs>
  );
}
