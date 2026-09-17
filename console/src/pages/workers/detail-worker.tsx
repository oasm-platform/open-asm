import Page from '@/components/common/page';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useWorkersControllerGetWorkerById } from '@/services/apis/gen/queries';
import { useNavigate, useParams } from '@tanstack/react-router';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Box, Server, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';
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

/** Label/value pair used across the information section. */
function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium break-all">{value || '—'}</p>
    </div>
  );
}

export default function WorkerDetail() {
  const { id } = useParams({ strict: false });
  const navigate = useNavigate();

  const {
    data: worker,
    isLoading,
    error,
  } = useWorkersControllerGetWorkerById(id || '', {
    query: { queryKey: ['worker-detail', id] },
  });

  if (isLoading) {
    return <WorkerDetailSkeleton />;
  }

  if (error || !worker) {
    return (
      <Page isShowButtonGoBack permission="worker.read">
        <div className="flex items-center justify-center h-full">
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

  return (
    <Page isShowButtonGoBack permission="worker.read">
      <div className="space-y-4">
        {/* Hero: OS tile, name, status + scope/type/run mode badges */}
        <Card>
          <CardContent>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <div className="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-muted">
                  {worker.os ? (
                    <img
                      className="dark:brightness-0 dark:invert"
                      width={56}
                      height={56}
                      src={`/${worker.os}.svg`}
                      alt={worker.os}
                    />
                  ) : (
                    <Server className="size-12 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 space-y-2">
                  <h1 className="text-2xl font-semibold tracking-tight">
                    {worker.name || 'Unnamed worker'}
                  </h1>
                  <div className="flex items-center gap-2">
                    <WorkerStatus worker={worker} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">
                      {formatType(worker.scope)}
                    </Badge>
                    <Badge variant="secondary" className="gap-1">
                      <Box />
                      {formatType(worker.type)}
                    </Badge>
                    {worker.runMode && (
                      <Badge variant="secondary">
                        {formatType(worker.runMode)}
                      </Badge>
                    )}
                    {worker.enabledAgentMode && (
                      <Badge variant="secondary">Agent mode</Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="shrink-0 sm:text-right">
                <p className="text-xs text-muted-foreground">Current jobs</p>
                <p
                  className={`text-sm font-medium ${worker.currentJobsCount > 0 ? 'text-green-600' : 'text-muted-foreground'}`}
                >
                  {worker.currentJobsCount > 0
                    ? `${worker.currentJobsCount} running`
                    : 'Idle'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Worker information */}
        <Card>
          <CardHeader>
            <CardTitle>Worker information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <InfoRow label="Operating system" value={worker.os} />
              <InfoRow label="Type" value={formatType(worker.type)} />
              <InfoRow label="Scope" value={formatType(worker.scope)} />
              <InfoRow
                label="Run mode"
                value={worker.runMode ? formatType(worker.runMode) : ''}
              />
              <InfoRow
                label="Agent mode"
                value={worker.enabledAgentMode ? 'Enabled' : 'Disabled'}
              />
              <InfoRow
                label="Current jobs"
                value={String(worker.currentJobsCount)}
              />
              <InfoRow
                label="Internal network"
                value={
                  internalNetworkId ? (
                    <button
                      type="button"
                      onClick={() =>
                        navigate({
                          to: '/internal-networks/$id',
                          params: { id: internalNetworkId },
                        })
                      }
                      className="cursor-pointer text-sm font-medium break-all text-primary underline-offset-4 hover:underline"
                    >
                      {internalNetworkId}
                    </button>
                  ) : (
                    'Not attached'
                  )
                }
              />
              <InfoRow
                label="Created"
                value={dayjs(worker.createdAt).format('DD MMM YYYY, HH:mm')}
              />
              <InfoRow
                label="Updated"
                value={dayjs(worker.updatedAt).format('DD MMM YYYY, HH:mm')}
              />
              <InfoRow
                label="Last seen"
                value={dayjs(worker.lastSeenAt).fromNow()}
              />
              <InfoRow label="IP address" value={worker.ipAddress} />
              <InfoRow label="Worker ID" value={worker.id} />
            </div>
          </CardContent>
        </Card>

        {/* Connected tools */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="size-4 text-muted-foreground" />
              Connected tools
              <span className="text-sm font-normal text-muted-foreground">
                {toolsCount} tool{toolsCount === 1 ? '' : 's'} connected
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tools.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Wrench className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="m-4 text-lg font-medium text-muted-foreground">
                  No tools connected
                </h3>
                <p className="text-sm text-muted-foreground">
                  This worker has not reported any tools yet.
                </p>
              </div>
            ) : (
              <WorkerToolsGraph
                tools={tools}
                toolsCount={toolsCount}
                worker={{
                  name: worker.name,
                  os: worker.os,
                  runMode: worker.runMode,
                  isOnline: worker.isOnline,
                  lastSeenAt: worker.lastSeenAt,
                }}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
