import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTools,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input';
import { AgentMentionTextarea } from '@/components/agent-mention-textarea';
import { AgentModeToggle } from '@/components/ui/agent-mode-toggle';
import { ApprovalModeSelect } from '@/components/ui/approval-mode-select';
import { ChatModelSwitcher } from '@/components/ui/chat-model-switcher';
import { PanelsTopLeft, X } from 'lucide-react';
import { useState } from 'react';

interface AgentPromptInputProps {
  onSubmit: (content: string, options?: { agentMode?: string }) => void;
  isSending?: boolean;
  onStop?: () => void;
  selectedModel?: {
    provider: string;
    model: string;
    configId: string;
  } | null;
  onSelectModel?: (provider: string, model: string, configId: string) => void;
  agentMode?: string;
  /** Given only where the page can switch mode; shows the ask/agent toggle. */
  onAgentModeChange?: (mode: string) => void;
  onWorkerSelect?: (workerId: string | null) => void;
  /** False hides the agent settings gear next to the model picker. */
  showSettingsButton?: boolean;
  placeholder?: string;
  className?: string;
  /** Controlled text value; falls back to internal state when omitted. */
  value?: string;
  /** Required with `value` to make the input controlled. */
  onValueChange?: (value: string) => void;
  /** Label of the page attached to the next message; no chip when null. */
  pageContextLabel?: string | null;
  /** Detaches the page; required with `pageContextLabel` for the X button. */
  onRemovePageContext?: () => void;
}

export default function AgentPromptInput({
  onSubmit,
  isSending = false,
  onStop,
  selectedModel,
  onSelectModel,
  agentMode = 'ask',
  onAgentModeChange,
  onWorkerSelect,
  showSettingsButton = true,
  placeholder = 'Ask anything about security...',
  className,
  value,
  onValueChange,
  pageContextLabel,
  onRemovePageContext,
}: AgentPromptInputProps) {
  const [internalInput, setInternalInput] = useState('');
  const input = value ?? internalInput;
  const setInput = (next: string) => {
    if (onValueChange) onValueChange(next);
    else setInternalInput(next);
  };

  const handleSubmit = (message: PromptInputMessage) => {
    if (message.text.trim()) {
      onSubmit(message.text, { agentMode });
      setInput('');
    }
  };

  return (
    <div className={className}>
      <PromptInput onSubmit={handleSubmit} className="w-full">
        {/* Its own row: the footer has no room left in the narrow sidebar */}
        {pageContextLabel && (
          <PromptInputHeader className="px-3 pt-2.5 pb-0">
            <span
              className="flex h-6 min-w-0 max-w-full items-center gap-1.5 rounded-md border bg-muted/50 pl-2 pr-1 text-xs text-muted-foreground"
              title="This page is sent with your message"
            >
              <PanelsTopLeft className="size-3.5 shrink-0" />
              <span className="truncate">{pageContextLabel}</span>
              {onRemovePageContext && (
                <button
                  type="button"
                  onClick={onRemovePageContext}
                  aria-label="Remove page context"
                  className="shrink-0 rounded-sm p-0.5 hover:bg-accent hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              )}
            </span>
          </PromptInputHeader>
        )}
        <PromptInputBody>
          <AgentMentionTextarea
            value={input}
            placeholder={placeholder}
            onValueChange={setInput}
            disabled={isSending}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            {onSelectModel && (
              <ChatModelSwitcher
                selectedConfigId={selectedModel?.configId ?? null}
                selectedModel={selectedModel?.model ?? null}
                onSelectModel={onSelectModel}
                showSettingsButton={showSettingsButton}
              />
            )}
          </PromptInputTools>
          <div className="flex items-center gap-2">
            {onAgentModeChange && (
              <AgentModeToggle
                value={agentMode}
                onChange={onAgentModeChange}
                onWorkerChange={onWorkerSelect}
              />
            )}
            <ApprovalModeSelect />
            <PromptInputSubmit
              status={isSending ? 'streaming' : 'ready'}
              disabled={!input.trim() || isSending}
              onStop={onStop}
            />
          </div>
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
