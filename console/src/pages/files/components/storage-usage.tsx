import { useT } from '@/lib/i18n-dictionary';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import type { ArtifactUsageDto } from '@/services/apis/gen/queries';
import { formatBytes } from '@/utils/format-bytes';

/** Workspace storage meter: used (plus in-flight uploads) against the quota. */
export function StorageUsage({ usage }: { usage?: ArtifactUsageDto }) {
  const t = useT();
  if (!usage) return <Skeleton className="h-16 w-full" />;

  const taken = usage.usedBytes + usage.reservedBytes;
  const percent = usage.quotaBytes
    ? Math.min(100, (taken / usage.quotaBytes) * 100)
    : 100;

  return (
    // Dark mode: the card fill, as plain outlines are off there
    <div className="rounded-lg border p-4 space-y-2 dark:bg-card-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium">{t('files.storage.title')}</span>
        <span className="text-muted-foreground">
          {t('files.storage.usage', {
            used: usage.usedBytes ? formatBytes(usage.usedBytes) : '0 B',
            quota: formatBytes(usage.quotaBytes),
            max: formatBytes(usage.maxFileBytes),
          })}
        </span>
      </div>
      <Progress value={percent} aria-label={t('files.storage.used')} />
    </div>
  );
}
