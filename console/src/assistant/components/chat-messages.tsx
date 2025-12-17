import { useMemo, memo, useCallback, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import type { ChatMessagesProps } from '../types/types';
import { CodeBlock } from './code-block';

const messageBaseStyles = 'max-w-[95%] text-sm break-words leading-relaxed';
const userMessageStyles = `${messageBaseStyles} whitespace-pre-wrap bg-secondary text-secondary-foreground rounded-2xl rounded-tr-sm shadow-sm px-4 py-3`;
const assistantMessageStyles = `${messageBaseStyles} bg-transparent text-foreground px-1 py-1`;

interface MessageBubbleProps {
  content: string;
  isUser: boolean;
}

const MessageBubble = memo(function MessageBubble({
  content,
  isUser,
}: MessageBubbleProps) {
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className={userMessageStyles}>{content}</div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className={assistantMessageStyles}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code({
              node,
              inline,
              className,
              children,
              ...props
            }: React.ComponentPropsWithoutRef<'code'> & {
              inline?: boolean;
              node?: object;
            }) {
              // Consume unused node variable to satisfy linter without disabling rules
              void node;

              const match = /language-(\w+)/.exec(className || '');
              const language = match ? match[1] : '';

              if (!inline && match) {
                return (
                  <CodeBlock
                    language={language}
                    value={String(children).replace(/\n$/, '')}
                  />
                );
              }

              // Also handle multi-line code blocks that might not have a language specified but are purely code
              if (!inline && String(children).includes('\n')) {
                return (
                  <CodeBlock
                    language="text"
                    value={String(children).replace(/\n$/, '')}
                  />
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
            // Style other elements for better reading
            a: ({
              node,
              ...props
            }: React.ComponentPropsWithoutRef<'a'> & { node?: object }) => {
              void node;
              return (
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-medium break-all"
                  {...props}
                />
              );
            },
            p: ({
              node,
              ...props
            }: React.ComponentPropsWithoutRef<'p'> & { node?: object }) => {
              void node;
              return (
                <p className="mb-2 last:mb-0 leading-relaxed" {...props} />
              );
            },
            ul: ({
              node,
              ...props
            }: React.ComponentPropsWithoutRef<'ul'> & { node?: object }) => {
              void node;
              return (
                <ul className="list-disc pl-5 mb-2 space-y-1" {...props} />
              );
            },
            ol: ({
              node,
              ...props
            }: React.ComponentPropsWithoutRef<'ol'> & { node?: object }) => {
              void node;
              return (
                <ol className="list-decimal pl-5 mb-2 space-y-1" {...props} />
              );
            },
            table: ({
              node,
              ...props
            }: React.ComponentPropsWithoutRef<'table'> & { node?: object }) => {
              void node;
              // Wrap table in a div for scrolling if needed and border styling
              return (
                <div className="my-4 w-full overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <table className="w-full text-sm" {...props} />
                </div>
              );
            },
            thead: ({
              node,
              ...props
            }: React.ComponentPropsWithoutRef<'thead'> & { node?: object }) => {
              void node;
              return (
                <thead
                  className="bg-zinc-100/50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800"
                  {...props}
                />
              );
            },
            tbody: ({
              node,
              ...props
            }: React.ComponentPropsWithoutRef<'tbody'> & { node?: object }) => {
              void node;
              return (
                <tbody className="[&_tr:last-child]:border-0" {...props} />
              );
            },
            tr: ({
              node,
              ...props
            }: React.ComponentPropsWithoutRef<'tr'> & { node?: object }) => {
              void node;
              return (
                <tr
                  className="border-b border-zinc-100 dark:border-zinc-800/50 transition-colors hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50"
                  {...props}
                />
              );
            },
            th: ({
              node,
              ...props
            }: React.ComponentPropsWithoutRef<'th'> & { node?: object }) => {
              void node;
              return (
                <th
                  className="h-10 px-4 text-left align-middle font-medium text-zinc-500 dark:text-zinc-400"
                  {...props}
                />
              );
            },
            td: ({
              node,
              ...props
            }: React.ComponentPropsWithoutRef<'td'> & { node?: object }) => {
              void node;
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { style, ...rest } = props;
              return (
                <td
                  className="p-4 align-middle [&:has([role=checkbox])]:pr-0 text-zinc-700 dark:text-zinc-300"
                  {...rest}
                />
              );
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
});

export const ChatMessages = memo(function ChatMessages({
  messages,
}: ChatMessagesProps) {
  const uniqueMessages = useMemo(() => {
    return messages.filter((msg, index) => {
      if (index === 0) return true;
      const prev = messages[index - 1];
      return !(msg.type === prev.type && msg.content === prev.content);
    });
  }, [messages]);

  const shouldShowEmbeddedQuestion = useCallback(
    (index: number, hasQuestion: boolean, isUser: boolean) => {
      if (!hasQuestion || isUser) return false;
      const prevMessage = uniqueMessages[index - 1];
      return !prevMessage || prevMessage.type !== 'user';
    },
    [uniqueMessages],
  );

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [uniqueMessages]);

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden mb-4 space-y-4 px-2 pt-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-300 transition-colors">
      {uniqueMessages.map((message, index) => {
        const isUser = message.type === 'user';
        const hasContent = Boolean(message.content?.trim());
        const hasQuestion = Boolean(message.question?.trim());

        if (!isUser && !hasContent && !hasQuestion) return null;

        const showEmbeddedQuestion = shouldShowEmbeddedQuestion(
          index,
          hasQuestion,
          isUser,
        );

        if (showEmbeddedQuestion && hasContent) {
          return (
            <div key={message.messageId} className="space-y-4">
              <MessageBubble content={message.question!} isUser={true} />
              <MessageBubble content={message.content!} isUser={false} />
            </div>
          );
        }

        return (
          <MessageBubble
            key={message.messageId}
            content={isUser ? message.question! : message.content!}
            isUser={isUser}
          />
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
});
