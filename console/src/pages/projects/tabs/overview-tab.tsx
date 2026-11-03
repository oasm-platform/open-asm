import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import JobStatusBadge from '@/components/ui/job-status';
import { SeverityBadge } from '@/components/ui/severity-badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatCronLabel, getLocalTimezone, getNextRun } from '@/lib/cron-schedule';
import { cn } from '@/lib/utils';
import {
  ProjectTriggerType,
  VulnerabilityProvenance,
  useProjectsControllerGetOverview,
  useProjectsControllerGetVulnerabilities,
  type JobStatus,
  type Project,
  type ProjectActivityDto,
  type WeeklyNewVulnerabilitiesDto,
} from '@/services/apis/gen/queries';
import { Link, useNavigate } from '@tanstack/react-router';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { memo, useMemo } from 'react';
import { SeverityCounts } from '../components/severity-bar';
import { ProvenanceBadge } from './vulnerabilities-tab';
import {
  assetCount,
  runTriggerLabel,
  SEVERITIES,
  totalOf,
  workflowLabel,
} from '../project-utils';

dayjs.extend(relativeTime);

const AUDIT_LABELS: Record<string, string> = {
  'project.created': 'Project created',
  'project.updated': 'Project changed',
  'project.archived': 'Project archived',
  'project.unarchived': 'Project reopened',
};

function Kpi({
  label,
  value,
  children,
  accent,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="flex flex-col gap-1 px-4">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span
          className={cn(
            'text-2xl font-semibold tracking-tight tabular-nums',
            accent && 'text-primary',
          )}
        >
          {value}
        </span>
        {children}
      </CardContent>
    </Card>
  );
}

/**
 * New vulnerabilities per week, stacked by severity (critical at the base).
 * Severity keeps the colours it has everywhere in the console; since red,
 * orange and yellow are close for colour-blind readers, every week also has a
 * tooltip with each count, the legend names every colour, and a table carries
 * the same numbers for screen readers.
 */
