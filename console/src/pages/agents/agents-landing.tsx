import Page from '@/components/common/page';
import LlmConnect from '@/components/llm-connect';
import TypewriterText from '@/components/typewriter-text';
import AgentPromptInput from '@/components/agent-prompt-input';
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion';

import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import type {
  ConversationResponseDto,
  LLMConfigWithProviderDto,
} from '@/services/apis/gen/queries';
import {
  useAgentsControllerGetConversations,
  useAgentsControllerGetLLMConfigs,
} from '@/services/apis/gen/queries';
import { MessageSquare, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { v7 as uuidv7 } from 'uuid';
// import AgentIcon from './agent-icon';

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

const ALL_QUICK_SUGGESTIONS = [
  'What is the attack surface of my current workspace?',
  'Are there any exposed services or ports in my project?',
  'What security risks exist in my current environment?',
  'How can I reduce the attack surface of my application?',
  'What entry points need security hardening in my workspace?',
  'Which network services are publicly accessible in my setup?',
  'What APIs are exposed without proper authentication?',
  'Are there unnecessary ports open in my infrastructure?',
  'What cloud resources are vulnerable to external attacks?',
  'How can I identify shadow IT in my organization?',
  'What third-party integrations increase my attack surface?',
  'Are there misconfigured security groups in my environment?',
  'What endpoints lack proper rate limiting?',
  'How can I discover undocumented API endpoints?',
  'What services are running with excessive permissions?',
];

const routeApi = getRouteApi('/_authed/agents/');

export default function AgentsLandingPage() {
  const navigate = useNavigate();
  const { text: queryText } = routeApi.useSearch();
  const [isSending, setIsSending] = useState(false);
  const [selectedModel, setSelectedModel] = useState<{
    provider: string;
    model: string;
    configId: string;
  } | null>(null);
  const [agentMode, setAgentMode] = useState('ask');

  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();

  const { data: conversationsData } = useAgentsControllerGetConversations(
    { limit: 3, sortBy: 'updatedAt', sortOrder: 'DESC' },
    {
      query: {
        queryKey: ['/api/agents/conversations', selectedWorkspaceId],
        enabled: !!selectedWorkspaceId,
      },
    },
  );

  const { data: llmProviders } = useAgentsControllerGetLLMConfigs<
    LLMConfigWithProviderDto[]
  >({
    query: {
      queryKey: ['/api/agents/llm-configs', selectedWorkspaceId],
      enabled: !!selectedWorkspaceId,
    },
  });

  const conversations: ConversationResponseDto[] = useMemo(
    () => conversationsData?.data ?? [],
    [conversationsData],
  );

  const hasProviderConnected = useMemo(() => {
    const list = Array.isArray(llmProviders)
      ? llmProviders
      : (llmProviders as unknown as { data?: LLMConfigWithProviderDto[] })
          ?.data;
    const providersArray = Array.isArray(list) ? list : [];
    return providersArray.some((p) => p.isConnected);
  }, [llmProviders]);

  // Randomly select 5 suggestions from the pool and shuffle them
  const quickSuggestions = useMemo(() => {
    const shuffled = [...ALL_QUICK_SUGGESTIONS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 5);
  }, []);

  const handleSendMessage = useCallback(
    (content: string, options?: { agentMode?: string }) => {
      if (!content.trim() || isSending) return;

      setIsSending(true);

      // Generate UUID v7 for new conversation and navigate immediately
      const newConversationId = uuidv7();
      const navState: Record<string, unknown> = {
        pendingMessage: content.trim(),
        ...(selectedModel && { selectedModel }),
        agentMode: options?.agentMode ?? agentMode,
      };
      void navigate({
        to: '/agents/conversations/$conversationId',
        params: { conversationId: newConversationId },
        state: navState,
      });
    },
    [isSending, navigate, selectedModel, agentMode],
  );

  useEffect(() => {
    if (queryText && !isSending) {
      handleSendMessage(queryText);
      const url = new URL(window.location.href);
      url.searchParams.delete('text');
      window.history.replaceState({}, '', url.toString());
    }
  }, [queryText, isSending, handleSendMessage]);

  const handleSuggestionClick = (suggestion: string) => {
    handleSendMessage(suggestion);
  };

  const handleSelectConversation = useCallback(
    (conversationId: string) => {
      void navigate({ to: `/agents/conversations/${conversationId}` });
    },
    [navigate],
  );

  if (!hasProviderConnected) {
    return (
      <Page className="w-full md:w-2/3 lg:w-1/2 mx-auto">
        <div className="flex h-[calc(100vh-8rem)] flex-col items-center justify-center gap-8">
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
      <div className="flex h-[calc(100vh-8rem)] flex-col items-center justify-center gap-8">
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
          <AgentPromptInput
            onSubmit={handleSendMessage}
            isSending={isSending}
            selectedModel={selectedModel}
            onSelectModel={(provider, model, configId) => {
              setSelectedModel({ provider, model, configId });
            }}
            agentMode={agentMode}
            onAgentModeChange={setAgentMode}
          />

          {/* Quick suggestions */}
          <Suggestions>
            {quickSuggestions.map((suggestion) => (
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
              onClick={() => void navigate({ to: '/agents/conversations' })}
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
