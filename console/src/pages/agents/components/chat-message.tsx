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
import { ToolCallDisplay } from '@/components/common/tool-call-display';
import type { RemoteExecuteStreamEvent } from '@/hooks/use-remote-execute-stream';
import type { UIMessage } from 'ai';
import { motion } from 'framer-motion';
import { memo, useMemo } from 'react';
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
}

type RenderItem =
  | { kind: 'reasoning'; text: string; isStreaming: boolean }
  | {
      kind: 'tool';
      toolCallId: string;
      toolName: string;
      state: string;
      input?: unknown;
      output?: unknown;
    }
  | { kind: 'text'; text: string }
  | { kind: 'generating' }
  | { kind: 'initial-thinking' };

// ---------------------------------------------------------------------------
// ChatMessage
// ---------------------------------------------------------------------------

export const ChatMessage = memo(function ChatMessage({
  message,
  idx,
  messagesLength,
  isStreaming,
  remoteExecuteEvents,
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
            state: getToolStatus(tp.state),
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

    return items;
  }, [parts, isReasoningStreaming, showGenerating, showInitialThinking]);

  return (
    <Message from={message.role}>
      <MessageContent expandable={message.role === 'user'}>
        <div className="flex flex-col w-full gap-1.5">
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
                    <ReasoningContent>{item.text}</ReasoningContent>
                  </Reasoning>
                );
              case 'tool':
                return (
                  <div
                    key={item.toolCallId}
                    id={`tool-call-${item.toolCallId}`}
                  >
                    <ToolCallDisplay
                      toolCall={{
                        toolCallId: item.toolCallId,
                        toolName: item.toolName,
                        status: item.state as
                          | 'pending'
                          | 'executing'
                          | 'completed'
                          | 'error',
                        input: item.input as
                          | Record<string, unknown>
                          | undefined,
                        output: item.output,
                      }}
                      streamEvents={remoteExecuteEvents?.get(item.toolCallId)}
                    />
                  </div>
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

      {/* Copy button — only appears after streaming finishes */}
      {message.role === 'assistant' && hasContent && !isStreamingActive && (
        <MessageActions>
          <CopyButton text={textContent} />
        </MessageActions>
      )}
    </Message>
  );
});
