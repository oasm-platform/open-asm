import Page from '@/components/common/page';
import { Badge } from '@/components/ui/badge';
import { useWorkersControllerGetWorkerById } from '@/services/apis/gen/queries';
import { useParams } from '@tanstack/react-router';
import type { WorkerLocationDto } from '@/services/apis/gen/queries';
import {
  Box,
  Building2,
  CircleDot,
  Globe,
  MapPin,
  Server,
  Shield,
  Zap,
} from 'lucide-react';
import { WorkerDetailSkeleton } from './detail-worker-skeleton';
import { WorkerStatus } from './worker-status';
import { WorkerToolsGraph } from './components/worker-tools-graph';
import { WorkerTelemetry } from './components/worker-telemetry';
import { WorkerSettingsTab } from './tabs/settings-tab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermission } from '@/hooks/usePermission';
import { t, useT } from '@/lib/i18n-dictionary';

const WORKER_TABS = [
  { value: 'overview', labelKey: 'workers.tabs.overview' },
  { value: 'tools', labelKey: 'workers.tabs.tools' },
  { value: 'settings', labelKey: 'workers.tabs.settings' },
] as const;

/** `built_in` -> `Built-in`, `cli` -> `CLI`, otherwise capitalize the raw value. */
function formatType(type: string) {
  if (type === 'built_in') return t('workers.type.builtIn');
  if (type === 'cli') return 'CLI';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/** `Mountain View, California, United States`, skipping the parts that are unknown. */
function formatLocation(location: WorkerLocationDto) {
  return [location.city, location.region, location.country]
    .filter(Boolean)
    .join(', ');
}

export default function WorkerDetail() {
  const t = useT();
  const { id } = useParams({ strict: false });
  const { hasPermission } = usePermission();

  const {
    data: worker,
    isLoading,
    error,
  } = useWorkersControllerGetWorkerById(id || '', {
    query: {
      queryKey: ['worker-detail', id],
      // The graph and telemetry are live views of this page, so polling keeps
      // the running jobs and worker metrics current.
      refetchInterval: 5000,
    },
  });

  if (isLoading) {
    return <WorkerDetailSkeleton />;
  }

  if (error || !worker) {
    return (
      <Page permission="worker.read">
        <div className="flex h-full items-center justify-center">
          <div className="text-lg text-red-500">
            {t('workers.detail.loadError')}
          </div>
        </div>
      </Page>
    );
  }

  // Only workspace workers can be disconnected; cloud workers expire on their own.
  const canDisconnect =
    worker.scope === 'workspace' && hasPermission('worker.write');
  const tools = worker.tools ?? [];
  // The API omits the IP when it is local/private, so there is nothing to show.
  const location = worker.location ? formatLocation(worker.location) : '';

  const title = (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/60 ring-1 ring-border/60">
        {worker.os ? (
          <img
            className="dark:brightness-0 dark:invert"
            width={22}
            height={22}
            src={`/${worker.os}.svg`}
            alt={worker.os}
          />
        ) : (
          <Server className="size-5 text-muted-foreground" />
        )}
      </div>
      <span className="truncate">
        {worker.name || t('workers.detail.unnamed')}
      </span>
    </div>
  );

  const header = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex items-center gap-2 text-muted-foreground">
        <WorkerStatus worker={worker} />
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
            {t('workers.detail.agentMode')}
          </Badge>
        )}
      </div>
      {worker.ipAddress && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Globe className="size-3.5" />
            <span className="font-mono text-foreground">
              {worker.ipAddress}
            </span>
          </span>
          {location && (
            <span
              className="flex items-center gap-1.5"
              title={worker.location?.timezone}
            >
              <MapPin className="size-3.5" />
              {location}
              {worker.location?.countryCode && (
                <span className="text-xs">
                  ({worker.location.countryCode})
                </span>
              )}
            </span>
          )}
          {worker.location?.isp && (
            <span className="hidden items-center gap-1.5 md:flex">
              <Building2 className="size-3.5" />
              {worker.location.isp}
            </span>
          )}
        </div>
      )}
    </div>
  );

  return (
    <Page
      permission="worker.read"
      documentTitle={worker.name || undefined}
      title={title}
      header={header}
    >
      <Tabs
        defaultValue="overview"
        validValues={WORKER_TABS.map((item) => item.value)}
        className="gap-4"
      >
        <div className="w-full overflow-x-auto scrollbar-hide">
          <TabsList className="flex w-max flex-nowrap rounded-none bg-transparent p-0">
            {WORKER_TABS.map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className="h-9 flex-none hover:cursor-pointer"
              >
                {t(item.labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="overview">
          <WorkerTelemetry telemetry={worker.telemetry} tools={tools} />
        </TabsContent>
        <TabsContent value="tools">
          {/* Connected tools — bare react-flow canvas: no card chrome, no header. */}
          <WorkerToolsGraph
            tools={tools}
            worker={{
              name: worker.name,
              os: worker.os,
              isOnline: worker.isOnline,
              lastSeenAt: worker.lastSeenAt,
            }}
          />
        </TabsContent>
        <TabsContent value="settings">
          <WorkerSettingsTab worker={worker} canDisconnect={canDisconnect} />
        </TabsContent>
      </Tabs>
    </Page>
  );
}
