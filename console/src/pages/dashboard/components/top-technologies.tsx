import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { useStatisticControllerGetTopTechnologies } from '@/services/apis/gen/queries';
import { ChevronRight, Layers } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';

const TopTechnologies = () => {
  const navigate = useNavigate();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const { data, isLoading, error } = useStatisticControllerGetTopTechnologies({
    query: {
      queryKey: ['top-technologies', selectedWorkspaceId],
    },
  });

  if (isLoading) {
    return (
      <Card className="h-[340px] overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Technologies
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
            <Layers className="h-5 w-5 text-primary" />
            Technologies
          </CardTitle>
        </CardHeader>
        <CardContent className="flex h-full items-center justify-center text-sm text-red-600">
          Error loading data
        </CardContent>
      </Card>
    );
  }

  const maxCount = data.technologies.reduce(
    (max, item) => Math.max(max, item.count),
    0,
  );

  return (
    <Card className="flex h-[340px] flex-col overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" />
          Technologies
        </CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        {data.technologies.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No technologies detected
          </div>
        ) : (
          <div className="min-h-0 h-full space-y-1 overflow-y-auto pr-1">
            {data.technologies.map((item) => (
              <button
                key={item.name}
                className="group w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
                onClick={() =>
                  navigate({
                    to: '/assets',
                    search: {
                      tab: 'technology',
                      page: 1,
                      techs: item.name,
                    },
                  })
                }
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate pr-2 font-medium">{item.name}</span>
                  <span className="flex items-center gap-1 font-mono text-muted-foreground">
                    {item.count}
                    <ChevronRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                </div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
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

export default TopTechnologies;
