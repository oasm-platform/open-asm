import Page from '@/components/common/page';
import { Skeleton } from '@/components/ui/skeleton';

/** Mirrors the project detail page: title, tab row, KPI cards and the chart. */
export function ProjectDetailSkeleton() {
  return (
    <Page
      isShowButtonGoBack
      permission="project.read"
      title={<Skeleton className="h-7 w-48" />}
    >
      <div className="flex flex-col gap-5">
        <div className="flex gap-4">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-6 w-20" />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[120px] w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[280px] w-full rounded-xl" />
      </div>
    </Page>
  );
}
