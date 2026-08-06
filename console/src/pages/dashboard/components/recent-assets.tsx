import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { useAssetsControllerGetHostAssets } from '@/services/apis/gen/queries';
import { ChevronRight, Clock } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const RecentAssets = () => {
  const navigate = useNavigate();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const { data, isLoading, error } = useAssetsControllerGetHostAssets(
    {
      page: 1,
      limit: 10,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
    },
    {
      query: {
        queryKey: ['recent-hosts', selectedWorkspaceId],
      },
    },
  );

  const recentHosts = data?.data ?? [];

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Recent Hosts
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
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Recent Hosts
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
          <Clock className="h-5 w-5 text-primary" />
          Recent Hosts
        </CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        {recentHosts.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No new hosts discovered
          </div>
        ) : (
          <div className="min-h-0 h-full space-y-0.5 overflow-y-auto pr-1">
            {recentHosts.map((host) => (
              <button
                key={host.id}
                className="group flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
                onClick={() =>
                  navigate({
                    to: '/assets',
                    search: {
                      tab: 'host',
                      page: 1,
                      pageSize: 1,
                      filter: host.host,
                    },
                  })
                }
              >
                <span className="truncate text-sm">{host.host}</span>
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  {dayjs(host.createdAt).fromNow()}
                  <ChevronRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RecentAssets;
