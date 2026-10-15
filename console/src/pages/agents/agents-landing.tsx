import AgentPromptInput from '@/components/agent-prompt-input';
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion';
import Page from '@/components/common/page';
import TypewriterText from '@/components/typewriter-text';

import { Button } from '@/components/ui/button';
import { restoreApprovalMode } from '@/hooks/use-approval-mode';
import { useLLMConfigs } from '@/hooks/use-llm-configs';
import { useAgentSettingsDialog } from '@/hooks/useAgentSettingsDialog';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { Plus, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { v7 as uuidv7 } from 'uuid';
// import AgentIcon from './components/agent-icon';

import {
  ALL_QUICK_SUGGESTIONS,
  CONVERSATION_STARTERS,
} from './components/landing-constants';

const routeApi = getRouteApi('/_authed/aistudio/');

export default function AgentsLandingPage() {
  const navigate = useNavigate();
  const { open: openSettings } = useAgentSettingsDialog();
  const { text: queryText } = routeApi.useSearch();
  const [isSending, setIsSending] = useState(false);
  const [selectedModel, setSelectedModel] = useState<{
    provider: string;
    model: string;
    configId: string;
  } | null>(null);
  const [agentMode, setAgentMode] = useState('ask');
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);

  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();

  const { hasProviderConnected } = useLLMConfigs({
    enabled: !!selectedWorkspaceId,
  });

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
        workerId: selectedWorkerId,
      };
      void navigate({
        to: '/aistudio/conversations/$conversationId',
        params: { conversationId: newConversationId },
        state: navState,
      });
    },
    [isSending, navigate, selectedModel, agentMode, selectedWorkerId],
  );

  // A new chat starts from the user's last explicit choice, not a past conversation's
  useEffect(() => {
    restoreApprovalMode();
  }, []);

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

  if (!hasProviderConnected) {
    return (
      <Page
        className="w-full md:w-2/3 lg:w-1/2 mx-auto"
        permission="agent.read"
      >
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
          <Button variant="outline" onClick={() => openSettings('provider')}>
            <Plus className="h-4 w-4" />
            Connect
          </Button>
        </div>
      </Page>
    );
  }

  return (
    <Page className="w-full md:w-2/3 lg:w-1/2 mx-auto" permission="agent.read">
      {/* The prompt input is the only in-flow element, so it sits at the
          vertical centre (nudged up by the bottom padding); the hero and the
          suggestions hang off it without shifting it. */}
      <div className="flex h-[calc(100vh-8rem)] flex-col items-center justify-center pb-24">
        <div className="relative w-full max-w-2xl">
          {/* Hero */}
          <div className="absolute inset-x-0 bottom-full mb-8 flex flex-col items-center gap-3 text-center">
            <div className="rounded-full bg-muted p-3 ring-1 ring-border">
              <Sparkles className="h-6 w-6 text-foreground" />
            </div>
            <TypewriterText
              texts={CONVERSATION_STARTERS}
              className="hidden sm:inline text-xl font-medium text-foreground max-w-lg"
            />
          </div>

          {/* Input area */}
          <AgentPromptInput
            onSubmit={handleSendMessage}
            isSending={isSending}
            selectedModel={selectedModel}
            onSelectModel={(provider, model, configId) => {
              setSelectedModel({ provider, model, configId });
            }}
            agentMode={agentMode}
            onAgentModeChange={setAgentMode}
            selectedWorkerId={selectedWorkerId}
            onWorkerSelect={setSelectedWorkerId}
          />

          {/* Quick suggestions */}
          <div className="absolute inset-x-0 top-full mt-3">
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
        </div>
      </div>
    </Page>
  );
}
