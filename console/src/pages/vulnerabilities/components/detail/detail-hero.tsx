import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DetectionStatusBadge,
  IssueRefLink,
  SlaDue,
} from '@/components/vulnerabilities/lifecycle-badges';
import {
  ageLabel,
  DISMISS_REASON_LABELS,
  isRiskAccepted,
} from '@/components/vulnerabilities/lifecycle';
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/lib/utils';
import {
  useIssuesControllerGetById,
  useVulnerabilitiesControllerGetSettings,
  type VulnerabilityDetailDto,
} from '@/services/apis/gen/queries';
import { Link } from '@tanstack/react-router';
import { differenceInCalendarDays, format, subDays } from 'date-fns';
import { CalendarClock, ClipboardList, Globe, MapPin } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { CreateIssueDialog } from '../create-issue-dialog';
import { SEVERITIES } from '../../../projects/project-utils';
import { SourcesList } from './side-cards';

const fmt = (d?: string | null) =>
  d ? format(new Date(d), 'dd MMM yyyy') : '—';

type SeverityKey = (typeof SEVERITIES)[number]['key'];

/** The finding's entry in the shared severity scale; unknown values read as info. */
const severityOf = (severity?: string | null) => {
  const key = (severity ?? 'info').toLowerCase();
  return SEVERITIES.find((s) => s.key === key) ?? SEVERITIES[SEVERITIES.length - 1];
};

function SeverityPill({ severity }: { severity?: string | null }) {
  const s = severityOf(severity);
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-md bg-muted/60 px-2 text-xs font-semibold uppercase tracking-wide ring-1 ring-inset ring-border',
        s.text,
      )}
    >
      <span className={cn('size-1.5 rounded-full', s.bar)} />
      {s.label}
    </span>
  );
}

/** Dismissal, risk acceptance or fix claim — whatever a person decided. */
function TriageChip({ data }: { data: VulnerabilityDetailDto }) {
  const d = data.dismissal;
  if (d) {
    const risk = d.reason === 'risk_accepted';
    return (
      <Badge
        variant="outline"
        className={cn(
          'h-6 rounded-md',
          risk && 'border-amber-500/40 text-amber-700 dark:text-amber-300',
        )}
      >
        {DISMISS_REASON_LABELS[d.reason] ?? d.reason}
        {risk && d.expiresAt ? ` until ${fmt(d.expiresAt)}` : ''}
      </Badge>
    );
  }
  if (data.fixClaimedAt && data.detectionStatus !== 'fixed') {
    return (
      <Badge
        variant="outline"
        className="h-6 rounded-md border-primary/40 text-primary"
      >
        Fix claimed · awaiting scan
      </Badge>
    );
  }
  return null;
}

function Metric({
  label,
  children,
  sub,
  testId,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  sub?: ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <div
      className={cn('flex min-w-0 flex-col gap-1 p-4', className)}
      data-testid={testId}
    >
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="flex min-w-0 items-center gap-1.5 text-lg font-semibold tabular-nums">
        {children}
      </div>
      {sub && (
        <div className="min-w-0 text-xs text-muted-foreground">{sub}</div>
      )}
    </div>
  );
}

function SlaMetric({ data }: { data: VulnerabilityDetailDto }) {
  const { data: settings, isLoading } =
    useVulnerabilitiesControllerGetSettings();
  const severity: SeverityKey = severityOf(data.severity).key;
  const policyDays = settings?.slaDays?.[severity] ?? null;
  const paused = isRiskAccepted(data.dismissal);
  const label = `SLA · ${severity.charAt(0).toUpperCase()}${severity.slice(1)}${
    policyDays ? ` ${policyDays} days` : ''
  }`;

  if (isLoading) {
    return (
      <Metric label="SLA" testId="sla-card">
        <Skeleton className="h-6 w-24" />
      </Metric>
    );
  }
  if (data.detectionStatus === 'fixed') {
    return (
      <Metric
        label={label}
        testId="sla-card"
        sub={`Fixed ${fmt(data.fixedAt)}`}
      >
        <span className="text-emerald-600 dark:text-emerald-400">Closed</span>
      </Metric>
    );
  }
  if (!data.dueAt || !policyDays) {
    return (
      <Metric
        label={label}
        testId="sla-card"
        sub="No SLA applies to this severity."
      >
        <span className="text-muted-foreground">—</span>
      </Metric>
    );
  }

  const due = new Date(data.dueAt);
  const used = differenceInCalendarDays(new Date(), subDays(due, policyDays));
  const percent = Math.min(
    100,
    Math.max(0, Math.round((used / policyDays) * 100)),
  );
  const overdue = due < new Date();

  return (
    <Metric
      label={label}
      testId="sla-card"
      sub={
        <div className="flex flex-col gap-1.5">
          <Progress
            value={percent}
            aria-label="SLA time used"
            className={cn(
              'h-1.5',
              paused && 'opacity-50',
              overdue &&
                !paused &&
                '[&>[data-slot=progress-indicator]]:bg-red-500',
              !overdue &&
                percent >= 75 &&
                !paused &&
                '[&>[data-slot=progress-indicator]]:bg-amber-500',
            )}
          />
          <span>
            {paused
              ? 'Paused while the risk is accepted'
              : `Due ${fmt(data.dueAt)}`}
            {data.resurfacedCount > 0 &&
            settings?.slaRestartOnResurface &&
            !paused
              ? ' · restarted on resurface'
              : ''}
          </span>
        </div>
      }
    >
      <span className="text-base">
        <SlaDue
          dueAt={data.dueAt}
          status={data.detectionStatus}
          paused={paused}
        />
      </span>
    </Metric>
  );
}

