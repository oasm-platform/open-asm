import { useMemo, memo, useCallback, useRef, useEffect } from 'react';
import type { ChatMessagesProps } from '../types/types';
import { Markdown } from '@/components/common/markdown';
import { Loader } from 'lucide-react';

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
        <Markdown content={content} />
      </div>
    </div>
  );
});

interface ChatMessagesExtendedProps extends ChatMessagesProps {
  isStreaming?: boolean;
}

export const ChatMessages = memo(function ChatMessages({
  messages,
  isStreaming,
}: ChatMessagesExtendedProps) {
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
  }, [uniqueMessages, isStreaming]);

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
      {isStreaming && (
        <div className="flex justify-start px-1 -mt-2">
          <div className="flex items-center gap-2 text-zinc-400 text-xs italic">
            <Loader className="h-3 w-3 animate-spin" />
            <span>Assistant is thinking...</span>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
});
