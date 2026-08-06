import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { useStatisticControllerGetTopPorts } from '@/services/apis/gen/queries';
import { ChevronRight, Radio } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';

const TopPorts = () => {
  const navigate = useNavigate();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const { data, isLoading, error } = useStatisticControllerGetTopPorts({
    query: {
      queryKey: ['top-ports', selectedWorkspaceId],
    },
  });

  if (isLoading) {
    return (
      <Card className="h-[340px] overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" />
            Top Ports
          </CardTitle>
        </CardHeader>
        <CardContent className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Loading...
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="h-[340px] overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" />
            Top Ports
          </CardTitle>
        </CardHeader>
        <CardContent className="flex h-full items-center justify-center text-sm text-red-600">
          Error loading data
        </CardContent>
      </Card>
    );
  }

  const maxCount = data.ports.reduce(
    (max, item) => Math.max(max, item.count),
    0,
  );

  return (
    <Card className="flex h-[340px] flex-col overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Radio className="h-5 w-5 text-primary" />
          Top Ports
        </CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        {data.ports.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No ports exposed
          </div>
        ) : (
          <div className="min-h-0 h-full space-y-1 overflow-y-auto pr-1">
            {data.ports.map((item) => (
              <button
                key={item.port}
                className="group w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
                onClick={() =>
                  navigate({
                    to: '/assets',
                    search: {
                      tab: 'port',
                      page: 1,
                      ports: String(item.port),
                    },
                  })
                }
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="font-semibold font-mono">{item.port}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide ${
                        item.isStandard
                          ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400'
                          : 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400'
                      }`}
                    >
                      {item.isStandard ? 'std' : 'non-std'}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 font-mono text-muted-foreground">
                    {item.count}
                    <ChevronRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                </div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all ${
                      item.isStandard ? 'bg-primary' : 'bg-orange-400'
                    }`}
                    style={{
                      width: `${maxCount ? (item.count / maxCount) * 100 : 0}%`,
                    }}
                  />
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TopPorts;
