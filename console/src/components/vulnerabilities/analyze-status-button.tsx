import { Button } from '@/components/ui/button';
import { useAgentSettingsDialog } from '@/hooks/useAgentSettingsDialog';
import { useLLMConfigs } from '@/hooks/use-llm-configs';
import { useT } from '@/lib/i18n-dictionary';
import {
  VulnerabilityAnalyzeStatus,
  useVulnerabilitiesControllerAnalyzeVulnerability,
} from '@/services/apis/gen/queries';
import { CheckCircle2, Loader2, Play, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';

interface AnalyzeStatusButtonProps {
  id: string;
  status: VulnerabilityAnalyzeStatus;
  result?: string;
  className?: string;
  onAnalyze?: () => void;
  onView?: () => void;
}

const statusConfig: Record<
  string,
  {
    /** i18n key */
    label: string;
    className: string;
    icon: ReactNode;
    variant: 'outline';
    disabled: boolean;
  }
> = {
  [VulnerabilityAnalyzeStatus.not_analyzed]: {
    label: 'vulnerabilities.analyze.analyze',
    className: 'border-slate-500/30 text-slate-600 dark:text-slate-400',
    icon: <Play size={10} />,
    variant: 'outline',
    disabled: false,
  },
  [VulnerabilityAnalyzeStatus.running]: {
    label: 'vulnerabilities.analyze.running',
    className: 'border-purple-500 text-purple-600 dark:text-purple-500',
    icon: <Loader2 size={10} className="animate-spin" />,
    variant: 'outline',
    disabled: true,
  },
  [VulnerabilityAnalyzeStatus.done]: {
    label: 'vulnerabilities.analyze.done',
    className: 'text-green-600 dark:text-green-400',
    icon: <CheckCircle2 size={12} />,
    variant: 'outline',
    disabled: false,
  },
  [VulnerabilityAnalyzeStatus.failed]: {
    label: 'vulnerabilities.analyze.retry',
    className: 'border-red-500/30 text-red-600 dark:text-red-400',
    icon: <RefreshCw size={10} />,
    variant: 'outline',
    disabled: false,
  },
};

export function AnalyzeStatusButton({
  id,
  status,
  className,
  onAnalyze,
  onView,
}: AnalyzeStatusButtonProps) {
  const t = useT();
  const { hasProviderConnected, isLoading: llmLoading } = useLLMConfigs();
  const { open: openAgentSettings } = useAgentSettingsDialog();
  const { mutate: analyzeVulnerability } =
    useVulnerabilitiesControllerAnalyzeVulnerability();

  const config =
    statusConfig[status] ||
    statusConfig[VulnerabilityAnalyzeStatus.not_analyzed];

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    // If no LLM provider is connected, redirect to agent settings
    if (!llmLoading && !hasProviderConnected) {
      openAgentSettings('provider');
      return;
    }

    if (status === VulnerabilityAnalyzeStatus.not_analyzed) {
      analyzeVulnerability(
        { id, data: { forceRerun: false } },
        { onSuccess: () => onAnalyze?.() },
      );
    } else if (status === VulnerabilityAnalyzeStatus.done) {
      onView?.();
    } else if (status === VulnerabilityAnalyzeStatus.failed) {
      analyzeVulnerability(
        { id, data: { forceRerun: true } },
        { onSuccess: () => onAnalyze?.() },
      );
    }
  };

  // Render as plain text indicator when done, button otherwise
  const button =
    status === VulnerabilityAnalyzeStatus.done ? (
      <div
        className={`flex items-center gap-1.5 h-7 text-xs px-2 ${config.className} ${className || ''}`}
      >
        {config.icon}
        {t(config.label)}
      </div>
    ) : (
      <Button
        variant={config.variant}
        className={`gap-1 h-8 text-xs px-2 ${config.className} ${className || ''}`}
        disabled={config.disabled}
        onClick={handleClick}
      >
        {config.icon}
        {t(config.label)}
      </Button>
    );

  return button;
}
