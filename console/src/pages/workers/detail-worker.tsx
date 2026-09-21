import Page from '@/components/common/page';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useWorkersControllerGetWorkerById } from '@/services/apis/gen/queries';
import { useNavigate, useParams } from '@tanstack/react-router';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  Box,
  CircleDot,
  Server,
  Shield,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { memo, type ReactNode } from 'react';
import { WorkerDetailSkeleton } from './detail-worker-skeleton';
import { WorkerStatus } from './worker-status';
import { WorkerToolsGraph } from './components/worker-tools-graph';

dayjs.extend(relativeTime);

/** `built_in` -> `Built-in`, `cli` -> `CLI`, otherwise capitalize the raw value. */
function formatType(type: string) {
  if (type === 'built_in') return 'Built-in';
  if (type === 'cli') return 'CLI';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/** Exact stamp, reused as the hover title of every relative time. */
const stamp = (value?: string | null) =>
  value ? dayjs(value).format('DD MMM YYYY, HH:mm:ss') : undefined;

const absolute = (value?: string | null) =>
  value ? dayjs(value).format('DD MMM YYYY, HH:mm') : '—';

/** One field. Memoised: pure function of two props, so the 14-row grid is not
 * re-rendered by theme/nav churn. */
const InfoRow = memo(function InfoRow({
  icon: Icon,
  label,
  value,
  title,
}: {
  icon?: LucideIcon;
  label: string;
  value: ReactNode;
  title?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {Icon && <Icon className="size-3" />}
        {label}
      </p>
      <p
        className="truncate text-sm font-medium tabular-nums"
        title={title ?? (typeof value === 'string' ? value : undefined)}
      >
        {value || '—'}
      </p>
    </div>
  );
});

export default function WorkerDetail() {
  const { id } = useParams({ strict: false });
  const navigate = useNavigate();

  const {
    data: worker,
    isLoading,
    error,
  } = useWorkersControllerGetWorkerById(id || '', {
    query: {
      queryKey: ['worker-detail', id],
      // The graph is the live view of this page: the API returns the running
      // jobs per tool, so a poll is what moves the target labels on the nodes.
      // TanStack pauses this while the tab is hidden.
      refetchInterval: 5000,
    },
  });

  if (isLoading) {
    return <WorkerDetailSkeleton />;
  }

  if (error || !worker) {
    return (
      <Page isShowButtonGoBack permission="worker.read">
        <div className="flex h-full items-center justify-center">
          <div className="text-lg text-red-500">
            Error loading worker details
          </div>
        </div>
      </Page>
    );
  }

  const tools = worker.tools ?? [];
  const toolsCount = worker.toolsCount ?? tools.length;
  const internalNetworkId = worker.internalNetworkId;

  // One row per fact, one fact per row. The grid is the only place any value is
  // printed — the hero above it carries identity (OS mark, name, liveness, the
  // scope/type/run-mode chips) and never repeats a value from below.
  const rows: {
    icon?: LucideIcon;
    label: string;
    value: ReactNode;
    title?: string;
  }[] = [
    { icon: Server, label: 'System', value: worker.os },
    {
      label: 'Tools connected',
      value: `${toolsCount} tool${toolsCount === 1 ? '' : 's'}`,
    },
    { label: 'Current jobs', value: String(worker.currentJobsCount) },
    {
      label: 'Last seen',
      value: dayjs(worker.lastSeenAt).fromNow(),
      title: stamp(worker.lastSeenAt),
    },
    {
      label: 'Internal network',
      value: internalNetworkId ? (
        <button
          type="button"
          onClick={() =>
            navigate({
              to: '/internal-networks/$id',
              params: { id: internalNetworkId },
            })
          }
          className="cursor-pointer text-primary underline-offset-4 hover:underline"
        >
          {internalNetworkId}
        </button>
      ) : (
        'Not attached'
      ),
    },
    {
      label: 'Created',
      value: absolute(worker.createdAt),
      title: stamp(worker.createdAt),
    },
    {
      label: 'Updated',
      value: absolute(worker.updatedAt),
      title: stamp(worker.updatedAt),
    },
    { label: 'IP address', value: worker.ipAddress },
    { label: 'Worker ID', value: worker.id },
  ];

  return (
    <Page isShowButtonGoBack permission="worker.read">
      <div className="space-y-4">
        <Card className="gap-0 overflow-hidden py-0">
          {/* Identity: mark, name, liveness, scope/type/run mode. */}
          <div className="flex items-center gap-4 bg-gradient-to-r from-primary/[0.07] via-transparent to-transparent p-5">
            <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-muted/60 ring-1 ring-border/60">
              {worker.os ? (
                <img
                  className="dark:brightness-0 dark:invert"
                  width={40}
                  height={40}
                  src={`/${worker.os}.svg`}
                  alt={worker.os}
                />
              ) : (
                <Server className="size-8 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <h1 className="truncate text-xl font-semibold tracking-tight">
                  {worker.name || 'Unnamed worker'}
                </h1>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <WorkerStatus worker={worker} />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="gap-1 border-border/70">
                  <Shield className="size-3" />
                  {formatType(worker.scope)}
                </Badge>
                <Badge variant="outline" className="gap-1 border-border/70">
                  <Box className="size-3" />
                  {formatType(worker.type)}
                </Badge>
                {worker.runMode && (
                  <Badge variant="outline" className="gap-1 border-border/70">
                    <Zap className="size-3" />
                    {formatType(worker.runMode)}
                  </Badge>
                )}
                {worker.enabledAgentMode && (
                  <Badge
                    variant="outline"
                    className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  >
                    <CircleDot className="size-3" />
                    Agent mode
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Every fact, once. */}
          <CardContent className="py-4">
            <CardTitle className="sr-only">Worker information</CardTitle>
            <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((row) => (
                <InfoRow key={row.label} {...row} />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Connected tools — bare react-flow canvas: no card chrome, no header.
            Spacing comes from the parent's `space-y-4`. */}
        <div>
          <WorkerToolsGraph
            tools={tools}
            worker={{
              name: worker.name,
              os: worker.os,
              isOnline: worker.isOnline,
              lastSeenAt: worker.lastSeenAt,
            }}
          />
        </div>
      </div>
    </Page>
  );
}
