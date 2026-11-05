import {
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionMenuTrigger,
} from '@/components/ai-elements/prompt-input';
import type { ProviderModelDtoReasoningEffortsItem } from '@/services/apis/gen/queries';
import { BrainIcon, CheckIcon } from 'lucide-react';
import { memo } from 'react';

export type ReasoningEffort = ProviderModelDtoReasoningEffortsItem;

/** Offered when the model publishes no levels of its own. */
export const FALLBACK_EFFORTS: ReasoningEffort[] = ['low', 'medium', 'high'];

export const EFFORT_LABELS: Record<ReasoningEffort, string> = {
  none: 'None',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
};

interface ReasoningEffortSelectProps {
  /** Levels the model accepts, lowest first. */
  efforts: ReasoningEffort[];
  /** The picked level; null (or one the model lacks) runs the default. */
  value: ReasoningEffort | null;
  onChange: (effort: ReasoningEffort | null) => void;
  disabled?: boolean;
}

/** Reasoning effort picker for the model next to it in the chat input. */
export const ReasoningEffortSelect = memo(function ReasoningEffortSelect({
  efforts,
  value,
  onChange,
  disabled,
}: ReasoningEffortSelectProps) {
  const active = value && efforts.includes(value) ? value : null;
  const label = active ? EFFORT_LABELS[active] : 'Default';

  return (
    <PromptInputActionMenu>
      <PromptInputActionMenuTrigger
        tooltip={`Reasoning effort: ${label}`}
        disabled={disabled}
        aria-label="Reasoning effort"
      >
        <BrainIcon size={16} />
        <span className="ml-1 text-xs">{label}</span>
      </PromptInputActionMenuTrigger>
      <PromptInputActionMenuContent>
        <PromptInputActionMenuItem
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => onChange(null)}
        >
          <div className="flex-1">
            <div className="font-medium">Default</div>
            <div className="text-xs text-muted-foreground">
              Your settings default, else the provider's
            </div>
          </div>
          {!active && <CheckIcon className="size-4 text-green-500" />}
        </PromptInputActionMenuItem>
        {efforts.map((effort) => (
          <PromptInputActionMenuItem
            key={effort}
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => onChange(effort)}
          >
            <span className="flex-1 font-medium">{EFFORT_LABELS[effort]}</span>
            {active === effort && <CheckIcon className="size-4 text-green-500" />}
          </PromptInputActionMenuItem>
        ))}
      </PromptInputActionMenuContent>
    </PromptInputActionMenu>
  );
});
