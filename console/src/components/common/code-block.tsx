import { Check, Copy, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { ComponentPropsWithoutRef } from 'react';

export interface SensitiveValue {
  value: string;
  replace: string;
}

interface CodeBlockProps extends ComponentPropsWithoutRef<'div'> {
  language?: string;
  value: string;
  /** Number the lines in a gutter. Off by default. */
  showLine?: boolean;
  /**
   * Secrets shown as their `replace` text until revealed with the eye button.
   * Copy always gives the real value.
   */
  sensitive?: SensitiveValue[];
}

const maskSensitive = (text: string, sensitive: SensitiveValue[]): string =>
  sensitive.reduce(
    // An empty value would match between every character, so it is skipped.
    (masked, { value, replace }) =>
      value ? masked.split(value).join(replace) : masked,
    text,
  );

export function CodeBlock({
  language,
  value,
  showLine = false,
  sensitive,
  className,
  ...props
}: CodeBlockProps) {
  const [isCopied, setIsCopied] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);

  const hasSensitive = !!sensitive?.length;
  const displayValue =
    hasSensitive && !isRevealed ? maskSensitive(value, sensitive) : value;

  const copyToClipboard = async () => {
    if (!navigator.clipboard) return;
    await navigator.clipboard.writeText(value);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        'w-full overflow-hidden rounded-lg border bg-background shadow-sm',
        className,
      )}
      {...props}
    >
      <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {language || 'text'}
        </span>
        <div className="flex items-center gap-1">
          {hasSensitive && (
            <button
              type="button"
              onClick={() => setIsRevealed((revealed) => !revealed)}
              aria-label={
                isRevealed ? 'Hide sensitive values' : 'Show sensitive values'
              }
              aria-pressed={isRevealed}
              title={isRevealed ? 'Hide' : 'Show'}
              className="flex items-center rounded-md bg-transparent px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {isRevealed ? (
                <EyeOff className="w-3.5 h-3.5" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
            </button>
          )}
          <button
            onClick={copyToClipboard}
            className="flex items-center gap-1.5 rounded-md bg-transparent px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {isCopied ? (
              <>
                <Check className="w-3.5 h-3.5 text-green-500" />
                <span className="text-green-500">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>
      <div className="relative p-0">
        {/* The gutter is a separate pre with the same line height as the code,
            so the numbers stay aligned however the text wraps. */}
        {showLine ? (
          <div className="flex text-sm font-mono leading-relaxed">
            <span
              aria-hidden
              className="shrink-0 self-stretch whitespace-pre border-r bg-muted/40 px-3 py-4 text-right text-muted-foreground"
            >
              {displayValue.split('\n').map((_, i) => i + 1).join('\n')}
            </span>
            <pre className="min-w-0 flex-1 whitespace-pre-wrap break-all p-4">
              {displayValue}
            </pre>
          </div>
        ) : (
          <pre className="whitespace-pre-wrap break-all p-4 font-mono text-sm leading-relaxed">
            {displayValue}
          </pre>
        )}
      </div>
    </div>
  );
}
