import Page from '@/components/common/page';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

/** Full-page skeleton mirroring the combined identity/telemetry card and the
 * connected-tools graph. */
export function WorkerDetailSkeleton() {
  return (
    <Page isShowButtonGoBack permission="worker.read">
      <div className="space-y-6">
        <Card className="gap-0 overflow-hidden py-0">
          <div className="flex items-center gap-4 border-b border-border/60 p-6">
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

          <div className="grid gap-4 p-6 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>

          <Separator />

          <div className="space-y-4 p-6">
            <Skeleton className="h-6 w-28" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-40 rounded-xl" />
          </div>
        </Card>

        <div className="rounded-lg border p-1.5">
          <Skeleton className="h-[620px] w-full rounded-md" />
        </div>
      </div>
    </Page>
  );
}
