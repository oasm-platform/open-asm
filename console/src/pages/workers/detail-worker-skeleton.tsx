import Page from '@/components/common/page';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

/** Full-page skeleton mirroring the worker detail card (identity + field grid)
 * and the bare connected-tools graph. */
export function WorkerDetailSkeleton() {
  return (
    <Page isShowButtonGoBack permission="worker.read">
      <div className="space-y-4">
        <Card className="gap-0 overflow-hidden py-0">
          <div className="flex items-center gap-4 p-5">
            <Skeleton className="size-16 shrink-0 rounded-2xl" />
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-16" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-16" />
              </div>
            </div>
          </div>
          <Separator />
          <CardContent className="py-4">
            <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>

        <Skeleton className="h-[320px] w-full rounded-lg" />
      </div>
    </Page>
  );
}
