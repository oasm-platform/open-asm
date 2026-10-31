import { cn } from '@/lib/utils';
import { OpenLink } from '@/components/ui/open-link';
import {
  isValidElement,
  memo,
  type ComponentPropsWithoutRef,
  type ElementType,
  type ReactNode,
} from 'react';
import ReactMarkdown, {
  type Components,
  type ExtraProps,
} from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './code-block';

interface MarkdownProps {
  content: string;
  className?: string;
  preview?: boolean;
}

/**
 * Renders `tag` with the `base` classes merged with any class markdown sets
 * itself (task lists, code languages), and keeps the hast `node` off the DOM.
 */
const withClass = <T extends keyof React.JSX.IntrinsicElements>(
  tag: T,
  base: string,
) => {
  const Tag = tag as ElementType;
  return ({
    node: _node,
    className,
    ...props
  }: ComponentPropsWithoutRef<T> & ExtraProps & { className?: string }) => (
    <Tag className={cn(base, className)} {...props} />
  );
};

// Blocks space themselves with margins that collapse into each other, and
// drop the outer margin at the edges of their container.
const block = 'my-3 first:mt-0 last:mb-0';
const heading = 'font-semibold tracking-tight leading-snug first:mt-0';

const linkClass =
  'font-medium text-primary underline decoration-primary/30 underline-offset-[3px] transition-colors wrap-anywhere hover:decoration-primary';
const Th = withClass('th', 'px-3 py-2 text-left align-middle font-semibold');
const Td = withClass('td', 'px-3 py-2 align-top');

// Sizes are in em so headings and code scale with the text size the caller
// sets. `heading` goes last: tailwind-merge drops a leading-* that precedes a
// text-* size.
const fullComponents: Components = {
  h1: withClass('h1', cn('mt-8 mb-4 text-[1.5em]', heading)),
  h2: withClass('h2', cn('mt-7 mb-3 text-[1.25em]', heading)),
  h3: withClass('h3', cn('mt-6 mb-2 text-[1.1em]', heading)),
  h4: withClass('h4', cn('mt-5 mb-2 text-[1em]', heading)),
  h5: withClass('h5', cn('mt-5 mb-2 text-[1em]', heading)),
  h6: withClass('h6', cn('mt-5 mb-2 text-[1em]', heading)),
  p: withClass('p', block),
  strong: withClass('strong', 'font-semibold'),
  hr: withClass('hr', 'my-6 border-t'),
  ul: withClass(
    'ul',
    cn(
      block,
      'list-disc space-y-1 pl-6 marker:text-muted-foreground',
      '[&.contains-task-list]:list-none [&.contains-task-list]:pl-1',
    ),
  ),
  ol: withClass(
    'ol',
    cn(block, 'list-decimal space-y-1 pl-6 marker:text-muted-foreground'),
  ),
  li: withClass('li', 'pl-1 [&>ol]:my-1 [&>p]:my-1 [&>ul]:my-1'),
  input: withClass('input', 'mr-2 size-3.5 translate-y-0.5 accent-primary'),
  blockquote: withClass(
    'blockquote',
    cn(block, 'border-l-[3px] border-primary/40 pl-4 text-muted-foreground'),
  ),
  a: ({ node: _node, className, ...props }) => (
    <OpenLink
      className={cn(linkClass, className)}
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    />
  ),
  img: withClass('img', 'my-2 max-w-full rounded-md border'),
  table: ({ node: _node, className, ...props }) => (
    <div className={cn(block, 'w-full overflow-x-auto rounded-lg border')}>
      <table
        className={cn('w-full border-collapse text-[0.875em]', className)}
        {...props}
      />
    </div>
  ),
  thead: withClass('thead', 'bg-muted/60'),
  tbody: withClass(
    'tbody',
    '[&>tr]:transition-colors [&>tr:hover]:bg-muted/40 [&>tr:last-child]:border-0',
  ),
  tr: withClass('tr', 'border-b'),
  // GFM column alignment is dropped on both, so headers line up with cells.
  th: ({ style: _style, ...props }) => <Th {...props} />,
  td: ({ style: _style, ...props }) => <Td {...props} />,
  // Fenced and indented code arrive as <pre><code>; the pre is swapped for a
  // CodeBlock so the `code` override below only ever sees inline code.
  pre: ({ node: _node, children, ...props }) => {
    if (
      isValidElement<{ className?: string; children?: ReactNode }>(children)
    ) {
      const { className, children: code } = children.props;
      const language = /language-([\w-]+)/.exec(className ?? '')?.[1];
      return (
        <CodeBlock
          className={block}
          language={language ?? 'text'}
          value={String(code ?? '').replace(/\n$/, '')}
        />
      );
    }
    return <pre {...props}>{children}</pre>;
  },
  // Kept short of the line height so chips on wrapped lines don't touch;
  // box-decoration-clone gives each half of a wrapped chip its own edges.
  code: withClass(
    'code',
    'rounded-md border bg-muted px-[0.4em] py-[0.1em] font-mono text-[0.85em] box-decoration-clone wrap-break-word',
  ),
};

// One-line rendering: blocks collapse into inline spans.
const previewComponents: Components = {
  p: withClass('span', ''),
  h1: withClass('span', 'font-semibold'),
  h2: withClass('span', 'font-semibold'),
  h3: withClass('span', 'font-semibold'),
  h4: withClass('span', 'font-semibold'),
  h5: withClass('span', 'font-semibold'),
  h6: withClass('span', 'font-semibold'),
  ul: withClass('span', 'ml-2'),
  ol: withClass('span', 'ml-2'),
  li: withClass('span', 'mr-2'),
  blockquote: withClass('span', 'text-muted-foreground'),
  pre: withClass('span', ''),
  code: withClass(
    'code',
    'rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]',
  ),
};

export const Markdown = memo(function Markdown({
  content,
  className,
  preview,
}: MarkdownProps) {
  return (
    <div className={cn('leading-[1.75] wrap-break-word', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={preview ? previewComponents : fullComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
