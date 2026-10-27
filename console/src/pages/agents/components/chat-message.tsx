import {
  Message,
  MessageActions,
  MessageContent,
} from '@/components/ai-elements/message';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning';
import { Markdown } from '@/components/common/markdown';
import {
  ToolCallDisplay,
  ToolCallLabel,
  type ToolCallState,
} from '@/components/common/tool-call-display';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { RemoteExecuteStreamEvent } from '@/hooks/use-remote-execute-stream';
import type { UIMessage } from 'ai';
import { motion } from 'framer-motion';
import { ChevronRightIcon } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import {
  CopyButton,
  getTextContent,
  getToolStatus,
  ThinkingLabel,
  TypingDots,
} from './chat-helpers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessageProps {
  message: UIMessage;
  idx: number;
  messagesLength: number;
  isStreaming: boolean;
  remoteExecuteEvents?: Map<string, RemoteExecuteStreamEvent[]>;
  /** Tool call picked in the sidebar; its group expands so it can be scrolled to */
  selectedToolCallId?: string | null;
}

interface ToolItem {
  kind: 'tool';
  toolCallId: string;
  toolName: string;
  state: string;
  input?: unknown;
  output?: unknown;
}

type RenderItem =
  | { kind: 'reasoning'; text: string; isStreaming: boolean }
  | ToolItem
  | { kind: 'tool-group'; tools: ToolItem[] }
  | { kind: 'text'; text: string }
  | { kind: 'generating' }
  | { kind: 'initial-thinking' };

/** Plans stay visible on their own rather than folded into a group */
const UNGROUPED_TOOLS = new Set(['formulate_plan']);

/** Fold runs of two or more adjacent tool calls into one group */
function groupToolCalls(items: RenderItem[]): RenderItem[] {
  const result: RenderItem[] = [];
  let run: ToolItem[] = [];
  const flush = () => {
    if (run.length > 1) result.push({ kind: 'tool-group', tools: run });
    else result.push(...run);
    run = [];
  };
  for (const item of items) {
    if (item.kind === 'tool' && !UNGROUPED_TOOLS.has(item.toolName)) {
      run.push(item);
    } else {
      flush();
      result.push(item);
    }
  }
  flush();
  return result;
}

function toToolCallState(item: ToolItem): ToolCallState {
  return {
    toolCallId: item.toolCallId,
    toolName: item.toolName,
    status: item.state as ToolCallState['status'],
    input: item.input as Record<string, unknown> | undefined,
    output: item.output,
  };
}

function ToolCallItem({
  item,
  remoteExecuteEvents,
  selectedToolCallId,
}: {
  item: ToolItem;
  remoteExecuteEvents?: Map<string, RemoteExecuteStreamEvent[]>;
  selectedToolCallId?: string | null;
}) {
  return (
    // Picked in the side panel: briefly tinted so it stands out once
    // scrolled to (a tint, not a ring, which a folded group's overflow
    // would clip)
    <div
      id={`tool-call-${item.toolCallId}`}
      className={cn(
        '-ml-1.5 rounded-md pl-1.5 transition-colors duration-700',
        selectedToolCallId === item.toolCallId && 'bg-primary/10',
      )}
    >
      <ToolCallDisplay
        toolCall={toToolCallState(item)}
        streamEvents={remoteExecuteEvents?.get(item.toolCallId)}
      />
    </div>
  );
}

