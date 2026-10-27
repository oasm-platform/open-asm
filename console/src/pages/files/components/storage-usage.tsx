import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import type { ArtifactUsageDto } from '@/services/apis/gen/queries';
import { formatBytes } from '@/utils/format-bytes';

/** Workspace storage meter: used (plus in-flight uploads) against the quota. */
export function StorageUsage({ usage }: { usage?: ArtifactUsageDto }) {
  if (!usage) return <Skeleton className="h-16 w-full" />;

  const taken = usage.usedBytes + usage.reservedBytes;
  const percent = usage.quotaBytes
    ? Math.min(100, (taken / usage.quotaBytes) * 100)
    : 100;

  return (
    <div className="rounded-lg border p-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium">Workspace storage</span>
        <span className="text-muted-foreground">
          {usage.usedBytes ? formatBytes(usage.usedBytes) : '0 B'} of{' '}
          {formatBytes(usage.quotaBytes)} used · max{' '}
          {formatBytes(usage.maxFileBytes)} per file
        </span>
      </div>
      <Progress value={percent} aria-label="Workspace storage used" />
    </div>
  );
}
