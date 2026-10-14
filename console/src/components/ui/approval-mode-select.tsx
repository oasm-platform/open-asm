import {
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionMenuTrigger,
} from '@/components/ai-elements/prompt-input';
import {
  setApprovalMode,
  useApprovalMode,
  type ApprovalMode,
} from '@/hooks/use-approval-mode';
import { CheckIcon, HandIcon, ListChecksIcon, ZapIcon } from 'lucide-react';
import { memo } from 'react';

const OPTIONS: Array<{
  id: ApprovalMode;
  label: string;
  description: string;
  icon: typeof ZapIcon;
}> = [
  {
    id: 'auto',
    label: 'Auto',
    description: 'Run every command without asking',
    icon: ZapIcon,
  },
  {
    id: 'plan',
    label: 'Plan',
    description: 'Review the plan first, then pick Auto or Manual',
    icon: ListChecksIcon,
  },
  {
    id: 'manual',
    label: 'Manual',
    description: 'Approve each new command',
    icon: HandIcon,
  },
];

export const ApprovalModeSelect = memo(function ApprovalModeSelect() {
  const mode = useApprovalMode();
  const active = OPTIONS.find((o) => o.id === mode) ?? OPTIONS[2];
  const ActiveIcon = active.icon;

  return (
    <PromptInputActionMenu>
      <PromptInputActionMenuTrigger tooltip={`Approval: ${active.label}`}>
        <ActiveIcon size={16} />
        <span className="ml-1 text-xs">{active.label}</span>
      </PromptInputActionMenuTrigger>
      <PromptInputActionMenuContent>
        {OPTIONS.map(({ id, label, description, icon: Icon }) => (
          <PromptInputActionMenuItem
            key={id}
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => setApprovalMode(id)}
          >
            <Icon className="size-4" />
            <div className="flex-1">
              <div className="font-medium">{label}</div>
              <div className="text-xs text-muted-foreground">{description}</div>
            </div>
            {mode === id && <CheckIcon className="size-4 text-green-500" />}
          </PromptInputActionMenuItem>
        ))}
      </PromptInputActionMenuContent>
    </PromptInputActionMenu>
  );
});
