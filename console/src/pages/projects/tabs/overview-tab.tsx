import { Button } from '@/components/ui/button';
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
import type { ProjectDetailSearch } from '@/routes/_authed/projects/$id/$tab';
import {
  DismissReason,
  ProjectActivityDtoKind,
  ProjectChange,
  ProjectTriggerType,
  VulnerabilityProvenance,
  useProjectsControllerGetOverview,
  useProjectsControllerGetVulnerabilities,
  type JobStatus,
  type Project,
  type ProjectActivityDto,
  type WeeklyNewVulnerabilitiesDto,
} from '@/services/apis/gen/queries';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  Activity,
  Bug,
  CalendarClock,
  ChartColumnStacked,
  ShieldAlert,
  TrendingUp,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';
import { memo, useMemo } from 'react';
import { SeverityCounts } from '../components/severity-bar';
import { ProvenanceBadge, TimelineSheet } from './vulnerabilities-tab';
import {
  assetCount,
  runTriggerLabel,
  SEVERITIES,
  totalOf,
  workflowLabel,
} from '../project-utils';

dayjs.extend(relativeTime);

/** Rows of "To fix" (as many as the API's recent activity). */
const LIST_LIMIT = 15;

/** "To fix" and "Recent activity": one height, side by side; longer lists scroll. */
const LIST_CARD = 'h-[30rem]';
const LIST_CONTENT = 'flex min-h-0 flex-1 flex-col divide-y overflow-y-auto';

const AUDIT_LABELS: Record<string, string> = {
  'project.created': 'Project created',
  'project.archived': 'Project archived',
  'project.unarchived': 'Project reopened',
};

/** How assets joined or left, after their count. */
const ASSET_CHANGES: Partial<Record<ProjectChange, string>> = {
  [ProjectChange.assetsadded]: 'picked by hand',
  [ProjectChange.assetsdiscovered]: 'discovered, matching the scope rules',
  [ProjectChange.assetsremoved]: 'removed',
  [ProjectChange.scope]: 'with a scope rule change',
};

/** "+3 assets", "−1 asset" or "+3 / −1 assets". */
function assetDelta(added = 0, removed = 0): string {
  if (added && removed) return `+${added} / −${removed} assets`;
  return added ? `+${assetCount(added)}` : `−${assetCount(removed)}`;
}

const DISMISS_REASONS: Record<DismissReason, string> = {
  [DismissReason.false_positive]: 'false positive',
  [DismissReason.used_in_test]: 'used in tests',
  [DismissReason.wont_fix]: "won't fix",
};

const WORKFLOW_CHANGES: Partial<Record<ProjectChange, string>> = {
  [ProjectChange.workflowadded]: 'added',
  [ProjectChange.workflowupdated]: 'edited',
  [ProjectChange.workflowremoved]: 'removed',
};

const vulnerabilityCount = (n: number) =>
  `${n} vulnerabilit${n === 1 ? 'y' : 'ies'}`;

