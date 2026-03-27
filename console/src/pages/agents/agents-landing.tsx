import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input';
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion';
import Page from '@/components/common/page';
import LlmConnect from '@/components/llm-connect';
import TypewriterText from '@/components/typewriter-text';
import { LlmConfigSwitcher } from '@/components/ui/llm-config-switcher';
import { axiosInstance } from '@/services/apis/axios-client';
import type {
  ConversationResponseDto,
  LLMConfigResponseDto,
} from '@/services/apis/gen/queries';
import { useAgentsControllerGetConversations } from '@/services/apis/gen/queries';
import { useQuery } from '@tanstack/react-query';
import { MessageSquare, Sparkles } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
// import AgentIcon from './agent-icon';

interface LLMProviderStatus {
  id: string;
  name: string;
  logo: string;
  isConnected: boolean;
  config: LLMConfigResponseDto | null;
}

function useGetLLMProvidersStatus() {
  return useQuery<LLMProviderStatus[]>({
    queryKey: ['/api/agents/llm-configs'],
    queryFn: async ({ signal }) => {
      const response = await axiosInstance.get<LLMProviderStatus[]>(
        '/api/agents/llm-configs',
        { signal },
      );
      return response.data;
    },
  });
}

const CONVERSATION_STARTERS = [
  'How can I help secure your application today?',
  'Ready to strengthen your security posture.',
  'What security challenge are you facing?',
  'Let me help you find and fix vulnerabilities.',
  'Ask me anything about application security.',
  'Your AI security assistant is ready.',
  'Need help with a security issue?',
  "What's your security concern today?",
  "I'm listening. Tell me about your security needs.",
  'Your security matters. I am here to help.',
  'Share your security concerns. I am all ears.',
  'I am ready to assist with your security questions.',
  'Tell me what is on your mind regarding security.',
  'I am here and attentive to your security needs.',
  'Your security questions are important to me.',
  'I am tuned in. What security topics interest you?',
];

const QUICK_SUGGESTIONS = [
  'Find SQL injection vulnerabilities',
  'Review my API for auth issues',
  'How to implement JWT securely?',
  'Explain OWASP Top 10',
];

export default function AgentsLandingPage() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  const { data: conversationsData } = useAgentsControllerGetConversations(
    { limit: 3, sortBy: 'updatedAt', sortOrder: 'DESC' },
    { query: { queryKey: ['/api/agents/conversations'] } },
  );

  const { data: llmProviders } = useGetLLMProvidersStatus();

  const conversations: ConversationResponseDto[] = useMemo(
    () => conversationsData?.data ?? [],
    [conversationsData],
  );

  const hasProviderConnected = useMemo(
    () => (llmProviders ?? []).some((p) => p.isConnected),
    [llmProviders],
  );

  const handleSendMessage = useCallback(
    (content: string) => {
      if (!content.trim() || isSending) return;

      setIsSending(true);

      void navigate('/agents/conversations/new', {
        state: { pendingMessage: content.trim() },
      });
    },
    [isSending, navigate],
  );

  const handleSubmit = (message: PromptInputMessage) => {
    if (message.text.trim()) {
      handleSendMessage(message.text);
      setInput('');
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    handleSendMessage(suggestion);
  };

  const handleSelectConversation = useCallback(
    (conversationId: string) => {
      void navigate(`/agents/conversations/${conversationId}`);
    },
    [navigate],
  );

  if (!hasProviderConnected) {
    return (
      <Page className="w-full md:w-2/3 lg:w-1/2 mx-auto">
        <div className="flex h-[calc(100vh-8rem)] flex-col items-center justify-center gap-8 p-4">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="rounded-full bg-muted p-4 ring-1 ring-border">
              <Sparkles className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-xl font-semibold text-foreground">
                Connect an AI Provider
              </h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                To start chatting with the AI security agent, connect an LLM
                provider first.
              </p>
            </div>
          </div>
          <div className="w-full max-w-md">
            <LlmConnect />
          </div>
        </div>
      </Page>
    );
  }

  return (
    <Page className="w-full md:w-2/3 lg:w-1/2 mx-auto">
      <div className="flex h-[calc(100vh-8rem)] flex-col items-center justify-center gap-8 p-4">
        {/* Hero */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="rounded-full bg-muted p-3 ring-1 ring-border">
            <Sparkles className="h-6 w-6 text-foreground" />
          </div>
          <TypewriterText
            texts={CONVERSATION_STARTERS}
            className="hidden sm:inline text-xl font-medium text-foreground max-w-lg"
          />
        </div>

        {/* Input area */}
        <div className="w-full max-w-2xl flex flex-col gap-3">
          <PromptInput onSubmit={handleSubmit} className="w-full shadow-sm">
            <PromptInputBody>
              <PromptInputTextarea
                value={input}
                placeholder="Ask anything about security..."
                onChange={(e) => setInput(e.currentTarget.value)}
                disabled={isSending}
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <LlmConfigSwitcher />
              </PromptInputTools>
              <PromptInputSubmit
                status={isSending ? 'streaming' : 'ready'}
                disabled={!input.trim() || isSending}
              />
            </PromptInputFooter>
          </PromptInput>

          {/* Quick suggestions */}
          <Suggestions>
            {QUICK_SUGGESTIONS.map((suggestion) => (
              <Suggestion
                key={suggestion}
                onClick={handleSuggestionClick}
                suggestion={suggestion}
              />
            ))}
          </Suggestions>
        </div>

        {/* Recent conversations */}
        {conversations.length > 0 && (
          <div className="w-full max-w-2xl flex flex-col gap-1">
            <p className="text-xs font-medium text-muted-foreground px-1 mb-1">
              Recent conversations
            </p>
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
            <button
              onClick={() => void navigate('/agents/conversations')}
              className="text-xs text-muted-foreground hover:text-accent-foreground transition-colors mt-1 py-1 px-3 text-left"
            >
              View all conversations →
            </button>
          </div>
        )}
      </div>
    </Page>
  );
}
