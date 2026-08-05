import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { useStatisticControllerGetInventoryChanges } from '@/services/apis/gen/queries';
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
  const { data, isLoading, error } = useStatisticControllerGetInventoryChanges({
    query: {
      queryKey: ['inventory-changes', selectedWorkspaceId],
    },
  });

  const recentAssets = data?.recentAssets ?? [];

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Recent Assets
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
            Recent Assets
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
          Recent Assets
        </CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        {recentAssets.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No new assets discovered
          </div>
        ) : (
          <div className="min-h-0 h-full space-y-0.5 overflow-y-auto pr-1">
            {recentAssets.map((asset) => (
              <button
                key={asset.id}
                className="group flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
                onClick={() =>
                  navigate({
                    to: '/assets',
                    search: {
                      tab: 'host',
                      page: 1,
                      hosts: asset.value,
                    },
                  })
                }
              >
                <span className="truncate text-sm">{asset.value}</span>
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  {dayjs(asset.createdAt).fromNow()}
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
