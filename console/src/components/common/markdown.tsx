import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { CodeBlock } from './code-block';
import type { ComponentPropsWithoutRef } from 'react';

interface MarkdownProps {
  content: string;
  className?: string;
  preview?: boolean;
}

export function Markdown({ content, className, preview }: MarkdownProps) {
  const components: Record<string, React.ElementType> = preview
    ? {
        p: (props: ComponentPropsWithoutRef<'p'>) => <span {...props} />,
        h1: (props: ComponentPropsWithoutRef<'h1'>) => (
          <span className="font-bold" {...props} />
        ),
        h2: (props: ComponentPropsWithoutRef<'h2'>) => (
          <span className="font-bold" {...props} />
        ),
        h3: (props: ComponentPropsWithoutRef<'h3'>) => (
          <span className="font-bold" {...props} />
        ),
        h4: (props: ComponentPropsWithoutRef<'h4'>) => (
          <span className="font-bold" {...props} />
        ),
        ul: (props: ComponentPropsWithoutRef<'ul'>) => (
          <span className="ml-2" {...props} />
        ),
        ol: (props: ComponentPropsWithoutRef<'ol'>) => (
          <span className="ml-2" {...props} />
        ),
        li: (props: ComponentPropsWithoutRef<'li'>) => (
          <span className="mr-2" {...props} />
        ),
        code: (props: ComponentPropsWithoutRef<'code'>) => (
          <code
            className="bg-muted px-1 py-0.5 rounded text-[11px] font-mono"
            {...props}
          />
        ),
      }
    : {
        h1: (props: ComponentPropsWithoutRef<'h1'>) => (
          <h1
            className="text-xl font-bold border-b pb-2 mb-4 mt-6"
            {...props}
          />
        ),
        h2: (props: ComponentPropsWithoutRef<'h2'>) => (
          <h2
            className="text-lg font-bold border-b pb-1 mb-3 mt-5"
            {...props}
          />
        ),
        h3: (props: ComponentPropsWithoutRef<'h3'>) => (
          <h3 className="text-base font-bold mb-2 mt-4" {...props} />
        ),
        h4: (props: ComponentPropsWithoutRef<'h4'>) => (
          <h4 className="text-sm font-bold mb-2 mt-3" {...props} />
        ),
        p: (props: ComponentPropsWithoutRef<'p'>) => (
          <p className="mb-4 last:mb-0" {...props} />
        ),
        ul: (props: ComponentPropsWithoutRef<'ul'>) => (
          <ul className="list-disc pl-6 mb-4 space-y-1" {...props} />
        ),
        ol: (props: ComponentPropsWithoutRef<'ol'>) => (
          <ol className="list-decimal pl-6 mb-4 space-y-1" {...props} />
        ),
        blockquote: (props: ComponentPropsWithoutRef<'blockquote'>) => (
          <blockquote
            className="border-l-4 border-muted pl-4 italic my-4"
            {...props}
          />
        ),
        a: ({ ...props }: ComponentPropsWithoutRef<'a'>) => (
          <a
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline font-medium break-all"
            {...props}
          />
        ),
        table: ({ ...props }: ComponentPropsWithoutRef<'table'>) => (
          <div className="my-4 w-full overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm" {...props} />
          </div>
        ),
        thead: ({ ...props }: ComponentPropsWithoutRef<'thead'>) => (
          <thead
            className="bg-zinc-100/50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800"
            {...props}
          />
        ),
        tbody: ({ ...props }: ComponentPropsWithoutRef<'tbody'>) => (
          <tbody className="[&_tr:last-child]:border-0" {...props} />
        ),
        tr: ({ ...props }: ComponentPropsWithoutRef<'tr'>) => (
          <tr
            className="border-b border-zinc-100 dark:border-zinc-800/50 transition-colors hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50"
            {...props}
          />
        ),
        th: ({ ...props }: ComponentPropsWithoutRef<'th'>) => (
          <th
            className="h-10 px-4 text-left align-middle font-medium text-zinc-500 dark:text-zinc-400"
            {...props}
          />
        ),
        td: ({ ...props }: ComponentPropsWithoutRef<'td'>) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { style: _style, ...rest } = props;
          return (
            <td
              className="p-4 align-middle [&:has([role=checkbox])]:pr-0 text-zinc-700 dark:text-zinc-300"
              {...rest}
            />
          );
        },
        code: ({
          className,
          children,
          inline,
          ...props
        }: ComponentPropsWithoutRef<'code'> & {
          inline?: boolean;
        }) => {
          const match = /language-(\w+)/.exec(className || '');
          const value = String(children).replace(/\n$/, '');

          if (!inline && (match || value.includes('\n'))) {
            return (
              <CodeBlock language={match ? match[1] : 'text'} value={value} />
            );
          }

          return (
            <code
              className={cn(
                'bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-sm font-mono text-pink-600 dark:text-pink-400',
                className,
              )}
              {...props}
            >
              {children}
            </code>
          );
        },
      };

  return (
    <div className={cn('leading-relaxed', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
