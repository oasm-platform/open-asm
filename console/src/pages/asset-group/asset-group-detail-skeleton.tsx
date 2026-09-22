import Page from '@/components/common/page';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** Full-page skeleton mirroring the group detail card: identity row, field grid,
 * then the schedule / tools / hosts sections that share the same card. */
export function AssetGroupDetailSkeleton() {
  return (
    <Page isShowButtonGoBack permission="group.read">
      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex items-center gap-3 p-5">
          <Skeleton className="size-3 shrink-0 rounded-full" />
          <Skeleton className="h-6 w-48" />
        </div>
        <CardContent className="border-t py-4">
          <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        </CardContent>
        <div className="border-t p-5">
          <Skeleton className="h-[180px] w-full rounded-lg" />
        </div>
        <div className="border-t p-5">
          <Skeleton className="h-[280px] w-full rounded-lg" />
        </div>
      </Card>
    </Page>
  );
}
