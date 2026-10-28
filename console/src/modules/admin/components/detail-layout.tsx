import Page from '@/components/common/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import type { ReactNode } from 'react';

export const formatDetailDate = (value?: string | null) =>
  value ? format(new Date(value), 'PPP') : '—';

/** Hero card shared by the admin detail pages: media, title, badges, subtitle. */
export function DetailHero({
  media,
  title,
  subtitle,
  badges,
}: {
  media: ReactNode;
  title: string;
  subtitle?: ReactNode;
  badges?: ReactNode;
}) {
  return (
    <Card>
      <CardContent>
        <div className="flex min-w-0 items-center gap-4">
          <div className="shrink-0">{media}</div>
          <div className="min-w-0 space-y-2">
            <div className="space-y-0.5">
              <h1 className="truncate text-2xl font-semibold tracking-tight">
                {title}
              </h1>
              {subtitle && (
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {subtitle}
                </p>
              )}
            </div>
            {badges && <div className="flex flex-wrap gap-2">{badges}</div>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** One label/value pair in a detail card grid. */
export function DetailField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm font-medium break-all">{children}</div>
    </div>
  );
}

/** Card holding a two-column grid of DetailField. */
export function DetailFields({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardContent>
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">{children}</div>
      </CardContent>
    </Card>
  );
}

/** Loading state mirroring hero + tabs + field grid. */
export function DetailSkeleton() {
  return (
    <Page isShowButtonGoBack>
      <div className="mb-4 space-y-4">
        <Card>
          <CardContent>
            <div className="flex items-center gap-4">
              <Skeleton className="size-20 shrink-0 rounded-2xl" />
              <div className="min-w-0 space-y-2">
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-4 w-64" />
                <div className="flex flex-wrap gap-2">
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-6 w-20" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-24" />
        </div>
        <Card>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}

export function DetailNotFound({ entity }: { entity: string }) {
  return (
    <div className="text-center py-12">
      <h2 className="text-xl font-semibold">{entity} not found</h2>
      <p className="text-muted-foreground mt-2">
        The {entity.toLowerCase()} you're looking for doesn't exist or has been
        removed.
      </p>
      <Button className="mt-4" onClick={() => window.history.back()}>
        Go back
      </Button>
    </div>
  );
}
