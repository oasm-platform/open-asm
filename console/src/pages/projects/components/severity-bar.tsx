import { cn } from '@/lib/utils';
import type { SeverityCountsDto } from '@/services/apis/gen/queries';
import { memo } from 'react';
import { SEVERITIES, totalOf } from '../project-utils';

/** Stacked bar of open vulnerabilities by severity. */
export const SeverityBar = memo(function SeverityBar({
  counts,
  className,
}: {
  counts?: SeverityCountsDto | null;
  className?: string;
}) {
  const total = totalOf(counts);
  return (
    <div
      className={cn('flex h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
      role="img"
      aria-label={
        total
          ? SEVERITIES.map((s) => `${counts?.[s.key] ?? 0} ${s.label.toLowerCase()}`).join(', ')
          : 'No open vulnerabilities'
      }
    >
      {total > 0 &&
        SEVERITIES.map((s) =>
          counts?.[s.key] ? (
            <span
              key={s.key}
              className={s.bar}
              style={{ width: `${((counts[s.key] ?? 0) / total) * 100}%` }}
            />
          ) : null,
        )}
    </div>
  );
});

/** Counts per severity in their colours, zeros left out. */
export const SeverityCounts = memo(function SeverityCounts({
  counts,
  className,
  empty = 'No open vulnerabilities',
}: {
  counts?: SeverityCountsDto | null;
  className?: string;
  empty?: string;
}) {
  if (!totalOf(counts)) {
    return <span className="text-sm text-muted-foreground">{empty}</span>;
  }
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1', className)}>
      {SEVERITIES.map((s) =>
        counts?.[s.key] ? (
          <span
            key={s.key}
            title={s.label}
            className={cn(
              'inline-flex items-center gap-1.5 font-mono text-sm font-semibold tabular-nums',
              s.text,
            )}
          >
            <span className={cn('size-2 rounded-full', s.bar)} />
            {counts[s.key]}
          </span>
        ) : null,
      )}
    </div>
  );
});
