import { Shimmer } from '@/components/ai-elements/shimmer';
import type { TextUIPart } from 'ai';
import type { ToolCallState } from '@/components/common/tool-call-display';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { MessageAction } from '@/components/ai-elements/message';
import { useT } from '@/lib/i18n-dictionary';

// ---------------------------------------------------------------------------
// Tool call status
// ---------------------------------------------------------------------------

// Match rejectionMessage() / TODO_REQUIRED_MESSAGE in core-api tools/helpers.ts
// (saved messages of the retired plan mode say the same)
const REJECTED_MARKER = 'was not approved by the user';
const PLAN_REQUIRED_MARKER = 'needs an approved plan first';

function outputError(output: unknown): string {
  if (!output || typeof output !== 'object') return '';
  const error = (output as { error?: unknown }).error;
  return typeof error === 'string' ? error : '';
}

export function getToolStatus(
  state?: string,
  output?: unknown,
): ToolCallState['status'] {
  if (!state) return 'pending';
  if (state === 'output-available' || state === 'result') {
    const error = outputError(output);
    if (error.includes(REJECTED_MARKER)) return 'rejected';
    if (error.includes(PLAN_REQUIRED_MARKER)) return 'needs-plan';
    return 'completed';
  }
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
  const t = useT();
  if (isStreaming || duration === 0) {
    return (
      <span className="inline-flex items-center gap-2 min-w-0">
        <Shimmer duration={1}>{t('agents.thinking.active')}</Shimmer>
      </span>
    );
  }
  if (duration === undefined) return <span>{t('agents.thinking.fewSeconds')}</span>;
  return <span>{t('agents.thinking.seconds', { duration })}</span>;
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
  const t = useT();
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
      label={copied ? t('agents.message.copied') : t('agents.message.copy')}
      tooltip={
        copied ? t('agents.message.copied') : t('agents.message.copyMessage')
      }
    >
      {copied ? (
        <CheckIcon className="size-3.5 text-green-500" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
    </MessageAction>
  );
}
