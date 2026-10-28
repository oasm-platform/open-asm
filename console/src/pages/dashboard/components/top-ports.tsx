import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { TopPortsSkeleton } from './dashboard-skeleton';
import { useStatisticControllerGetTopPorts } from '@/services/apis/gen/queries';
import { ChevronRight, Radio } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';

/**
 * Well-known ports of services that should rarely face the internet, by what
 * an exposure there gives away. Any other port is shown without a label.
 */
const RISKY_PORTS: Record<number, string> = Object.fromEntries(
  Object.entries({
    'Remote access': [22, 23, 3389, 5900, 5985, 5986],
    'File sharing': [21, 139, 445, 2049],
    Database: [1433, 1521, 3306, 5432, 5984, 6379, 9042, 9200, 11211, 27017],
    'Container API': [2375, 2376, 6443, 10250],
  }).flatMap(([label, ports]) => ports.map((port) => [port, label])),
);

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

  if (isLoading) return <TopPortsSkeleton />;

  if (error || !data) {
    return (
      <Card className="h-[340px] overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" />
            Top exposed ports
          </CardTitle>
        </CardHeader>
        <CardContent className="flex h-full items-center justify-center text-sm text-destructive">
          Couldn&apos;t load data
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
          Top exposed ports
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
                    {RISKY_PORTS[item.port] && (
                      <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400">
                        {RISKY_PORTS[item.port]}
                      </span>
                    )}
                  </span>
                  <span
                    className="flex items-center gap-1 font-mono text-muted-foreground"
                    title={`${item.count} services on this port`}
                  >
                    {item.count}
                    <ChevronRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                </div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all ${
                      RISKY_PORTS[item.port] ? 'bg-orange-400' : 'bg-primary'
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
