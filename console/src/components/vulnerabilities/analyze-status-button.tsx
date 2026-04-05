import { Button } from '@/components/ui/button';
import {
  VulnerabilityAnalyzeStatus,
  useVulnerabilitiesControllerAnalyzeVulnerability,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
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
    label: string;
    className: string;
    icon: ReactNode;
    variant: 'outline';
    disabled: boolean;
  }
> = {
  [VulnerabilityAnalyzeStatus.not_analyzed]: {
    label: 'Analyze',
    className: 'border-slate-500/30 text-slate-600 dark:text-slate-400',
    icon: <Play size={10} />,
    variant: 'outline',
    disabled: false,
  },
  [VulnerabilityAnalyzeStatus.running]: {
    label: 'Running',
    className: 'border-purple-500 text-purple-600 dark:text-purple-500',
    icon: <Loader2 size={10} className="animate-spin" />,
    variant: 'outline',
    disabled: true,
  },
  [VulnerabilityAnalyzeStatus.done]: {
    label: 'Analyzed',
    className: 'text-green-600 dark:text-green-400',
    icon: <CheckCircle2 size={12} />,
    variant: 'outline',
    disabled: false,
  },
  [VulnerabilityAnalyzeStatus.failed]: {
    label: 'Retry',
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
  const queryClient = useQueryClient();
  const config =
    statusConfig[status] ||
    statusConfig[VulnerabilityAnalyzeStatus.not_analyzed];

  const { mutate: analyzeVulnerability } =
    useVulnerabilitiesControllerAnalyzeVulnerability({
      mutation: {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['vulnerabilities'] });
          onAnalyze?.();
        },
      },
    });

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (status === VulnerabilityAnalyzeStatus.not_analyzed) {
      analyzeVulnerability({ id, data: {} });
    } else if (status === VulnerabilityAnalyzeStatus.done) {
      onView?.();
    } else if (status === VulnerabilityAnalyzeStatus.failed) {
      analyzeVulnerability({ id, data: { forceRerun: true } });
    }
  };

  // Render as plain text indicator when done, button otherwise
  const button =
    status === VulnerabilityAnalyzeStatus.done ? (
      <div
        className={`flex items-center gap-1.5 h-7 text-xs px-2 ${config.className} ${className || ''}`}
      >
        {config.icon}
        {config.label}
      </div>
    ) : (
      <Button
        variant={config.variant}
        className={`gap-1 h-8 text-xs px-2 ${config.className} ${className || ''}`}
        disabled={config.disabled}
        onClick={handleClick}
      >
        {config.icon}
        {config.label}
      </Button>
    );

  return button;
}
