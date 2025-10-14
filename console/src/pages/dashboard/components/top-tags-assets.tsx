import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { useStatisticControllerGetTopTagsAssets, type TopTagAsset } from '@/services/apis/gen/queries';
import { Tag } from 'lucide-react';

export default function TopTagsAssets() {
  const { selectedWorkspace } = useWorkspaceSelector();

  const { data: topTags, isLoading } = useStatisticControllerGetTopTagsAssets(
    {
      query: {
        enabled: !!selectedWorkspace,
        refetchInterval: 5000, // Auto refresh every 5 seconds
      },
    },
  );

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="h-4 bg-muted rounded w-1/3"></div>
          <div className="h-5 w-5 bg-muted rounded-full"></div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {[...Array(5)].map((_, index) => (
              <div key={index} className="h-6 bg-muted rounded w-20"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const maxCount = topTags && topTags.length > 0 ? topTags[0].count : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="font-medium text-base">Top Tags Assets</CardTitle>
        <Tag className="h-5 w-5 text-primary" />
      </CardHeader>
      {!topTags || topTags.length === 0 && (
        <CardContent className="text-center text-sm text-muted-foreground">
          No tags assets found
        </CardContent>
      )}
      <CardContent>
        <div className="flex flex-col gap-2">
          {topTags &&
            topTags.map((item: TopTagAsset, index: number) => (
              <div key={index} className="flex items-center gap-2">
                <span className="w-1/6 truncate text-sm font-bold">{item.tag}</span>
                <Progress
                  value={maxCount > 0 ? (item.count / maxCount) * 100 : 0}
                  className="w-4/6"
                />
                <span className="w-1/6 text-right text-sm">{item.count}</span>
              </div>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}