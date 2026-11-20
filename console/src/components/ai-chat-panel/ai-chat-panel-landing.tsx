import {
  AGENT_CONVERSATION_STARTERS,
  AGENT_PROMPT_GROUPS,
  ASK_PROMPT_GROUPS,
  CONVERSATION_STARTERS,
  translateStarters,
} from '@/pages/agents/components/landing-constants';
import { useT } from '@/lib/i18n-dictionary';
import { PromptGroups } from '@/pages/agents/components/prompt-groups';
import { SendMessageDtoAgentMode } from '@/services/apis/gen/queries';

interface AiChatPanelLandingProps {
  /** The mode the new chat is in: its line and starter prompts show */
  agentMode: string;
  onSelect: (prompt: string) => void;
  /** The prompt under the pointer, e.g. to show it as the input placeholder */
  onPreview: (prompt: string | null) => void;
}

/**
 * What a new chat in the sidebar shows above its input: the line and starter
 * prompts of the mode it is in, as on the AI Studio landing page, with the
 * line set still instead of typed out.
 */
export function AiChatPanelLanding({
  agentMode,
  onSelect,
  onPreview,
}: AiChatPanelLandingProps) {
  const t = useT();
  const isAgentMode = agentMode === SendMessageDtoAgentMode.agent;

  return (
    <div className="flex min-h-[45vh] flex-col justify-end gap-4 px-1">
      <p className="text-center text-base font-medium text-foreground">
        {isAgentMode
          ? translateStarters(AGENT_CONVERSATION_STARTERS, 'agent', t)[0]
          : translateStarters(CONVERSATION_STARTERS, 'ask', t)[0]}
      </p>
      <PromptGroups
        groups={isAgentMode ? AGENT_PROMPT_GROUPS : ASK_PROMPT_GROUPS}
        onSelect={onSelect}
        onPreview={onPreview}
        // Agent mode fills the input instead of sending: keep the list open
        // for picking another prompt or adding a target
        closeOnSelect={!isAgentMode}
      />
    </div>
  );
}
