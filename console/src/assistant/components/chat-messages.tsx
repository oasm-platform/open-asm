import { useMemo, memo, useCallback, useRef, useEffect } from 'react';
import type { ChatMessagesProps } from '../types/types';

const messageBaseStyles =
  'max-w-[95%] text-sm whitespace-pre-wrap break-words leading-relaxed';
const userMessageStyles = `${messageBaseStyles} bg-secondary text-secondary-foreground rounded-2xl rounded-tr-sm shadow-sm px-4 py-3`;
const assistantMessageStyles = `${messageBaseStyles} bg-transparent text-foreground px-1 py-1`;

interface MessageBubbleProps {
  content: string;
  isUser: boolean;
}

const MessageBubble = memo(function MessageBubble({
  content,
  isUser,
}: MessageBubbleProps) {
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={isUser ? userMessageStyles : assistantMessageStyles}>
        {content}
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
