import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { useStatisticControllerGetTopAssetsWithMostVulnerabilities } from '@/services/apis/gen/queries';
import { Bug, ChevronRight } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';

const severityColors = {
  info: 'bg-muted-foreground/40',
  low: 'bg-chart-1',
  medium: 'bg-chart-2',
  high: 'bg-chart-3',
  critical: 'bg-chart-5',
};

const severityOrder = ['info', 'low', 'medium', 'high', 'critical'] as const;

const TopAssetsVulnerabilities = () => {
  const navigate = useNavigate();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const {
    data: apiData,
    isLoading,
    error,
  } = useStatisticControllerGetTopAssetsWithMostVulnerabilities({
    query: {
      queryKey: ['top-assets-vulnerabilities', selectedWorkspaceId],
    },
  });

  const assets = (apiData ?? []).filter((item) => item.total !== 0);

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bug className="h-5 w-5 text-primary" />
            Top assets with most vulnerabilities
          </CardTitle>
        </CardHeader>
        <CardContent className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Loading...
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bug className="h-5 w-5 text-primary" />
            Top assets with most vulnerabilities
          </CardTitle>
        </CardHeader>
        <CardContent className="flex h-full items-center justify-center text-sm text-red-600">
          Error loading data
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bug className="h-5 w-5 text-primary" />
          Top assets with most vulnerabilities
        </CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        {assets.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No assets with vulnerabilities
          </div>
        ) : (
          <div className="min-h-0 h-full space-y-1 overflow-y-auto pr-1">
            {assets.map((item) => (
              <button
                key={item.id}
                className="group w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
                onClick={() =>
                  item.value &&
                  navigate({
                    to: '/assets',
                    search: { tab: 'host', hosts: item.value },
                  })
                }
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate pr-2 font-medium">
                    {item.value}
                  </span>
                  <span className="flex items-center gap-1 font-mono text-muted-foreground">
                    {item.total}
                    <ChevronRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                </div>
                <div className="mt-1 flex h-1 w-full overflow-hidden rounded-full bg-muted">
                  {severityOrder.map((severity) => {
                    const count = item[severity] || 0;
                    if (count === 0) return null;
                    return (
                      <div
                        key={severity}
                        className={clsx('h-full', severityColors[severity])}
                        style={{ width: `${(count / item.total) * 100}%` }}
                      />
                    );
                  })}
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TopAssetsVulnerabilities;
