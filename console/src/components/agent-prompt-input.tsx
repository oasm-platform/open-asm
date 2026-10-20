import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input';
import { AgentModeSelect } from '@/components/ui/agent-mode-toggle';
import { ChatModelSwitcher } from '@/components/ui/chat-model-switcher';
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
  selectedWorkerId?: string | null;
  onWorkerSelect?: (workerId: string | null) => void;
  /** False hides the agent settings gear next to the model picker. */
  showSettingsButton?: boolean;
  placeholder?: string;
  className?: string;
  /** Controlled text value; falls back to internal state when omitted. */
  value?: string;
  /** Required with `value` to make the input controlled. */
  onValueChange?: (value: string) => void;
}

export default function AgentPromptInput({
  onSubmit,
  isSending = false,
  onStop,
  selectedModel,
  onSelectModel,
  agentMode = 'ask',
  selectedWorkerId,
  onWorkerSelect,
  showSettingsButton = true,
  placeholder = 'Ask anything about security...',
  className,
  value,
  onValueChange,
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
        <PromptInputBody>
          <PromptInputTextarea
            value={input}
            placeholder={placeholder}
            onChange={(e) => setInput(e.currentTarget.value)}
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
            <AgentModeSelect
              value={agentMode}
              selectedWorkerId={selectedWorkerId}
              onWorkerChange={onWorkerSelect}
            />
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
