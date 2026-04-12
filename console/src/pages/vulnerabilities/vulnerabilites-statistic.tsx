import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { useVulnerabilitiesControllerGetVulnerabilitiesStatistics } from '@/services/apis/gen/queries';
import clsx from 'clsx';
import { useLocation } from 'react-router-dom';

interface VulnerabilitiesStatisticProps {
  targetId?: string;
}
const VulnerabilitiesStatistic = ({
  targetId,
}: VulnerabilitiesStatisticProps) => {
  const { selectedWorkspace } = useWorkspaceSelector();
  const location = useLocation();

  // Extract targetId from URL search params if present
  const urlParams = new URLSearchParams(location.search);
  const urlTargetId = urlParams.get('targetId') || undefined;

  // Use targetId from props if provided, otherwise use from URL
  if (!targetId) {
    targetId = urlTargetId;
  }

  const { data, isLoading } =
    useVulnerabilitiesControllerGetVulnerabilitiesStatistics(
      {
        workspaceId: selectedWorkspace ?? '',
        ...(targetId ? { targetIds: [targetId] } : {}),
      },
      {
        query: {
          enabled: !!selectedWorkspace,
          refetchInterval: 5000,
        },
      },
    );

  // Create a map of severity to count for easy access
  const severityCounts = data?.data?.reduce(
    (acc, item) => {
      acc[item.severity] = item.count;
      return acc;
    },
    {} as Record<string, number>,
  ) || {
    info: 0,
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  // Loading state - show skeleton
  if (isLoading) {
    return (
      <div className="flex items-center gap-12">
        {[...Array(5)].map((_, index) => (
          <div key={index} className="flex flex-col animate-pulse">
            <div className="h-4 bg-muted rounded w-16 mb-1"></div>
            <div className="h-8 bg-muted rounded w-8"></div>
          </div>
        ))}
      </div>
    );
  }

  const severityConfig = [
    { key: 'critical', label: 'Critical', color: 'text-red-500' },
    { key: 'high', label: 'High', color: 'text-orange-500' },
    { key: 'medium', label: 'Medium', color: 'text-yellow-500' },
    { key: 'low', label: 'Low', color: 'text-blue-500' },
    { key: 'info', label: 'Info', color: '' },
  ];

  return (
    <div className="flex items-center gap-12">
      {severityConfig.map(({ key, label, color }) => (
        <div key={key} className="flex flex-col">
          <span className="text-muted-foreground text-sm">{label}</span>
          <span className={clsx('text-2xl font-bold ', color)}>
            {severityCounts[key]}
          </span>
        </div>
      ))}
    </div>
  );
};

export default VulnerabilitiesStatistic;
