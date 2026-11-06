import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { IssueRefLink } from '@/components/vulnerabilities/lifecycle-badges';
import type {
  VulnerabilityDetailDto,
  VulnerabilityTimelineEventDto,
} from '@/services/apis/gen/queries';
import { format } from 'date-fns';
import { RotateCcw } from 'lucide-react';
import { RunLink } from './links';

const byNewest = (
  a: VulnerabilityTimelineEventDto,
  b: VulnerabilityTimelineEventDto,
) => b.occurredAt.localeCompare(a.occurredAt);

/** When, by which run, a fixed finding came back, and whether its issue reopened. */
export function ResurfacedBanner({
  data,
  events,
}: {
  data: VulnerabilityDetailDto;
  events?: VulnerabilityTimelineEventDto[];
}) {
  if (data.detectionStatus !== 'resurfaced') return null;
  const sorted = [...(events ?? [])].sort(byNewest);
  const resurfaced = sorted.find(
    (e) => e.type === 'status_changed' && e.toStatus === 'resurfaced',
  );
  const fixed = sorted.find(
    (e) =>
      e.type === 'status_changed' &&
      e.toStatus === 'fixed' &&
      (!resurfaced || e.occurredAt <= resurfaced.occurredAt),
  );
  const fixedAt = fixed?.occurredAt ?? data.fixedAt;
  const fixedRun = fixed?.jobHistoryId ?? data.fixedByJobHistoryId;

  return (
    <Alert
      className="border-pink-500/40 bg-pink-500/5 text-pink-900 dark:text-pink-100"
      data-testid="resurfaced-banner"
    >
      <RotateCcw className="size-4 !text-pink-600" />
      <AlertTitle>Resurfaced</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-x-1 text-sm">
        {resurfaced ? (
          <>
            Reported again on{' '}
            {format(new Date(resurfaced.occurredAt), 'dd MMM yyyy')}
            {resurfaced.jobHistoryId && (
              <>
                {' '}
                by <RunLink id={resurfaced.jobHistoryId} />
              </>
            )}
          </>
        ) : (
          'Reported again'
        )}
        {fixedAt && (
          <>
            {' '}
            after it was confirmed fixed on{' '}
            {format(new Date(fixedAt), 'dd MMM yyyy')}
            {fixedRun && (
              <>
                {' '}
                (<RunLink id={fixedRun} />)
              </>
            )}
          </>
        )}
        .
        {data.openIssue && (
          <>
            {' '}
            Issue <IssueRefLink issue={data.openIssue} /> is open again.
          </>
        )}
      </AlertDescription>
    </Alert>
  );
}
