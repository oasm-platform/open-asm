import { useT } from '@/lib/i18n-dictionary';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/common/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SeverityBadge } from '@/components/ui/severity-badge';
import { cn } from '@/lib/utils';
import {
  InsightLevel,
  TargetChangeKind,
  TargetInsightKind,
  useTargetsControllerGetTargetChanges,
  useTargetsControllerGetTargetOverview,
  useTargetsControllerReScanTarget,
  type NameCountDto,
  type Target,
  type TargetChangeDto,
  type TargetInsightDto,
  type TargetOverviewDto,
} from '@/services/apis/gen/queries';
import { Link, useNavigate } from '@tanstack/react-router';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  Activity,
  AlertTriangle,
  Bug,
  CalendarClock,
  ChartColumnStacked,
  CircleCheck,
  Info,
  Network,
  Radar,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { SeverityBreakdown } from '../../projects/components/severity-bar';
import { apiErrorMessage, totalOf } from '../../projects/project-utils';
import { WeeklyChart } from '../../projects/tabs/overview-tab';
import { TargetRunRow } from '../components/target-run-row';
import { isScheduled, scheduleLabel } from '../target-utils';

dayjs.extend(relativeTime);

/** Lists side by side share one height; longer ones scroll. */
const LIST_CARD = 'h-[26rem]';
const LIST_CONTENT = 'flex min-h-0 flex-1 flex-col divide-y overflow-y-auto';

type GoTab = (tab: string, search?: Record<string, string>) => void;

const LEVEL_STYLE: Record<InsightLevel, { icon: LucideIcon; className: string }> = {
  [InsightLevel.critical]: { icon: ShieldAlert, className: 'text-red-500' },
  [InsightLevel.warning]: { icon: AlertTriangle, className: 'text-amber-500' },
  [InsightLevel.info]: { icon: Info, className: 'text-sky-500' },
};

function InsightRow({
  insight,
  goTab,
  onRescan,
  rescanning,
}: {
  insight: TargetInsightDto;
  goTab: GoTab;
  onRescan: () => void;
  rescanning: boolean;
}) {
  const t = useT();
  const navigate = useNavigate();
  const count = insight.count ?? 0;
  const { text, action, onAction } = ((): {
    text: string;
    action: string;
    onAction: () => void;
  } => {
    switch (insight.kind) {
      case TargetInsightKind.critical_open:
        return {
          text: t('targets.insights.criticalOpen', { count }),
          action: t('targets.insights.review'),
          onAction: () => goTab('vulnerabilities'),
        };
      case TargetInsightKind.last_run_failed:
        return {
          text: t('targets.insights.lastRunFailed'),
          action: t('targets.insights.openRun'),
          onAction: () =>
            insight.runId &&
            void navigate({ to: '/jobs/runs/$id', params: { id: insight.runId } }),
        };
      case TargetInsightKind.tls_expiring:
        return {
          text: t('targets.insights.tlsExpiring', { count, days: insight.days ?? 30 }),
          action: t('targets.insights.seeTls'),
          onAction: () => goTab('assets', { tab: 'tls' }),
        };
      case TargetInsightKind.stale_scan:
        return {
          text: t('targets.insights.staleScan', { days: insight.days ?? 0 }),
          action: t('targets.insights.rediscover'),
          onAction: onRescan,
        };
      case TargetInsightKind.new_assets:
        return {
          text: t('targets.insights.newAssets', { count, days: insight.days ?? 7 }),
          action: t('targets.insights.seeAssets'),
          onAction: () => goTab('assets', { tab: 'host' }),
        };
      case TargetInsightKind.no_schedule:
      default:
        return {
          text: t('targets.insights.noSchedule'),
          action: t('targets.insights.schedule'),
          onAction: () => goTab('settings'),
        };
    }
  })();
  const { icon: Icon, className } = LEVEL_STYLE[insight.level];
  return (
    <div className="flex items-center gap-3 py-2.5 text-sm">
      <Icon className={cn('size-4 shrink-0', className)} />
      <span className="min-w-0 flex-1">{text}</span>
      <Button
        variant="outline"
        size="sm"
        className="h-7 shrink-0"
        onClick={onAction}
        disabled={insight.kind === TargetInsightKind.stale_scan && rescanning}
      >
        {action}
      </Button>
    </div>
  );
}

