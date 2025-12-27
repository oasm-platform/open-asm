import { useRef, useEffect, useCallback, memo } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Send, Plus, Zap, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AgentType } from '../types/agent-types';
import { StreamingStatus } from './streaming-status';

type ChatInputProps = {
  inputMessage: string;
  setInputMessage: (value: string) => void;
  onSendMessage: () => void;
  isSending: boolean;
  selectedAgentType: number;
  onSelectAgentType: (type: number) => void;
  streamingStatus?: {
    type?: string;
    content?: string;
  };
};

// Configuration object for Agent Types
const AGENT_CONFIG = {
  [AgentType.Orchestration]: {
    icon: <Plus className="w-5 h-5" />,
    label: 'Open ASM',
    itemClass: '',
    iconClass: 'mr-2',
  },
  [AgentType.NucleiGenerator]: {
    icon: <Zap className="w-5 h-5 text-yellow-500" />,
    label: 'Nuclei Generator',
    itemClass: '',
    iconClass: 'mr-2 text-yellow-500',
  },
  [AgentType.Analysis]: {
    icon: <ShieldCheck className="w-5 h-5 text-blue-500" />,
    label: 'Security Analyst',
    itemClass: '',
    iconClass: 'mr-2 text-blue-500',
  },
};

export const ChatInput = memo(function ChatInput({
  inputMessage,
  setInputMessage,
  onSendMessage,
  isSending,
  selectedAgentType,
  onSelectAgentType,
  streamingStatus,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      textarea.style.height = `${Math.min(scrollHeight, 200)}px`;
    }
  }, [inputMessage]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (inputMessage.trim() && !isSending) {
        onSendMessage();
      }
    },
    [inputMessage, isSending, onSendMessage],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInputMessage(e.target.value);
    },
    [setInputMessage],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (inputMessage.trim() && !isSending) {
          onSendMessage();
        }
      }
    },
    [inputMessage, isSending, onSendMessage],
  );

  const isDisabled = isSending || inputMessage.trim() === '';

  // Get current agent config or default to Orchestration
  const currentAgent =
    AGENT_CONFIG[selectedAgentType as AgentType] ||
    AGENT_CONFIG[AgentType.Orchestration];

  return (
    <div className="flex flex-col gap-1.5 px-2 sm:px-4 pt-2 bg-black">
      {/* Show streaming status (thinking, tool usage, etc.) */}
      {streamingStatus && (
        <div className="animate-in fade-in slide-in-from-bottom-1 duration-300">
          <StreamingStatus
            type={streamingStatus.type}
            content={streamingStatus.content}
          />
        </div>
      )}
      <form
        onSubmit={handleSubmit}
        className="relative flex items-center gap-0.5 bg-background p-1 rounded-3xl border border-input shadow-sm focus-within:border-ring focus-within:shadow-md transition-all duration-200"
      >
        <div className="pl-1 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full text-zinc-500 hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800"
                title={`Current Mode: ${currentAgent.label}`}
              >
                {currentAgent.icon}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Assistant Mode</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onSelectAgentType(AgentType.Orchestration)}
                className={cn(
                  'cursor-pointer',
                  selectedAgentType === AgentType.Orchestration && 'bg-accent',
                )}
              >
                <Plus className="w-4 h-4 mr-2" />
                <span>Orchestrator</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onSelectAgentType(AgentType.Analysis)}
                className={cn(
                  'cursor-pointer',
                  selectedAgentType === AgentType.Analysis && 'bg-accent',
                )}
              >
                <ShieldCheck className="w-4 h-4 mr-2 text-blue-500" />
                <span>Security Analyst</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onSelectAgentType(AgentType.NucleiGenerator)}
                className={cn(
                  'cursor-pointer',
                  selectedAgentType === AgentType.NucleiGenerator &&
                    'bg-accent',
                )}
              >
                <Zap className="w-4 h-4 mr-2 text-yellow-500" />
                <span>Nuclei Expert</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <textarea
          ref={textareaRef}
          value={inputMessage}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={`Ask ${currentAgent.label}...`}
          rows={1}
          className="flex-1 !bg-transparent border-none outline-none shadow-none ring-0 focus-visible:ring-0 px-2 py-2 text-foreground text-base placeholder:text-muted-foreground font-medium resize-none overflow-y-auto min-h-[40px] max-h-[200px] scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-600"
          disabled={isSending}
        />

        <Button
          type="submit"
          disabled={isDisabled}
          size="icon"
          className="h-8 w-8 rounded-full bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm hover:shadow-md transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shrink-0"
        >
          <Send className="w-4 h-4 ml-0.5" />
        </Button>
      </form>
    </div>
  );
});
