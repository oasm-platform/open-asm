import { useRef, useMemo } from 'react';
import type { ChatMessagesProps } from '../types/types';

export function ChatMessages({ messages }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Deduplicate messages (consecutive same type & content)
  const uniqueMessages = useMemo(() => {
    return messages.filter((msg, index) => {
      if (index === 0) return true;
      const prev = messages[index - 1];
      if (msg.type === prev.type && msg.content === prev.content) {
        return false;
      }
      return true;
    });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto mb-4 space-y-4 px-2 pt-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-300 transition-colors">
      {uniqueMessages.map((message, index) => {
        const isUser = message.type === 'user';
        const hasContent = message.content && message.content.trim() !== '';
        const hasQuestion = message.question && message.question.trim() !== '';

        // Requirement 2: Don't show empty assistant messages UNLESS it has a question to show (legacy case)
        if (!isUser && !hasContent && !hasQuestion) {
          return null;
        }

        // Logic to prevent duplicate questions:
        // Only show question inside an assistant message if there is NO previous User message
        let showEmbeddedQuestion = false;
        if (hasQuestion && !isUser) {
          const prevMessage = uniqueMessages[index - 1]; // Corrected: Check against the rendered list
          // Simple check: If previous message exists and IS User, assume it matches the question.
          // This avoids string matching issues (whitespace, case, etc).
          if (!prevMessage || prevMessage.type !== 'user') {
            showEmbeddedQuestion = true;
          }
        }

        // Case 1: Legacy/Merged Message (Show both Question and Answer)
        if (showEmbeddedQuestion && hasContent) {
          return (
            <div key={message.messageId} className="space-y-4">
              {/* User question (Embedded) */}
              <div className="flex justify-end">
                <div className="max-w-[95%] rounded-2xl rounded-tr-sm px-4 py-3 text-sm bg-secondary text-secondary-foreground shadow-sm">
                  {message.question}
                </div>
              </div>
              {/* Assistant answer */}
              <div className="flex justify-start">
                <div className="max-w-[95%] px-1 py-1 text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                  {message.content}
                </div>
              </div>
            </div>
          );
        }

        // Case 2: Standard Message (Content only for Assistant, Question only for User)
        return (
          <div
            key={message.messageId}
            className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[95%] text-sm whitespace-pre-wrap leading-relaxed ${
                isUser
                  ? 'bg-secondary text-secondary-foreground rounded-2xl rounded-tr-sm shadow-sm px-4 py-3'
                  : 'bg-transparent text-foreground px-1 py-1'
              }`}
            >
              {isUser ? message.question : message.content}
            </div>
          </div>
        );
      })}
      {/* Invisible element to scroll to */}
      <div ref={bottomRef} />
    </div>
  );
}