const CHANGE_LABELS: Record<TargetChangeKind, { labelKey: string; className: string }> = {
  [TargetChangeKind.asset]: { labelKey: 'targets.changes.newAsset', className: 'text-sky-600 dark:text-sky-400' },
  [TargetChangeKind.service]: { labelKey: 'targets.changes.newService', className: 'text-violet-600 dark:text-violet-400' },
  [TargetChangeKind.vulnerability]: { labelKey: 'targets.changes.found', className: 'text-red-600 dark:text-red-400' },
  [TargetChangeKind.fixed]: { labelKey: 'targets.changes.fixed', className: 'text-green-600 dark:text-green-400' },
};

export function ChangeRow({ change }: { change: TargetChangeDto }) {
  const t = useT();
  const kind = CHANGE_LABELS[change.kind];
  const isVulnerability =
    change.kind === TargetChangeKind.vulnerability ||
    change.kind === TargetChangeKind.fixed;
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-2 py-2 text-sm">
      <span
        className="truncate tabular-nums text-muted-foreground"
        title={dayjs(change.at).format('YYYY-MM-DD HH:mm')}
      >
        {dayjs(change.at).fromNow()}
      </span>
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
        <span className={cn('font-medium', kind.className)}>{t(kind.labelKey)}</span>
        {change.severity && isVulnerability && (
          <SeverityBadge severity={change.severity} variant="text" />
        )}
        {isVulnerability ? (
          <Link
            to="/vulnerabilities/$id"
            params={{ id: change.id }}
            className="truncate hover:underline"
          >
            {change.label}
          </Link>
        ) : (
          <span className="truncate font-mono">{change.label}</span>
        )}
        {change.assetValue && (
          <span className="truncate text-muted-foreground">
            {t('targets.changes.on', { asset: change.assetValue })}
          </span>
        )}
      </span>
    </div>
  );
}

