import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  TargetChangeKind,
  useTargetsControllerGetTargetChangesInfinite,
  useTargetsControllerGetTargetRunsInfinite,
} from '@/services/apis/gen/queries';
import { Activity, Loader2, Radar } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { TargetRunRow } from '../components/target-run-row';
import { ChangeRow } from './overview-tab';

const RUNS_PER_PAGE = 10;
const CHANGES_PER_PAGE = 30;

/** Both cards share one height; their lists scroll inside. */
const LIST_CARD = 'h-[40rem] gap-4';
const LIST_CONTENT = 'flex min-h-0 flex-1 flex-col overflow-y-auto';

const CHANGE_FILTERS: Array<{ value?: TargetChangeKind; label: string }> = [
  { label: 'All' },
  { value: TargetChangeKind.asset, label: 'Assets' },
  { value: TargetChangeKind.service, label: 'Services' },
  { value: TargetChangeKind.vulnerability, label: 'Vulnerabilities' },
  { value: TargetChangeKind.fixed, label: 'Fixed' },
];

/** Paging of a list API, for `useInfiniteQuery`. */
const nextPage = (last: { hasNextPage: boolean; page: number }) =>
  last.hasNextPage ? last.page + 1 : undefined;

/**
 * Loads the next page when the end of a scrolling list comes into view (or
 * is already in view after a page lands, so a tall card fills up).
 */
function LoadMore({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sentinel = ref.current;
    if (!sentinel || !hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void fetchNextPage();
      },
      { root: sentinel.parentElement, rootMargin: '0px 0px 200px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <>
      <div ref={ref} aria-hidden className="h-px shrink-0" />
      {isFetchingNextPage && (
        <div className="flex justify-center py-3">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      )}
    </>
  );
}

function RowsSkeleton({ rows, className }: { rows: number; className: string }) {
  return (
    <>
      {[...Array(rows)].map((_, i) => (
        <div key={i} className={cn('my-1.5 animate-pulse rounded-md bg-muted/40', className)} />
      ))}
    </>
  );
}

/** Every run that scanned the target, and what appeared on it. */
export function TargetActivityTab({ targetId }: { targetId: string }) {
  const [activeOnly, setActiveOnly] = useState(false);
  const [kind, setKind] = useState<TargetChangeKind | undefined>();

  const runs = useTargetsControllerGetTargetRunsInfinite(
    targetId,
    { limit: RUNS_PER_PAGE, active: activeOnly || undefined },
    {
      query: {
        initialPageParam: 1,
        getNextPageParam: nextPage,
        refetchInterval: 10_000,
      },
    },
  );
  const changes = useTargetsControllerGetTargetChangesInfinite(
    targetId,
    { limit: CHANGES_PER_PAGE, kind },
    {
      query: {
        initialPageParam: 1,
        getNextPageParam: nextPage,
        refetchOnWindowFocus: false,
      },
    },
  );
  const runRows = runs.data?.pages.flatMap((page) => page.data) ?? [];
  const changeRows = changes.data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className={cn(LIST_CARD, 'lg:col-span-3')}>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="flex items-center gap-2">
            <Radar className="size-5 text-primary" />
            Runs
            {runs.data && (
              <span className="text-sm font-normal text-muted-foreground">
                {runs.data.pages[0]?.total ?? 0}
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Switch
              id="runs-active-only"
              checked={activeOnly}
              onCheckedChange={setActiveOnly}
            />
            <Label htmlFor="runs-active-only" className="font-normal">
              Running only
            </Label>
          </div>
        </CardHeader>
        <CardContent className={cn(LIST_CONTENT, 'divide-y')}>
          {runs.isLoading ? (
            <RowsSkeleton rows={6} className="h-12" />
          ) : runRows.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              {activeOnly ? 'Nothing is running.' : 'No run has scanned this target yet.'}
            </p>
          ) : (
            <>
              {runRows.map((run) => (
                <TargetRunRow key={run.id} run={run} />
              ))}
              <LoadMore
                hasNextPage={runs.hasNextPage}
                isFetchingNextPage={runs.isFetchingNextPage}
                fetchNextPage={runs.fetchNextPage}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Card className={cn(LIST_CARD, 'lg:col-span-2')}>
        <CardHeader className="flex flex-col gap-3 space-y-0">
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-5 text-primary" />
            Changes
            {changes.data && (
              <span className="text-sm font-normal text-muted-foreground">
                {changes.data.pages[0]?.total ?? 0}
              </span>
            )}
          </CardTitle>
          <div className="flex flex-wrap gap-1.5">
            {CHANGE_FILTERS.map((filter) => (
              <Button
                key={filter.label}
                size="sm"
                variant="outline"
                className={cn(
                  'h-7 rounded-full',
                  kind === filter.value && 'border-primary bg-primary/10 text-primary',
                )}
                onClick={() => setKind(filter.value)}
              >
                {filter.label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className={cn(LIST_CONTENT, 'divide-y')}>
          {changes.isLoading ? (
            <RowsSkeleton rows={10} className="h-6" />
          ) : changeRows.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <>
              {changeRows.map((change) => (
                <ChangeRow key={`${change.kind}-${change.id}`} change={change} />
              ))}
              <LoadMore
                hasNextPage={changes.hasNextPage}
                isFetchingNextPage={changes.isFetchingNextPage}
                fetchNextPage={changes.fetchNextPage}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
