import Page from '@/components/common/page';
import type { ConversationResponseDto } from '@/services/apis/gen/queries';
import { useAgentsControllerGetConversations } from '@/services/apis/gen/queries';
import { MessageSquare, Send } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const CONVERSATION_STARTERS = [
  'How can I help secure your application today?',
  'Ready to strengthen your security posture.',
  'What security challenge are you facing?',
  'Let me help you find and fix vulnerabilities.',
  'Ask me anything about application security.',
  'Your AI security assistant is ready.',
  'Need help with a security issue?',
  "What's your security concern today?",
];

export default function AgentsLandingPage() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: conversationsData } = useAgentsControllerGetConversations(
    { limit: 3, sortBy: 'updatedAt', sortOrder: 'DESC' },
    { query: { queryKey: ['/api/agents/conversations'] } },
  );

  const conversations: ConversationResponseDto[] = useMemo(
    () => conversationsData?.data ?? [],
    [conversationsData],
  );

  const starter = useMemo(
    () =>
      CONVERSATION_STARTERS[
        Math.floor(Math.random() * CONVERSATION_STARTERS.length)
      ],
    [],
  );

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [input]);

  const handleSendMessage = useCallback(
    (content: string) => {
      if (!content.trim() || isSending) return;

      setIsSending(true);

      // Navigate to new conversation page with pending message
      // The actual SSE call will happen on the detail page
      void navigate('/agents/conversations/new', {
        state: { pendingMessage: content.trim() },
      });
    },
    [isSending, navigate],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(input);
    }
  };

  const handleSelectConversation = useCallback(
    (conversationId: string) => {
      void navigate(`/agents/conversations/${conversationId}`);
    },
    [navigate],
  );

  return (
    <Page className="w-full md:w-2/3 lg:w-1/2 mx-auto">
      <div className="flex h-[calc(100vh-8rem)] flex-col items-center justify-center gap-6 p-4">
        <p className="text-xl font-medium text-foreground">{starter}</p>

        <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
          <div className="bg-muted flex items-center rounded-2xl">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              rows={1}
              disabled={isSending}
              className="flex-1 resize-none bg-transparent px-5 py-4 text-base placeholder:text-muted-foreground outline-none min-h-[48px] max-h-[33vh] disabled:opacity-50 overflow-y-auto"
            />
            {input.trim() && (
              <button
                type="submit"
                disabled={isSending}
                className="shrink-0 mr-4 p-2 rounded-full hover:bg-background transition-colors disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>
        </form>

        {conversations.length > 0 && (
          <div className="w-full max-w-2xl mt-4 flex flex-col items-center">
            <div className="space-y-1 w-full">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors text-left"
                >
                  <MessageSquare className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {conv.title ?? 'New conversation'}
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => void navigate('/agents/conversations')}
              className="text-sm text-muted-foreground hover:text-accent-foreground transition-colors mt-2 py-1.5"
            >
              View all
            </button>
          </div>
        )}
      </div>
    </Page>
  );
}
