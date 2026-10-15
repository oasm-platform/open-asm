import AgentPromptInput from '@/components/agent-prompt-input';
import Page from '@/components/common/page';
import TypewriterText from '@/components/typewriter-text';

import BorderBeam from '@/components/ui/border-beam';
import { Button } from '@/components/ui/button';
import { restoreApprovalMode } from '@/hooks/use-approval-mode';
import { useLLMConfigs } from '@/hooks/use-llm-configs';
import { useAgentSettingsDialog } from '@/hooks/useAgentSettingsDialog';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { cn } from '@/lib/utils';
import { SendMessageDtoAgentMode } from '@/services/apis/gen/queries';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { motion, useReducedMotion } from 'framer-motion';
import { Plus, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { v7 as uuidv7 } from 'uuid';
// import AgentIcon from './components/agent-icon';

import { AgentToolsTray } from './components/agent-tools-tray';
import {
  AGENT_PROMPT_GROUPS,
  ASK_PROMPT_GROUPS,
  CONVERSATION_STARTERS,
} from './components/landing-constants';
import { PromptGroups } from './components/prompt-groups';

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
  // Starter prompt under the pointer, previewed as the input placeholder
  const [previewPrompt, setPreviewPrompt] = useState<string | null>(null);
  // The halo behind the input appears once the load-time border beam ends
  const [haloVisible, setHaloVisible] = useState(false);
  const showHalo = useCallback(() => setHaloVisible(true), []);
  const isAgentMode = agentMode === SendMessageDtoAgentMode.agent;
  // Controlled input text, so a suggestion can be filled into it (agent mode)
  const [inputText, setInputText] = useState('');
  const inputWrapperRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();

  const { hasProviderConnected } = useLLMConfigs({
    enabled: !!selectedWorkspaceId,
  });

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
    // Agent mode runs real tools, so a suggestion is a starting point: fill it
    // into the input and focus so the user can add a target and press Enter.
    // Ask mode sends the suggestion straight away.
    if (isAgentMode) {
      // Trailing space so the user can type a target straight after.
      const filled = `${suggestion} `;
      setInputText(filled);
      const textarea = inputWrapperRef.current?.querySelector('textarea');
      if (textarea) {
        textarea.focus();
        const end = filled.length;
        requestAnimationFrame(() => textarea.setSelectionRange(end, end));
      }
      return;
    }
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
    // Full width so the halo can spread across the content area; the column
    // width lives on the input wrapper instead.
    <Page className="w-full" permission="agent.read">
      {/* The prompt input and its tools tray are the only in-flow elements,
          so they sit at the vertical centre (nudged up by the bottom padding);
          the hero and the suggestions hang off them without shifting them.
          `isolate` keeps the halo's -z-10 above the page background. */}
      <div className="relative isolate flex h-[calc(100vh-8rem)] flex-col items-center justify-center pb-24">
        {/* Soft blue halo around the input, fading in once the border beam
            has finished its lap. Fully faded before the edges. */}
        {haloVisible && (
          <motion.div
            aria-hidden="true"
            data-testid="landing-halo"
            data-mode={isAgentMode ? 'agent' : 'ask'}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            className="pointer-events-none absolute inset-0 -z-10"
          >
            {/* Blue in ask mode, light orange in agent mode (it can run
                commands on workers). Gradients can't transition, so the two
                layers cross-fade. */}
            <div
              className={cn(
                'absolute inset-0 bg-[radial-gradient(50%_50%_at_50%_45%,rgba(59,130,246,0.14),transparent)] transition-opacity duration-700 dark:bg-[radial-gradient(50%_50%_at_50%_45%,rgba(37,99,235,0.3),transparent)]',
                isAgentMode && 'opacity-0',
              )}
            />
            <div
              className={cn(
                'absolute inset-0 bg-[radial-gradient(50%_50%_at_50%_45%,rgba(251,146,60,0.16),transparent)] transition-opacity duration-700 dark:bg-[radial-gradient(50%_50%_at_50%_45%,rgba(251,146,60,0.22),transparent)]',
                !isAgentMode && 'opacity-0',
              )}
            />
          </motion.div>
        )}
        <div className="relative w-full max-w-2xl md:w-2/3 lg:w-1/2">
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

          {/* Input area: rounder box and a round send button, with the
              Agent toggle moved down into the tools tray. A gradient beam
              runs once around the box when it first appears. */}
          <div ref={inputWrapperRef} className="relative rounded-2xl">
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
              showAgentModeToggle={false}
              showSettingsButton={false}
              placeholder={previewPrompt ?? undefined}
              value={inputText}
              onValueChange={setInputText}
              className="[&_[data-slot=input-group]]:rounded-2xl [&_[data-slot=input-group]]:bg-card [&_[data-slot=input-group]]:dark:bg-card [&_button[type=submit]]:rounded-full"
            />
            <BorderBeam playKey={1} onComplete={showHalo} />
          </div>
          <AgentToolsTray
            agentMode={agentMode}
            onAgentModeChange={setAgentMode}
            onWorkerChange={setSelectedWorkerId}
          />

          {/* Starter prompts, grouped by topic. Agent mode offers prompts
              that run scans and tools; Ask mode offers read-only ones. */}
          <PromptGroups
            groups={isAgentMode ? AGENT_PROMPT_GROUPS : ASK_PROMPT_GROUPS}
            onSelect={handleSuggestionClick}
            onPreview={setPreviewPrompt}
            // Agent mode fills the input instead of sending, so keep the panel
            // open for picking another prompt or adding a target.
            closeOnSelect={!isAgentMode}
            className="absolute inset-x-0 top-full mt-4"
          />
        </div>
      </div>
    </Page>
  );
}
