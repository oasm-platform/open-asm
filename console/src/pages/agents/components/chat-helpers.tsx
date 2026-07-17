import { Shimmer } from '@/components/ai-elements/shimmer';
import type { TextUIPart } from 'ai';
import type { ToolCallState } from '@/components/common/tool-call-display';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { MessageAction } from '@/components/ai-elements/message';

// ---------------------------------------------------------------------------
// Tool call status
// ---------------------------------------------------------------------------

export function getToolStatus(state?: string): ToolCallState['status'] {
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

// ---------------------------------------------------------------------------
// Text content extraction
// ---------------------------------------------------------------------------

export function getTextContent(message: { parts?: Array<{ type: string; text?: string }> }): string {
  const partsText = (message.parts || [])
    .filter((part): part is TextUIPart => part.type === 'text')
    .map((part) => part.text)
    .join('');
  return partsText || '';
}

// ---------------------------------------------------------------------------
// ThinkingLabel
// ---------------------------------------------------------------------------

export function ThinkingLabel({
  isStreaming,
  duration,
}: {
  isStreaming: boolean;
  duration?: number;
}) {
  if (isStreaming || duration === 0) {
    return (
      <span className="inline-flex items-center gap-2 min-w-0">
        <Shimmer duration={1}>Thinking</Shimmer>
      </span>
    );
  }
  if (duration === undefined) return <span>Thought for a few seconds</span>;
  return <span>Thought for {duration} seconds</span>;
}

// ---------------------------------------------------------------------------
// TypingDots — animated dots for streaming indicator
// ---------------------------------------------------------------------------

export function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1 rounded-full bg-muted-foreground"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{
            duration: 1,
            repeat: Infinity,
            delay: i * 0.2,
            ease: 'easeInOut',
          }}
        />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// CopyButton
// ---------------------------------------------------------------------------

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <MessageAction
      onClick={handleCopy}
      label={copied ? 'Copied!' : 'Copy'}
      tooltip={copied ? 'Copied!' : 'Copy message'}
    >
      {copied ? (
        <CheckIcon className="size-3.5 text-green-500" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
    </MessageAction>
  );
}
