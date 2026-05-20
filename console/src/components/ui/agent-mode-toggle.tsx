import { PromptInputButton } from '@/components/ai-elements/prompt-input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAgentsControllerGetAgentModes } from '@/services/apis/gen/queries';
import { Check, ChevronDown } from 'lucide-react';
import { memo, useMemo, useState } from 'react';

interface AgentModeSelectProps {
  value: string;
  onChange: (mode: string) => void;
}

export const AgentModeSelect = memo(function AgentModeSelect({
  value,
  onChange,
}: AgentModeSelectProps) {
  const { data: modes } = useAgentsControllerGetAgentModes();
  const [open, setOpen] = useState(false);

  const selectedMode = useMemo(
    () => modes?.find((m) => m.id === value),
    [modes, value],
  );

  if (!modes || modes.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md bg-muted/50">
      <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <PromptInputButton>
          <span className="hidden sm:inline" style={{ color: selectedMode?.color }}>
            {selectedMode?.name ?? 'Mode'}
          </span>
          <ChevronDown size={14} className="ml-1 opacity-60" />
        </PromptInputButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {modes.map((mode) => (
          <DropdownMenuItem
            key={mode.id}
            disabled={!mode.isAvailable}
            onClick={() => {
              if (!mode.isAvailable) return;
              onChange(mode.id);
              setOpen(false);
            }}
            className="flex items-center justify-between gap-2 data-[disabled]:opacity-50"
          >
            <div className="flex flex-col">
              <span className="font-medium" style={{ color: mode.color }}>
                {mode.name}
              </span>
              <span className="text-xs" style={{ color: mode.color, opacity: 0.7 }}>
                {mode.description}
              </span>
            </div>
            {value === mode.id && <Check size={14} className="shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});
