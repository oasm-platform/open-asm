import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button-variants';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import ToolLogo from '@/components/ui/tool-logo';
import type {
  ManagedContainerTelemetryDto,
  WorkerTelemetryDto,
  WorkerToolDto,
} from '@/services/apis/gen/queries';
import {
  Activity,
  Box,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Cpu,
  Gauge,
  MemoryStick,
  Network,
  Timer,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { formatBytes } from '@/utils/format-bytes';
import { t, useT } from '@/lib/i18n-dictionary';

const CONTAINERS_PER_PAGE = 12;

const numberValue = (value: string | number | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatUptime = (seconds: number) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return t('workers.telemetry.uptime.days', { days, hours });
  if (hours > 0) return t('workers.telemetry.uptime.hours', { hours, minutes });
  return t('workers.telemetry.uptime.minutes', {
    minutes,
    seconds: Math.floor(seconds % 60),
  });
};

const stateTone = (state: string) => {
  if (['HEALTHY', 'RUNNING', 'READY', 'COMPLETED'].includes(state)) {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
  }
  if (
    ['UNHEALTHY', 'DEGRADED', 'FAILED', 'CANCELLED'].includes(state) ||
    state === 'EXITED'
  ) {
    return 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400';
  }
  if (['IDLE', 'ACTIVE'].includes(state)) {
    return 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400';
  }
  if (['NONE', 'UNSPECIFIED', 'UNKNOWN'].includes(state)) {
    return 'border-muted-foreground/25 bg-muted text-muted-foreground';
  }
  return 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400';
};

const MetricCard = ({
  icon: Icon,
  label,
  value,
  detail,
  progress,
  testId,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail?: string;
  progress?: number;
  testId?: string;
}) => (
  <div
    className="min-w-0 rounded-xl border bg-background/70 p-4 shadow-xs"
    data-testid={testId}
  >
    <div className="flex items-center justify-between gap-3">
      <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        <Icon className="size-3.5" />
        {label}
      </p>
      {progress !== undefined ? (
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {Math.min(100, Math.max(0, progress)).toFixed(0)}%
        </span>
      ) : null}
    </div>
    <p
      className="mt-2 truncate text-xl font-semibold tabular-nums"
      title={value}
    >
      {value}
    </p>
    {detail ? (
      <p className="mt-0.5 truncate text-xs text-muted-foreground" title={detail}>
        {detail}
      </p>
    ) : null}
    {progress !== undefined ? (
      <Progress className="mt-3" value={Math.min(100, Math.max(0, progress))} />
    ) : null}
  </div>
);

const InfoValue = ({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) => (
  <div className="min-w-0">
    <dt className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
      {label}
    </dt>
    <dd className="mt-1 text-xs break-words">{value || '—'}</dd>
  </div>
);

const resolveTool = (
  tools: WorkerToolDto[] | undefined,
  toolName?: string,
): WorkerToolDto | undefined => {
  const key = toolName?.trim().toLowerCase();
  if (!key) return undefined;

  return tools?.find((tool) =>
    [tool.id, tool.name].some(
      (value) => value.trim().toLowerCase() === key,
    ),
  );
};

const ContainerCard = ({
  item,
  tool,
}: {
  item: ManagedContainerTelemetryDto;
  tool?: WorkerToolDto;
}) => {
  const t = useT();
  const cpuLimit = item.cpuLimitMillicores;
  const memoryLimit = item.memoryLimitBytes;
  const toolName = tool?.name || item.tool || t('workers.telemetry.unknownTool');

  return (
    <Card
      className="gap-0 overflow-hidden bg-background/70 py-0 shadow-xs"
      data-testid={`container-telemetry-${item.containerId}`}
    >
      <CardContent className="px-4 py-4 md:px-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-[220px] min-w-0 flex-1 items-center gap-3">
            <ToolLogo
              name={toolName}
              logoUrl={tool?.logoUrl}
              size={40}
              className="rounded-lg"
              title={toolName}
            />
            <div className="min-w-0">
              <CardTitle
                className="truncate text-sm"
                title={item.containerName || item.containerId}
              >
                {item.containerName || t('workers.telemetry.unnamedContainer')}
              </CardTitle>
              <CardDescription className="mt-1 break-all text-xs">
                {item.image || t('workers.telemetry.unknownImage')}
                {item.imageVersion ? ` · v${item.imageVersion}` : ''}
              </CardDescription>
            </div>
          </div>
          <dl className="grid shrink-0 grid-cols-3 gap-6">
            <InfoValue
              label={t('workers.telemetry.pool')}
              value={item.pooled ? t('workers.telemetry.warmPool') : t('workers.telemetry.ephemeral')}
            />
            <InfoValue
              label={t('workers.telemetry.cpuLimit')}
              value={
                cpuLimit > 0
                  ? t('workers.telemetry.cores', {
                      count: (cpuLimit / 1000).toFixed(cpuLimit % 1000 ? 2 : 0),
                    })
                  : t('workers.telemetry.notReported')
              }
            />
            <InfoValue label={t('workers.telemetry.memoryLimit')} value={formatBytes(memoryLimit)} />
          </dl>
        </div>
      </CardContent>
    </Card>
  );
};

const ContainerPagination = ({
  page,
  pageCount,
  total,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPageChange: (page: number) => void;
}) => {
  const t = useT();
  return (
  <div className="flex flex-col items-center justify-between gap-3 pt-2 sm:flex-row">
    <p className="text-xs text-muted-foreground">
      {t('workers.telemetry.showing', {
        from: Math.min((page - 1) * CONTAINERS_PER_PAGE + 1, total),
        to: Math.min(page * CONTAINERS_PER_PAGE, total),
        total,
      })}
    </p>
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={buttonVariants({ variant: 'outline', size: 'sm' })}
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft className="size-4" /> {t('workers.telemetry.previous')}
      </button>
      <span className="min-w-24 text-center text-xs text-muted-foreground tabular-nums">
        {t('workers.telemetry.page', { page, pageCount })}
      </span>
      <button
        type="button"
        className={buttonVariants({ variant: 'outline', size: 'sm' })}
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
      >
        {t('workers.telemetry.next')} <ChevronRight className="size-4" />
      </button>
    </div>
  </div>
  );
};

const TelemetryUnavailable = ({ header }: { header?: ReactNode }) => {
  const t = useT();
  return (
  <Card className="gap-0 overflow-hidden border-dashed py-0">
    {header}
    <CardHeader className="px-6 py-6">
      <CardTitle className="flex items-center gap-2 text-sm">
        <Activity className="size-4 text-muted-foreground" />
        {t('workers.telemetry.unavailable.title')}
      </CardTitle>
      <CardDescription>
        {t('workers.telemetry.unavailable.description')}
      </CardDescription>
    </CardHeader>
  </Card>
  );
};

export function WorkerTelemetry({
  telemetry,
  header,
  tools,
}: {
  telemetry?: WorkerTelemetryDto | null;
  header?: ReactNode;
  tools?: WorkerToolDto[];
}) {
  const t = useT();
  const [containerPage, setContainerPage] = useState(1);

  if (!telemetry) return <TelemetryUnavailable header={header} />;

  const memoryUsed = numberValue(telemetry.node.memoryUsedBytes);
  const memoryTotal = numberValue(telemetry.node.memoryTotalBytes);
  const memoryPercent = memoryTotal > 0 ? (memoryUsed / memoryTotal) * 100 : 0;
  const activeJobs = telemetry.jobs.active;
  const maxJobs = telemetry.jobs.maxConcurrency;
  const jobPercent = maxJobs > 0 ? (activeJobs / maxJobs) * 100 : 0;
  const containerItems = telemetry.containers.items;
  const pageCount = Math.max(1, Math.ceil(containerItems.length / CONTAINERS_PER_PAGE));
  const currentPage = Math.min(containerPage, pageCount);
  const visibleContainers = containerItems.slice(
    (currentPage - 1) * CONTAINERS_PER_PAGE,
    currentPage * CONTAINERS_PER_PAGE,
  );

  return (
    <Card
      className={`gap-0 overflow-hidden py-0 ${
        telemetry.freshness === 'stale' ? 'border-amber-500/50' : ''
      }`}
      aria-label={t('workers.telemetry.title')}
    >
      {header}
      <section>
        <CardHeader className="px-6 pt-6 pb-0">
          <CardTitle>{t('workers.telemetry.title')}</CardTitle>
          <CardDescription>
            {t('workers.telemetry.description')}
          </CardDescription>
        </CardHeader>
        {telemetry.freshness === 'stale' ? (
          <div className="flex items-center gap-2 border-y border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-300 md:px-6">
            <Clock3 className="size-3.5" />
            {t('workers.telemetry.stale')}
          </div>
        ) : null}
        <CardContent className="grid gap-4 px-6 pt-4 pb-6 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={Cpu}
            label={t('workers.telemetry.cpu')}
            value={`${telemetry.node.cpuUsagePercent.toFixed(1)}%`}
            detail={t('workers.telemetry.logicalCores', {
              count: telemetry.node.cpuCount,
            })}
            progress={telemetry.node.cpuUsagePercent}
            testId="telemetry-cpu"
          />
          <MetricCard
            icon={MemoryStick}
            label={t('workers.telemetry.memory')}
            value={formatBytes(memoryUsed)}
            detail={t('workers.telemetry.ofTotal', { total: formatBytes(memoryTotal) })}
            progress={memoryPercent}
            testId="telemetry-memory"
          />
          <MetricCard
            icon={Gauge}
            label={t('workers.telemetry.jobs')}
            value={`${activeJobs} / ${maxJobs || '∞'}`}
            detail={t('workers.telemetry.jobsDetail')}
            progress={jobPercent}
            testId="telemetry-jobs"
          />
          <MetricCard
            icon={Timer}
            label={t('workers.telemetry.uptime')}
            value={formatUptime(telemetry.uptimeSeconds)}
            detail={t('workers.telemetry.uptimeDetail')}
            testId="telemetry-uptime"
          />
        </CardContent>
      </section>

      <Separator />
      <section>
        <CardHeader className="px-6 pt-6 pb-0">
          <CardTitle>{t('workers.telemetry.containers')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 px-6 pt-4 pb-6">
          {telemetry.containers.truncated ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Badge variant="outline" className={stateTone('UNKNOWN')}>
                {t('workers.telemetry.truncated', {
                  shown: containerItems.length,
                  total: telemetry.containers.total,
                })}
              </Badge>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <MetricCard icon={Box} label={t('workers.telemetry.total')} value={String(telemetry.containers.total)} />
            <MetricCard
              icon={Activity}
              label={t('workers.telemetry.active')}
              value={String(telemetry.containers.active)}
              detail={t('workers.telemetry.activeDetail')}
            />
            <MetricCard
              icon={Clock3}
              label={t('workers.telemetry.idle')}
              value={String(telemetry.containers.idle)}
              detail={t('workers.telemetry.idleDetail')}
            />
            <MetricCard
              icon={XCircle}
              label={t('workers.telemetry.unhealthy')}
              value={String(telemetry.containers.unhealthy)}
              detail={t('workers.telemetry.unhealthyDetail')}
            />
            <MetricCard
              icon={Network}
              label={t('workers.telemetry.reported')}
              value={String(containerItems.length)}
              detail={
                telemetry.containers.truncated
                  ? t('workers.telemetry.cappedAt', { count: containerItems.length })
                  : t('workers.telemetry.allTracked')
              }
            />
          </div>

          <div className="space-y-4">
            {!telemetry.containers.supported ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                {t('workers.telemetry.unsupported')}
              </div>
            ) : containerItems.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                {t('workers.telemetry.noContainers')}
              </div>
            ) : (
              <>
                <div className="grid gap-3 2xl:grid-cols-2">
                  {visibleContainers.map((item) => (
                    <ContainerCard
                      key={item.containerId}
                      item={item}
                      tool={resolveTool(tools, item.tool)}
                    />
                  ))}
                </div>
                {pageCount > 1 ? (
                  <ContainerPagination
                    page={currentPage}
                    pageCount={pageCount}
                    total={containerItems.length}
                    onPageChange={setContainerPage}
                  />
                ) : null}
              </>
            )}
          </div>
        </CardContent>
      </section>
    </Card>
  );
}
