import Page from '@/components/common/page';
import { Badge } from '@/components/ui/badge';
import { useWorkersControllerGetWorkerById } from '@/services/apis/gen/queries';
import { useParams } from '@tanstack/react-router';
import {
  Box,
  CircleDot,
  Server,
  Shield,
  Zap,
} from 'lucide-react';
import { WorkerDetailSkeleton } from './detail-worker-skeleton';
import { WorkerStatus } from './worker-status';
import { WorkerToolsGraph } from './components/worker-tools-graph';
import { WorkerTelemetry } from './components/worker-telemetry';

/** `built_in` -> `Built-in`, `cli` -> `CLI`, otherwise capitalize the raw value. */
function formatType(type: string) {
  if (type === 'built_in') return 'Built-in';
  if (type === 'cli') return 'CLI';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export default function WorkerDetail() {
  const { id } = useParams({ strict: false });

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
  const identityHeader = (
    <div className="flex items-center gap-4 border-b border-border/60 bg-gradient-to-r from-primary/[0.07] via-transparent to-transparent p-6">
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
      <div className="min-w-0 flex-1 space-y-2">
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
  );

  return (
    <Page isShowButtonGoBack permission="worker.read">
      <div className="space-y-6">
        <WorkerTelemetry
          telemetry={worker.telemetry}
          header={identityHeader}
          tools={tools}
        />

        <div>
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
        </div>
      </div>
    </Page>
  );
}