/** Adjacent tool calls collapsed to the latest one's label */
function ToolCallGroup({
  tools,
  remoteExecuteEvents,
  selectedToolCallId,
}: {
  tools: ToolItem[];
  remoteExecuteEvents?: Map<string, RemoteExecuteStreamEvent[]>;
  selectedToolCallId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  // Expand during render (not in an effect) so the selected call is already
  // in the DOM when the conversation scrolls to it
  if (
    selectedToolCallId &&
    selectedToolCallId !== revealed &&
    tools.some((t) => t.toolCallId === selectedToolCallId)
  ) {
    setRevealed(selectedToolCallId);
    setOpen(true);
  }

  const latest = tools[tools.length - 1];

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex max-w-full min-w-0 items-center gap-2 rounded-md text-left text-muted-foreground transition-colors hover:text-foreground cursor-pointer">
        <ToolCallLabel toolCall={toToolCallState(latest)} />
        <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[11px] font-medium tabular-nums">
          {tools.length} tool calls
        </span>
        <ChevronRightIcon
          className={cn(
            'size-3.5 shrink-0 transition-transform duration-200',
            open && 'rotate-90',
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="mt-2 ml-1.5 flex flex-col gap-2 border-l pl-3.5">
          {tools.map((item) => (
            <ToolCallItem
              key={item.toolCallId}
              item={item}
              remoteExecuteEvents={remoteExecuteEvents}
              selectedToolCallId={selectedToolCallId}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// ChatMessage
// ---------------------------------------------------------------------------

export const ChatMessage = memo(function ChatMessage({
  message,
  idx,
  messagesLength,
  isStreaming,
  remoteExecuteEvents,
  selectedToolCallId,
}: ChatMessageProps) {
  const textContent = getTextContent(message);
  const hasContent = textContent.length > 0;
  const isLastAssistant =
    message.role === 'assistant' && idx === messagesLength - 1;
  const isStreamingActive = isLastAssistant && isStreaming;

  const parts = useMemo(() => message.parts || [], [message.parts]);
  const lastPart = parts.at(-1);

  // Show "Thinking" shimmer when streaming starts but no parts yet
  const showInitialThinking = isStreamingActive && parts.length === 0;

  // Reasoning is actively streaming if the last part is a reasoning part
  const isReasoningStreaming =
    isStreamingActive && lastPart?.type === 'reasoning';

  // Show "Generating" when streaming but no text content yet
  const showGenerating =
    isStreamingActive &&
    !hasContent &&
    !showInitialThinking &&
    !isReasoningStreaming;

  const renderItems = useMemo(() => {
    const items: RenderItem[] = [];

    // Group consecutive reasoning parts into a single reasoning block
    let pendingReasoning = '';
    const flushReasoning = (streaming: boolean) => {
      if (pendingReasoning.trim()) {
        items.push({
          kind: 'reasoning',
          text: pendingReasoning,
          isStreaming: streaming,
        });
        pendingReasoning = '';
      }
    };

    for (const part of parts) {
      if (part.type === 'reasoning' && 'text' in part) {
        pendingReasoning +=
          (pendingReasoning ? '\n\n' : '') + (part as { text: string }).text;
      } else {
        // Flush any accumulated reasoning before non-reasoning part
        flushReasoning(false);

        if (part.type === 'text' && 'text' in part) {
          const text = (part as { text: string }).text;
          if (text.trim()) {
            items.push({ kind: 'text', text });
          }
        } else if (
          part.type === 'dynamic-tool' ||
          part.type.startsWith('tool-')
        ) {
          const tp = part as {
            toolCallId: string;
            toolName?: string;
            state?: string;
            input?: unknown;
            output?: unknown;
          };
          const effectiveToolName =
            part.type === 'dynamic-tool'
              ? tp.toolName || 'dynamic-tool'
              : part.type.replace(/^tool-/, '');
          items.push({
            kind: 'tool',
            toolCallId: tp.toolCallId,
            toolName: effectiveToolName,
            state: getToolStatus(tp.state, tp.output),
            input: tp.input,
            output: tp.output,
          });
        }
      }
    }
    // Flush any trailing reasoning
    const lastReasoningPart = [...parts]
      .reverse()
      .find((p) => p.type === 'reasoning');
    const isTrailingReasoning =
      isReasoningStreaming && lastReasoningPart && pendingReasoning.trim();
    flushReasoning(!!isTrailingReasoning);

    // Append streaming indicators
    if (showInitialThinking) {
      items.push({ kind: 'initial-thinking' });
    } else if (showGenerating) {
      items.push({ kind: 'generating' });
    }

    return groupToolCalls(items);
  }, [parts, isReasoningStreaming, showGenerating, showInitialThinking]);

  return (
    // Fades up into place once, when it first renders
    <Message
      from={message.role}
      className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300"
    >
      <MessageContent expandable={message.role === 'user'}>
        <div className="flex flex-col w-full gap-2.5">
          {renderItems.map((item, i) => {
            switch (item.kind) {
              case 'reasoning':
                return (
                  <Reasoning
                    key={`reasoning-${i}`}
                    className="w-full [&_.italic]:hidden [&_em]:hidden [&_i]:hidden"
                    isStreaming={item.isStreaming}
                  >
                    <ReasoningTrigger
                      getThinkingMessage={(s, d) => (
                        <ThinkingLabel isStreaming={s} duration={d} />
                      )}
                    />
                    <ReasoningContent className="mt-2 border-l-2 pl-3.5">
                      {item.text}
                    </ReasoningContent>
                  </Reasoning>
                );
              case 'tool':
                return (
                  <ToolCallItem
                    key={item.toolCallId}
                    item={item}
                    remoteExecuteEvents={remoteExecuteEvents}
                    selectedToolCallId={selectedToolCallId}
                  />
                );
              case 'tool-group':
                return (
                  <ToolCallGroup
                    key={`tool-group-${item.tools[0].toolCallId}`}
                    tools={item.tools}
                    remoteExecuteEvents={remoteExecuteEvents}
                    selectedToolCallId={selectedToolCallId}
                  />
                );
              case 'text':
                return (
                  <div key={`text-${i}`} className="w-full">
                    <Markdown
                      content={item.text}
                      preview={false}
                      className="text-base"
                    />
                  </div>
                );
              case 'generating':
                return (
                  <motion.div
                    key="generating"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-2 text-muted-foreground text-sm select-none"
                  >
                    <TypingDots />
                  </motion.div>
                );
              case 'initial-thinking':
                return (
                  <Reasoning
                    key="initial-thinking"
                    isStreaming
                    className="w-full [&_.italic]:hidden [&_em]:hidden [&_i]:hidden"
                  >
                    <ReasoningTrigger
                      getThinkingMessage={(s, d) => (
                        <ThinkingLabel isStreaming={s} duration={d} />
                      )}
                    />
                    <ReasoningContent>{''}</ReasoningContent>
                  </Reasoning>
                );
            }
          })}

          {/* Streaming indicator — inline dots while generating text */}
          {isStreamingActive && hasContent && (
            <div className="flex items-center gap-1.5 text-muted-foreground text-sm select-none">
              <TypingDots />
            </div>
          )}
        </div>
      </MessageContent>

      {/* Copy button — only appears after streaming finishes. Older answers
          show it on hover (always on touch screens), the latest one always */}
      {message.role === 'assistant' && hasContent && !isStreamingActive && (
        <MessageActions
          className={cn(
            'mt-0 px-2 transition-opacity duration-200',
            !isLastAssistant &&
              'md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100',
          )}
        >
          <CopyButton text={textContent} />
        </MessageActions>
      )}
    </Message>
  );
});