const WeeklyChart = memo(function WeeklyChart({
  weeks,
}: {
  weeks: WeeklyNewVulnerabilitiesDto[];
}) {
  const totals = weeks.map((week) => totalOf(week));
  const max = Math.max(1, ...totals);
  const ticks = [max, Math.round(max / 2), 0].filter(
    (tick, i, all) => all.indexOf(tick) === i,
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {SEVERITIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className={cn('size-2.5 rounded-sm', s.bar)} />
            {s.label}
          </span>
        ))}
      </div>
      <TooltipProvider delayDuration={100}>
        <div className="flex gap-2">
          <div className="flex h-40 flex-col justify-between pb-5 text-right text-[11px] tabular-nums text-muted-foreground">
            {ticks.map((tick) => (
              <span key={tick}>{tick}</span>
            ))}
          </div>
          <div className="relative grid flex-1 grid-cols-8 gap-2">
            <div className="pointer-events-none absolute inset-x-0 top-0 bottom-5 flex flex-col justify-between">
              {ticks.map((tick) => (
                <span key={tick} className="border-t border-dashed border-border" />
              ))}
            </div>
            {weeks.map((week, i) => (
              <div key={week.week} className="flex flex-col items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="relative flex h-40 w-full flex-col-reverse items-center justify-start rounded-sm hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Week of ${dayjs(week.week).format('DD MMM')}: ${totals[i]} new`}
                    >
                      <span
                        className="flex w-3/5 max-w-8 flex-col-reverse gap-[2px] overflow-hidden rounded-t-[4px]"
                        style={{ height: `${(totals[i] / max) * 100}%` }}
                      >
                        {/* column-reverse: the first severity sits at the base */}
                        {SEVERITIES.map((s) =>
                          week[s.key] ? (
                            <span
                              key={s.key}
                              className={s.bar}
                              style={{ flexGrow: week[s.key], minHeight: 2 }}
                            />
                          ) : null,
                        )}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="font-medium">
                      Week of {dayjs(week.week).format('DD MMM YYYY')} · {totals[i]} new
                    </p>
                    {SEVERITIES.map((s) => (
                      <p key={s.key} className="flex items-center gap-1.5 tabular-nums">
                        <span className={cn('size-2 rounded-sm', s.bar)} />
                        {s.label}: {week[s.key]}
                      </p>
                    ))}
                  </TooltipContent>
                </Tooltip>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {dayjs(week.week).format('DD/MM')}
                </span>
              </div>
            ))}
          </div>
        </div>
      </TooltipProvider>
      <table className="sr-only">
        <caption>New vulnerabilities per week by severity</caption>
        <thead>
          <tr>
            <th>Week</th>
            {SEVERITIES.map((s) => (
              <th key={s.key}>{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week.week}>
              <td>{week.week}</td>
              {SEVERITIES.map((s) => (
                <td key={s.key}>{week[s.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

function ActivityItem({ item, projectId }: { item: ProjectActivityDto; projectId: string }) {
  if (item.kind === 'audit') {
    return (
      <span>
        {AUDIT_LABELS[item.ref] ?? item.ref}
        {item.actorName ? (
          <span className="text-muted-foreground"> by {item.actorName}</span>
        ) : null}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <Link
        to="/jobs/runs/$id"
        params={{ id: item.ref }}
        className="font-medium hover:underline"
      >
        {workflowLabel({ name: item.workflowName })}
      </Link>
      <span className="text-muted-foreground">
        {runTriggerLabel(item.jobRunType)} · {assetCount(item.scopeSize ?? 0)}
      </span>
      {item.runStatus && <JobStatusBadge status={item.runStatus as JobStatus} />}
      {(item.newVulnerabilities ?? 0) > 0 && (
        <Link
          to="/projects/$id/$tab"
          params={{ id: projectId, tab: 'vulnerabilities' }}
          search={{ run: item.ref, provenance: VulnerabilityProvenance.new }}
          className="text-primary hover:underline"
        >
          +{item.newVulnerabilities} new
        </Link>
      )}
      {(item.recurringVulnerabilities ?? 0) > 0 && (
        <span className="text-muted-foreground">
          {item.recurringVulnerabilities} recurring
        </span>
      )}
    </span>
  );
}

export function OverviewTab({
  projectId,
  project,
}: {
  projectId: string;
  project: Project;
}) {
  const navigate = useNavigate();
  const timezone = getLocalTimezone();
  const { data: overview, isLoading } = useProjectsControllerGetOverview(projectId);
  const { data: todo } = useProjectsControllerGetVulnerabilities(projectId, {
    page: 1,
    limit: 6,
  });

  // Soonest cron of any workflow, with the workflow it runs.
  const next = useMemo(() => {
    let best: { at: Date; workflow: string; cron: string } | null = null;
    for (const binding of project.projectWorkflows ?? []) {
      for (const trigger of binding.triggers ?? []) {
        if (trigger.type !== ProjectTriggerType.cron || !trigger.enabled || !trigger.cron) {
          continue;
        }
        const at = getNextRun(trigger.cron, timezone);
        if (at && (!best || at < best.at)) {
          best = { at, workflow: workflowLabel(binding.workflow), cron: trigger.cron };
        }
      }
    }
    return best;
  }, [project.projectWorkflows, timezone]);

  const onAssetsAdded = (project.projectWorkflows ?? []).some((binding) =>
    (binding.triggers ?? []).some(
      (trigger) => trigger.type === ProjectTriggerType.assets_added && trigger.enabled,
    ),
  );

  if (isLoading || !overview) {
    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border bg-muted/40" />
        ))}
      </div>
    );
  }

  const open = totalOf(overview.openVulnerabilities);
  const freshRuns = overview.newVulnerabilityRuns;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Assets" value={String(overview.totalAssets)}>
          <span className="text-xs text-muted-foreground">
            +{overview.newAssets} in the last 7 days
          </span>
        </Kpi>
        <Kpi label="Open vulnerabilities" value={String(open)}>
          <SeverityCounts counts={overview.openVulnerabilities} empty="Nothing open" />
        </Kpi>
        <Kpi
          label="New in the last 7 days"
          value={`+${overview.newVulnerabilities}`}
          accent={overview.newVulnerabilities > 0}
        >
          <span className="truncate text-xs text-muted-foreground">
            {freshRuns.length
              ? `from ${[
                  ...new Set(
                    freshRuns.map((run) => workflowLabel({ name: run.workflowName })),
                  ),
                ].join(', ')} · ${freshRuns.length} run${freshRuns.length === 1 ? '' : 's'}`
              : 'No new findings'}
          </span>
        </Kpi>
        <Kpi
          label="Next run"
          value={next ? dayjs(next.at).fromNow() : '—'}
        >
          <span className="truncate text-xs text-muted-foreground" title={next?.cron}>
            {next
              ? `${next.workflow} · ${formatCronLabel(next.cron, timezone) ?? next.cron}`
              : onAssetsAdded
                ? 'When assets are added'
                : 'Only when run by hand'}
          </span>
        </Kpi>
      </div>

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-sm">New vulnerabilities per week</CardTitle>
        </CardHeader>
        <CardContent>
          <WeeklyChart weeks={overview.weekly} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between pb-0">
            <CardTitle className="text-sm">To fix</CardTitle>
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() =>
                navigate({
                  to: '/projects/$id/$tab',
                  params: { id: projectId, tab: 'vulnerabilities' },
                })
              }
            >
              See all
            </button>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {(todo?.data ?? []).length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                No open vulnerabilities found by this project.
              </p>
            ) : (
              (todo?.data ?? []).map((vuln) => (
                <div key={vuln.id} className="flex items-center gap-3 py-2">
                  <SeverityBadge severity={vuln.severity} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{vuln.name}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {vuln.assetValue}
                    </p>
                  </div>
                  <ProvenanceBadge
                    provenance={vuln.provenance}
                    timesSeen={vuln.timesSeen}
                  />
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm">Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {overview.activity.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              overview.activity.map((item) => (
                <div
                  key={`${item.kind}-${item.ref}-${item.at}`}
                  className="grid grid-cols-[88px_1fr] gap-2 py-2 text-sm"
                >
                  <span
                    className="text-xs tabular-nums text-muted-foreground"
                    title={dayjs(item.at).format('DD MMM YYYY, HH:mm')}
                  >
                    {dayjs(item.at).fromNow()}
                  </span>
                  <ActivityItem item={item} projectId={projectId} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
      {overview.lastRun && (
        <p className="text-xs text-muted-foreground">
          Last run{' '}
          <Badge variant="outline" className="font-normal">
            {workflowLabel({ name: overview.lastRun.workflowName })}
          </Badge>{' '}
          {dayjs(overview.lastRun.createdAt).fromNow()}
        </p>
      )}
    </div>
  );
}