function IssueMetric({
  data,
  onCreated,
}: {
  data: VulnerabilityDetailDto;
  onCreated?: () => void;
}) {
  const { hasPermission } = usePermission();
  const issueId = data.openIssue?.id ?? '';
  const { data: issue, isLoading } = useIssuesControllerGetById(issueId, {
    query: { enabled: !!issueId },
  });

  if (!data.openIssue) {
    return (
      <Metric
        label="Issue"
        testId="issue-card"
        sub="No open issue tracks this finding."
      >
        {hasPermission('workspace.write') ? (
          <CreateIssueDialog
            vulnerabilities={[data]}
            onCreated={onCreated}
            trigger={
              <Button variant="outline" size="sm" className="h-7">
                <ClipboardList className="mr-1 size-3.5" />
                Create issue
              </Button>
            }
          />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </Metric>
    );
  }

  return (
    <Metric
      label="Issue"
      testId="issue-card"
      sub={
        isLoading ? (
          <Skeleton className="h-3.5 w-28" />
        ) : (
          <span className="block truncate" title={issue?.title}>
            {issue?.title}
            {issue?.assignee ? ` · ${issue.assignee.name}` : ''}
          </span>
        )
      }
    >
      <IssueRefLink issue={data.openIssue} />
      <span className="text-sm font-normal capitalize text-muted-foreground">
        {data.openIssue.status.replace('_', ' ')}
      </span>
    </Metric>
  );
}

/**
 * Top of the finding page: what it is, where, how bad and what is being done
 * about it, before any tab is opened.
 */
export function DetailHero({
  data,
  onChange,
}: {
  data: VulnerabilityDetailDto;
  onChange?: () => void;
}) {
  const severity = severityOf(data.severity);
  const location =
    data.affectedUrl ||
    [data.host, data.ports?.length ? data.ports.join(', ') : null]
      .filter(Boolean)
      .join(':');
  const ids = [...(data.cveId ?? []), ...(data.cweId ?? [])].slice(0, 3);

  return (
    <section
      className="overflow-hidden rounded-xl border bg-card"
      data-testid="vulnerability-hero"
    >
      <div className="flex">
        <div
          className={cn('w-1 shrink-0', severity.bar)}
          aria-hidden
        />
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <SeverityPill severity={data.severity} />
                <DetectionStatusBadge
                  status={data.detectionStatus}
                  className="rounded-md"
                />
                <TriageChip data={data} />
                {ids.map((id) => (
                  <Badge
                    key={id}
                    variant="outline"
                    className="h-6 rounded-md font-mono text-[11px]"
                  >
                    {id}
                  </Badge>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {data.asset && (
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <Globe className="size-3.5 shrink-0" />
                    <Link
                      to="/assets"
                      search={{ tab: 'service', filter: data.asset.value }}
                      className="truncate font-medium text-foreground hover:underline"
                    >
                      {data.asset.value}
                    </Link>
                  </span>
                )}
                {location && location !== data.asset?.value && (
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <MapPin className="size-3.5 shrink-0" />
                    <span
                      className="truncate font-mono text-xs"
                      title={location}
                    >
                      {location}
                    </span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="size-3.5 shrink-0" />
                  First seen {ageLabel(data.firstDetectedDate)} ago
                </span>
              </div>
              <SourcesList data={data} />
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 border-t md:grid-cols-5 [&>*]:border-border max-md:[&>*:nth-child(odd)]:border-r max-md:[&>*:nth-child(n+3)]:border-t md:[&>*:not(:first-child)]:border-l">
        <Metric
          label="CVSS"
          sub={
            data.cvssMetric ? (
              <span className="block break-words font-mono">
                {/* Wrap between metrics rather than cut the vector off. */}
                {data.cvssMetric.split('/').map((part, i, all) => (
                  <Fragment key={i}>
                    {part}
                    {i < all.length - 1 && (
                      <>
                        /<wbr />
                      </>
                    )}
                  </Fragment>
                ))}
              </span>
            ) : (
              'No vector reported'
            )
          }
        >
          {data.cvssScore ? (
            <>
              {data.cvssScore.toFixed(1)}
              <span className="text-sm font-normal text-muted-foreground">
                / 10
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </Metric>
        <Metric
          label="EPSS"
          sub={
            data.epssScore ? 'Chance of exploitation in 30 days' : 'Not scored'
          }
        >
          {data.epssScore ? (
            `${(data.epssScore * 100).toFixed(2)}%`
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </Metric>
        <SlaMetric data={data} />
        <Metric
          label="Detected"
          sub={`Last seen ${fmt(data.lastSeenDate)}${
            data.resurfacedCount > 0
              ? ` · resurfaced ${data.resurfacedCount}×`
              : ''
          }`}
        >
          ×{data.timesDetected}
          <span className="text-sm font-normal text-muted-foreground">
            {data.timesDetected === 1 ? 'scan' : 'scans'}
          </span>
        </Metric>
        <IssueMetric data={data} onCreated={onChange} />
      </div>
    </section>
  );
}
