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
  onAgentModeChange?: (mode: string) => void;
  selectedWorkerId?: string | null;
  onWorkerSelect?: (workerId: string | null) => void;
  placeholder?: string;
  className?: string;
}

export default function AgentPromptInput({
  onSubmit,
  isSending = false,
  onStop,
  selectedModel,
  onSelectModel,
  agentMode = 'ask',
  onAgentModeChange,
  selectedWorkerId,
  onWorkerSelect,
  placeholder = 'Ask anything about security...',
  className,
}: AgentPromptInputProps) {
  const [input, setInput] = useState('');

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
              />
            )}
          </PromptInputTools>
          <div className="flex items-center gap-2">
            {onAgentModeChange && (
              <AgentModeSelect
                value={agentMode}
                onChange={onAgentModeChange}
                selectedWorkerId={selectedWorkerId}
                onWorkerChange={onWorkerSelect}
              />
            )}
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
