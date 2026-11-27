import Page from '@/components/common/page';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

/** Full-page skeleton mirroring the title, the header badges, the tab row and
 * the telemetry card of the Overview tab. */
export function WorkerDetailSkeleton() {
  return (
    <Page
      permission="worker.read"
      title={
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 shrink-0 rounded-lg" />
          <Skeleton className="h-7 w-48" />
        </div>
      }
      header={
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-16" />
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-9 w-24" />
          ))}
        </div>

        <Card className="gap-0 overflow-hidden py-0">
          <div className="space-y-2 px-6 pt-6">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-72" />
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
      </div>
    </Page>
  );
}