function ExposureList({
  title,
  rows,
  onOpen,
  mono,
}: {
  title: string;
  rows: NameCountDto[];
  onOpen: () => void;
  mono?: boolean;
}) {
  const t = useT();
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={onOpen}
        className="w-fit text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        {title}
      </button>
      {rows.length === 0 ? (
        <span className="text-sm text-muted-foreground">{t('targets.overview.noneFound')}</span>
      ) : (
        rows.map((row) => (
          <div key={row.name} className="flex items-center gap-2 text-sm">
            <span className={cn('w-24 shrink-0 truncate', mono && 'font-mono')} title={row.name}>
              {row.name}
            </span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-primary/70"
                style={{ width: `${(row.count / max) * 100}%` }}
              />
            </span>
            <span className="w-8 shrink-0 text-right tabular-nums text-muted-foreground">
              {row.count}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right">{children}</span>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl border bg-muted/40" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="h-48 animate-pulse rounded-xl border bg-muted/40 lg:col-span-2" />
        <div className="h-48 animate-pulse rounded-xl border bg-muted/40" />
      </div>
    </div>
  );
}

export function TargetOverviewTab({ target }: { target: Target }) {
  const t = useT();
  const navigate = useNavigate();
  const { data: overview, isLoading, refetch } =
    useTargetsControllerGetTargetOverview(target.id, {
      query: {
        // Fast while something runs, so progress moves.
        refetchInterval: (query) =>
          (query.state.data as TargetOverviewDto | undefined)?.activeRuns.length
            ? 5000
            : 30_000,
      },
    });
  const { data: changesPage } = useTargetsControllerGetTargetChanges(
    target.id,
    { page: 1, limit: 20 },
    { query: { refetchInterval: 30_000 } },
  );
  const { mutate: rescan, isPending: rescanning } =
    useTargetsControllerReScanTarget({
      mutation: {
        onSuccess: () => {
          toast.success(t('targets.settingsTab.discoveryStarted'));
          void refetch();
        },
        onError: (error) =>
          toast.error(apiErrorMessage(error, t('targets.settingsTab.discoveryFailed'))),
      },
    });

  if (isLoading || !overview) return <OverviewSkeleton />;

  const goTab: GoTab = (tab, search) =>
    void navigate({
      to: '/targets/$id/$tab',
      params: { id: target.id, tab },
      search: search ?? {},
    });
  const onRescan = () => rescan({ id: target.id });
  const open = totalOf(overview.openVulnerabilities);
  const scheduled = isScheduled(target.scanSchedule);
  const lastRun = overview.lastRun;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('targets.overview.assets')}
          value={String(overview.totalAssets)}
          icon={Waypoints}
          onClick={() => goTab('assets', { tab: 'host' })}
        >
          <span className="text-sm text-muted-foreground">
            {t('targets.overview.newAssets', { count: overview.newAssets })}
          </span>
        </StatCard>
        <StatCard
          label={t('targets.overview.services')}
          value={String(overview.totalServices)}
          icon={Network}
          onClick={() => goTab('assets', { tab: 'service' })}
        >
          <span className="text-sm text-muted-foreground">
            {t('targets.overview.openPorts', { count: overview.openPorts, services: overview.newServices })}
          </span>
        </StatCard>
        <StatCard
          label={t('targets.overview.openVulnerabilities')}
          value={String(open)}
          icon={Bug}
          onClick={() => goTab('vulnerabilities')}
        >
          <SeverityBreakdown counts={overview.openVulnerabilities} />
        </StatCard>
        <StatCard
          label={t('targets.overview.nextScan')}
          value={overview.nextScanAt ? dayjs(overview.nextScanAt).fromNow(true) : '—'}
          icon={CalendarClock}
          onClick={() => goTab('settings')}
        >
          <span className="truncate text-sm text-muted-foreground">
            {scheduled
              ? `${scheduleLabel(target.scanSchedule)}${
                  overview.nextScanAt
                    ? ` · ${dayjs(overview.nextScanAt).format('DD MMM HH:mm')}`
                    : ''
                }`
              : t('targets.overview.manualOnly')}
          </span>
        </StatCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <Radar className="size-5 text-primary" />
              {t('targets.overview.runningNow')}
              {overview.activeRuns.length > 0 && (
                <Badge variant="secondary">{overview.activeRuns.length}</Badge>
              )}
            </CardTitle>
            <Button variant="link" size="sm" className="h-auto p-0" onClick={() => goTab('activity')}>
              {t('targets.overview.allRuns')}
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {overview.activeRuns.length > 0 ? (
              overview.activeRuns.map((run) => <TargetRunRow key={run.id} run={run} />)
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 py-2">
                <div className="flex items-center gap-3 text-sm">
                  <CircleCheck className="size-5 text-green-500" />
                  <span>
                    {t('targets.overview.nothingScanning')}
                    {lastRun && (
                      <span className="text-muted-foreground">
                        {' '}
                        {t('targets.overview.lastRun')}{' '}
                        <Link
                          to="/jobs/runs/$id"
                          params={{ id: lastRun.id }}
                          className="hover:underline"
                        >
                          {lastRun.workflowName || t('targets.overview.run')}
                        </Link>{' '}
                        {dayjs(lastRun.updatedAt).fromNow()} ({lastRun.status.replace('_', ' ')}).
                      </span>
                    )}
                  </span>
                </div>
                <Button size="sm" variant="outline" onClick={onRescan} disabled={rescanning}>
                  <RefreshCw className={cn('size-4', rescanning && 'animate-spin')} />
                  {t('targets.insights.rediscover')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-primary" />
              {t('targets.overview.needsAttention')}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {overview.insights.length === 0 ? (
              <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                <ShieldCheck className="size-4 text-green-500" />
                {t('targets.overview.nothingNeedsAttention')}
              </p>
            ) : (
              overview.insights.map((insight) => (
                <InsightRow
                  key={insight.kind}
                  insight={insight}
                  goTab={goTab}
                  onRescan={onRescan}
                  rescanning={rescanning}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ChartColumnStacked className="size-5 text-primary" />
              {t('targets.overview.newVulnsPerWeek')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <WeeklyChart weeks={overview.weekly} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <Bug className="size-5 text-primary" />
              {t('targets.overview.fixFirst')}
            </CardTitle>
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => goTab('vulnerabilities')}
            >
              {t('targets.overview.seeAll')}
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {overview.topVulnerabilities.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">{t('targets.overview.noOpenVulns')}</p>
            ) : (
              overview.topVulnerabilities.map((vuln) => (
                <Link
                  key={vuln.id}
                  to="/vulnerabilities/$id"
                  params={{ id: vuln.id }}
                  className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2 hover:bg-accent/50"
                >
                  <SeverityBadge severity={vuln.severity} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{vuln.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {vuln.assetValue}
                      {vuln.cveId?.length ? ` · ${vuln.cveId[0].toUpperCase()}` : ''}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className={LIST_CARD}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="size-5 text-primary" />
              {t('targets.overview.recentChanges')}
            </CardTitle>
          </CardHeader>
          <CardContent className={LIST_CONTENT}>
            {(changesPage?.data ?? []).length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">{t('targets.activity.nothingYet')}</p>
            ) : (
              changesPage!.data.map((change) => (
                <ChangeRow key={`${change.kind}-${change.id}`} change={change} />
              ))
            )}
          </CardContent>
        </Card>
        <Card className={LIST_CARD}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Network className="size-5 text-primary" />
              {t('targets.overview.exposure')}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            <ExposureList
              title={t('targets.overview.ports')}
              rows={overview.exposure.ports}
              onOpen={() => goTab('assets', { tab: 'port' })}
              mono
            />
            <ExposureList
              title={t('targets.overview.technologies')}
              rows={overview.exposure.technologies}
              onOpen={() => goTab('assets', { tab: 'technology' })}
            />
            <ExposureList
              title={t('targets.overview.statusCodes')}
              rows={overview.exposure.statusCodes}
              onOpen={() => goTab('assets', { tab: 'status-code' })}
              mono
            />
          </CardContent>
        </Card>
        <Card className={LIST_CARD}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="size-5 text-primary" />
              {t('targets.overview.about')}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="divide-y">
              <InfoRow label={t('targets.overview.type')}>{target.type}</InfoRow>
              <InfoRow label={t('targets.overview.scope')}>{target.internalNetworkId ? t('targets.overview.internalNetwork') : t('targets.overview.external')}</InfoRow>
              <InfoRow label={t('targets.overview.schedule')}>{scheduleLabel(target.scanSchedule)}</InfoRow>
              <InfoRow label={t('targets.overview.lastDiscovery')}>
                {target.lastDiscoveredAt ? dayjs(target.lastDiscoveredAt).fromNow() : '—'}
              </InfoRow>
              <InfoRow label={t('targets.overview.added')}>{dayjs(target.createdAt).format('DD MMM YYYY')}</InfoRow>
            </div>
            <p className="mt-4 mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('targets.overview.projects')}
            </p>
            {overview.projects.length === 0 ? (
              <span className="text-sm text-muted-foreground">{t('targets.overview.inNoProject')}</span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {overview.projects.map((project) => (
                  <Link
                    key={project.id}
                    to="/projects/$id/$tab"
                    params={{ id: project.id, tab: 'overview' }}
                  >
                    <Badge variant="outline" className="gap-1.5 hover:bg-accent">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: project.hexColor ?? undefined }}
                      />
                      {project.name}
                      <span className="text-muted-foreground">{project.assets}</span>
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
            <p className="mt-4 mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('targets.overview.openIssues')}
            </p>
            {overview.issues.length === 0 ? (
              <span className="text-sm text-muted-foreground">{t('targets.list.none')}</span>
            ) : (
              overview.issues.map((issue) => (
                <Link
                  key={issue.id}
                  to="/issues/$id"
                  params={{ id: issue.id }}
                  className="truncate py-1 text-sm hover:underline"
                >
                  <span className="text-muted-foreground">#{issue.no}</span> {issue.title}
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
