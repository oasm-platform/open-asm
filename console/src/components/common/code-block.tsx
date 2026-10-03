import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { ComponentPropsWithoutRef } from 'react';

interface CodeBlockProps extends ComponentPropsWithoutRef<'div'> {
  language?: string;
  value: string;
  /** Number the lines in a gutter. Off by default. */
  showLine?: boolean;
}

export function CodeBlock({
  language,
  value,
  showLine = false,
  className,
  ...props
}: CodeBlockProps) {
  const [isCopied, setIsCopied] = useState(false);

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
      <div className="relative p-0">
        {/* The gutter is a separate pre with the same line height as the code,
            so the numbers stay aligned however the text wraps. */}
        {showLine ? (
          <div className="flex text-sm font-mono leading-relaxed">
            <span
              aria-hidden
              className="shrink-0 self-stretch whitespace-pre border-r bg-muted/40 px-3 py-4 text-right text-muted-foreground"
            >
              {value.split('\n').map((_, i) => i + 1).join('\n')}
            </span>
            <pre className="min-w-0 flex-1 whitespace-pre-wrap break-all p-4">
              {value}
            </pre>
          </div>
        ) : (
          <pre className="whitespace-pre-wrap break-all p-4 font-mono text-sm leading-relaxed">
            {value}
          </pre>
        )}
      </div>
    </div>
  );
}
