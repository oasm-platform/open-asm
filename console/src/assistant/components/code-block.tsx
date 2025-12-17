import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { ComponentPropsWithoutRef } from 'react';

interface CodeBlockProps extends ComponentPropsWithoutRef<'div'> {
  language: string;
  value: string;
}

export function CodeBlock({
  language,
  value,
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
        'rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden my-4 w-full bg-zinc-50 dark:bg-zinc-950/50 shadow-sm',
        className,
      )}
      {...props}
    >
      <div className="flex items-center justify-between bg-zinc-100/50 dark:bg-zinc-900/50 px-4 py-2 border-b border-zinc-200 dark:border-zinc-800">
        <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
          {language || 'text'}
        </span>
        <button
          onClick={copyToClipboard}
          className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors bg-transparent hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 px-2 py-1 rounded-md"
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
      <div className="relative p-0 overflow-x-auto [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-zinc-200 dark:[&::-webkit-scrollbar-thumb]:bg-zinc-700 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-zinc-300 dark:hover:[&::-webkit-scrollbar-thumb]:bg-zinc-600 transition-colors">
        <pre className="p-4 text-sm font-mono leading-relaxed text-zinc-800 dark:text-zinc-200 whitespace-pre">
          {value}
        </pre>
      </div>
    </div>
  );
}
