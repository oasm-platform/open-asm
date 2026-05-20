import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input';
import { AgentModeToggle } from '@/components/ui/agent-mode-toggle';
import { ChatModelSwitcher } from '@/components/ui/chat-model-switcher';
import { useState } from 'react';

interface AgentPromptInputProps {
  onSubmit: (content: string, options?: { agentMode?: boolean }) => void;
  isSending?: boolean;
  selectedModel?: {
    provider: string;
    model: string;
    configId: string;
  } | null;
  onSelectModel?: (provider: string, model: string, configId: string) => void;
  agentMode?: boolean;
  onAgentModeChange?: (enabled: boolean) => void;
  placeholder?: string;
  className?: string;
}

export default function AgentPromptInput({
  onSubmit,
  isSending = false,
  selectedModel,
  onSelectModel,
  agentMode = false,
  onAgentModeChange,
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
      <PromptInput onSubmit={handleSubmit} className="w-full shadow-sm">
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
              <AgentModeToggle
                enabled={agentMode}
                onToggle={onAgentModeChange}
              />
            )}
            <PromptInputSubmit
              status={isSending ? 'streaming' : 'ready'}
              disabled={!input.trim() || isSending}
            />
          </div>
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
