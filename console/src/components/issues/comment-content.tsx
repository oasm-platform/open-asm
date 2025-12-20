import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './code-block';

interface CommentContentProps {
  content: string;
}

export const CommentContent = ({ content }: CommentContentProps) => {
  return (
    <div className="leading-relaxed mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ ...props }) => (
            <h1
              className="text-xl font-bold border-b pb-2 mb-4 mt-6"
              {...props}
            />
          ),
          h2: ({ ...props }) => (
            <h2
              className="text-lg font-bold border-b pb-1 mb-3 mt-5"
              {...props}
            />
          ),
          h3: ({ ...props }) => (
            <h3 className="text-base font-bold mb-2 mt-4" {...props} />
          ),
          h4: ({ ...props }) => (
            <h4 className="text-sm font-bold mb-2 mt-3" {...props} />
          ),
          p: ({ ...props }) => <p className="mb-4 last:mb-0" {...props} />,
          ul: ({ ...props }) => (
            <ul className="list-disc pl-6 mb-4 space-y-1" {...props} />
          ),
          ol: ({ ...props }) => (
            <ol className="list-decimal pl-6 mb-4 space-y-1" {...props} />
          ),
          blockquote: ({ ...props }) => (
            <blockquote
              className="border-l-4 border-muted pl-4 italic my-4"
              {...props}
            />
          ),
          code: ({
            className,
            children,
            inline,
            ...props
          }: {
            className?: string;
            children?: React.ReactNode;
            inline?: boolean;
          }) => {
            const match = /language-(\w+)/.exec(className || '');
            const value = String(children).replace(/\n$/, '');

            if (!inline && match) {
              return <CodeBlock language={match[1]} value={value} />;
            }

            if (!inline && value.includes('\n')) {
              return <CodeBlock value={value} />;
            }

            return (
              <code
                className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono"
                {...props}
              >
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
