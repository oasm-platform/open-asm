import { useT } from '@/lib/i18n-dictionary';
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
import { CheckIcon, HandIcon, ZapIcon } from 'lucide-react';
import { memo } from 'react';

const OPTIONS: Array<{
  id: ApprovalMode;
  labelKey: string;
  descriptionKey: string;
  icon: typeof ZapIcon;
}> = [
  {
    id: 'auto',
    labelKey: 'components.approvalMode.auto',
    descriptionKey: 'components.approvalMode.autoDescription',
    icon: ZapIcon,
  },
  {
    id: 'manual',
    labelKey: 'components.approvalMode.manual',
    descriptionKey: 'components.approvalMode.manualDescription',
    icon: HandIcon,
  },
];

export const ApprovalModeSelect = memo(function ApprovalModeSelect() {
  const t = useT();
  const mode = useApprovalMode();
  const active = OPTIONS.find((o) => o.id === mode) ?? OPTIONS[1];
  const ActiveIcon = active.icon;

  return (
    <PromptInputActionMenu>
      <PromptInputActionMenuTrigger tooltip={t('components.approvalMode.tooltip', { mode: t(active.labelKey) })}>
        <ActiveIcon size={16} />
        <span className="ml-1 text-xs">{t(active.labelKey)}</span>
      </PromptInputActionMenuTrigger>
      <PromptInputActionMenuContent>
        {OPTIONS.map(({ id, labelKey, descriptionKey, icon: Icon }) => (
          <PromptInputActionMenuItem
            key={id}
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => setApprovalMode(id)}
          >
            <Icon className="size-4" />
            <div className="flex-1">
              <div className="font-medium">{t(labelKey)}</div>
              <div className="text-xs text-muted-foreground">
                {t(descriptionKey)}
              </div>
            </div>
            {mode === id && <CheckIcon className="size-4 text-green-500" />}
          </PromptInputActionMenuItem>
        ))}
      </PromptInputActionMenuContent>
    </PromptInputActionMenu>
  );
});