/** Same card as the dashboard's statistics: title and icon, then the number. */
function Kpi({
  label,
  value,
  icon: Icon,
  onClick,
  children,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Card
      className={cn('gap-2', onClick && 'cursor-pointer transition-colors hover:bg-accent/70')}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>{label}</CardTitle>
        <Icon className="size-5 text-primary" />
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-2">
        <p className="truncate font-mono text-4xl font-bold">{value}</p>
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

/** " by Name" after a change someone made. */
function By({ name }: { name?: string }) {
  return name ? <span className="text-muted-foreground"> by {name}</span> : null;
}

function TabLink({
  projectId,
  tab,
  children,
}: {
  projectId: string;
  tab: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      to="/projects/$id/$tab"
      params={{ id: projectId, tab }}
      className="font-medium hover:underline"
    >
      {children}
    </Link>
  );
}

function ActivityItem({ item, projectId }: { item: ProjectActivityDto; projectId: string }) {
  if (item.kind === ProjectActivityDtoKind.dismissed) {
    return (
      <span>
        <TabLink projectId={projectId} tab="vulnerabilities">
          {vulnerabilityCount(item.count ?? 0)}
        </TabLink>{' '}
        dismissed
        {item.reason && (
          <span className="text-muted-foreground"> · {DISMISS_REASONS[item.reason]}</span>
        )}
        <By name={item.actorName} />
      </span>
    );
  }
  if (item.kind === ProjectActivityDtoKind.audit) {
    const workflowChange = item.change && WORKFLOW_CHANGES[item.change];
    if (workflowChange) {
      return (
        <span>
          Workflow{' '}
          <TabLink projectId={projectId} tab="workflows">
            {workflowLabel({ name: item.workflowName })}
          </TabLink>{' '}
          {workflowChange}
          <By name={item.actorName} />
        </span>
      );
    }
    const assetChange = item.change && ASSET_CHANGES[item.change];
    if (assetChange) {
      return (
        <span>
          <TabLink projectId={projectId} tab="assets">
            {assetDelta(item.added, item.removed)}
          </TabLink>{' '}
          {assetChange}
          <By name={item.actorName} />
        </span>
      );
    }
    return (
      <span>
        {AUDIT_LABELS[item.ref] ?? item.ref}
        {item.ref === 'project.created' && item.added ? (
          <>
            {' '}
            with{' '}
            <TabLink projectId={projectId} tab="assets">
              {assetCount(item.added)}
            </TabLink>
          </>
        ) : null}
        <By name={item.actorName} />
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
        {runTriggerLabel(item.jobRunType, item.triggerEvent)} ·{' '}
        {assetCount(item.scopeSize ?? 0)}
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
  const search = useSearch({ strict: false }) as ProjectDetailSearch;
  // The same sheet, and URL, as a row of the Vulnerabilities tab.
  const setVulnerability = (vulnerability?: string) =>
    void navigate({
      to: '/projects/$id/$tab',
      params: { id: projectId, tab: 'overview' },
      search: { ...search, vulnerability },
      replace: true,
    });
  const timezone = getLocalTimezone();
  const { data: overview, isLoading } = useProjectsControllerGetOverview(projectId);
  const { data: todo } = useProjectsControllerGetVulnerabilities(projectId, {
    page: 1,
    limit: LIST_LIMIT,
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

  const onEvents = (project.projectWorkflows ?? []).some((binding) =>
    (binding.triggers ?? []).some(
      (trigger) => trigger.type === ProjectTriggerType.event && trigger.enabled,
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

  const goTab = (tab: string, search?: Record<string, string>) =>
    navigate({ to: '/projects/$id/$tab', params: { id: projectId, tab }, search });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Assets"
          value={String(overview.totalAssets)}
          icon={Waypoints}
          onClick={() => goTab('assets')}
        >
          <span className="text-sm text-muted-foreground">
            +{overview.newAssets} in the last 7 days
          </span>
        </Kpi>
        <Kpi
          label="Open vulnerabilities"
          value={String(open)}
          icon={Bug}
          onClick={() => goTab('vulnerabilities')}
        >
          <SeverityCounts counts={overview.openVulnerabilities} empty="Nothing open" />
        </Kpi>
        <Kpi
          label="New in 7 days"
          value={`+${overview.newVulnerabilities}`}
          icon={TrendingUp}
          onClick={() =>
            goTab('vulnerabilities', { provenance: VulnerabilityProvenance.new })
          }
        >
          <span className="truncate text-sm text-muted-foreground">
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
          icon={CalendarClock}
          onClick={() => goTab('schedule')}
        >
          <span className="truncate text-sm text-muted-foreground" title={next?.cron}>
            {next
              ? `${next.workflow} · ${formatCronLabel(next.cron, timezone) ?? next.cron}`
              : onEvents
                ? 'On events'
                : 'Only when run by hand'}
          </span>
        </Kpi>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ChartColumnStacked className="size-5 text-primary" />
            New vulnerabilities per week
          </CardTitle>
        </CardHeader>
        <CardContent>
          <WeeklyChart weeks={overview.weekly} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className={cn(LIST_CARD, 'lg:col-span-3')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-primary" />
              To fix
            </CardTitle>
            <Button variant="link" size="sm" className="h-auto p-0" onClick={() => goTab('vulnerabilities')}>
              See all
            </Button>
          </CardHeader>
          <CardContent className={LIST_CONTENT}>
            {(todo?.data ?? []).length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                No open vulnerabilities found by this project.
              </p>
            ) : (
              (todo?.data ?? []).map((vuln) => (
                <button
                  key={vuln.id}
                  type="button"
                  onClick={() => setVulnerability(vuln.id)}
                  className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <SeverityBadge severity={vuln.severity} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{vuln.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {vuln.assetValue}
                    </p>
                  </div>
                  <ProvenanceBadge
                    provenance={vuln.provenance}
                    timesSeen={vuln.timesSeen}
                  />
                </button>
              ))
            )}
          </CardContent>
        </Card>
        <Card className={cn(LIST_CARD, 'lg:col-span-2')}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="size-5 text-primary" />
              Recent activity
            </CardTitle>
          </CardHeader>
          <CardContent className={LIST_CONTENT}>
            {overview.activity.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              overview.activity.map((item) => (
                <div
                  key={`${item.kind}-${item.ref}-${item.at}`}
                  className="grid grid-cols-[88px_1fr] gap-2 py-2 text-sm"
                >
                  <span
                    className="tabular-nums text-muted-foreground"
                    title={dayjs(item.at).format('YYYY-MM-DD HH:mm')}
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

      <TimelineSheet
        projectId={projectId}
        vulnerabilityId={search.vulnerability}
        onClose={() => setVulnerability(undefined)}
      />
    </div>
  );
}
