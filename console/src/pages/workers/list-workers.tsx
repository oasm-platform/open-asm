import Page from '@/components/common/page';
import { Badge } from '@/components/ui/badge';
import { ConnectWorkerTrigger } from '@/components/ui/connect-worker-trigger';
import { Input } from '@/components/ui/input';
import LogoFrame from '@/components/ui/logo-frame';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger, useQueryTab } from '@/components/ui/tabs';
import { useLiveEvents } from '@/hooks/use-live-events';
import { useNavigateWithParams } from '@/hooks/useNavigateWithParams';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { useWorkersControllerGetWorkers } from '@/services/apis/gen/queries';
import type {
  WorkerListItemDto,
  WorkersControllerGetWorkersParams,
} from '@/services/apis/gen/queries';
import { useNavigate } from '@tanstack/react-router';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Loader2Icon, Search, SearchX, Server } from 'lucide-react';
import { useMemo, useState } from 'react';
import { isWorkerOnline, WorkerStatus } from './worker-status';

// `fromNow()` below needs the plugin; registered here so this file does not
// silently depend on worker-status.tsx having been loaded first.
dayjs.extend(relativeTime);

const COMMON_PARAMS = {
  limit: 100,
  page: 1,
  sortBy: 'createdAt',
  sortOrder: 'DESC',
} as const;

const VALID_TABS = ['workspace', 'global'] as const;

// Same grid as the tools and integrations pages
const GRID_CLASS =
  'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4';

type WorkerSurface = 'ALL' | 'INTERNAL' | 'EXTERNAL';

const ListWorkers = () => {
  const navigate = useNavigate();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const navigateWithParams = useNavigateWithParams();
  const [activeTab, setActiveTab] = useQueryTab({
    tabParam: 'tab',
    defaultValue: 'workspace',
    validValues: [...VALID_TABS],
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [surface, setSurface] = useState<WorkerSurface>('ALL');

  // Each tab fetches only while it is open; switching back re-uses the cache
  // and refetches it when stale.
  const isWorkspaceTab = activeTab === 'workspace';

  const { data: globalData, isLoading: isGlobalLoading } =
    useWorkersControllerGetWorkers(
      {
        ...COMMON_PARAMS,
        scope: 'cloud',
      } as WorkersControllerGetWorkersParams,
      { query: { enabled: activeTab === 'global' } },
    );

  const {
    data: workspaceData,
    isLoading: isWorkspaceLoading,
    refetch: refetchWorkspace,
  } = useWorkersControllerGetWorkers(
    {
      ...COMMON_PARAMS,
      scope: 'workspace',
      workspaceId: selectedWorkspaceId,
    } as WorkersControllerGetWorkersParams,
    { query: { enabled: isWorkspaceTab && !!selectedWorkspaceId } },
  );

  // No polling: refetch only when the server pushes a worker event. Those are
  // workspace-scoped (cloud workers have no workspace and emit none), so only
  // the workspace list follows them — and only while its tab is open; the
  // cache goes stale meanwhile and is refetched when the tab is opened.
  useLiveEvents('worker.*', () => {
    if (isWorkspaceTab) void refetchWorkspace();
  });

  const data = activeTab === 'global' ? globalData : workspaceData;
  const isLoading = activeTab === 'global' ? isGlobalLoading : isWorkspaceLoading;

  const filteredWorkers = useMemo(() => {
    const workers = data?.data ?? [];
    const query = searchQuery.trim().toLowerCase();
    return workers.filter((worker) => {
      const matchesQuery =
        !query ||
        worker.name?.toLowerCase().includes(query) ||
        worker.os?.toLowerCase().includes(query);
      const matchesSurface =
        surface === 'ALL' ||
        (surface === 'INTERNAL'
          ? !!worker.internalNetworkId
          : !worker.internalNetworkId);
      return matchesQuery && matchesSurface;
    });
  }, [data, searchQuery, surface]);

  // Same shape as ToolCardSkeleton
  const renderSkeleton = () => (
    <div className={GRID_CLASS}>
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className="flex flex-col items-start gap-2 rounded-lg border p-5 animate-pulse"
        >
          <div className="flex w-full items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="size-6 rounded bg-muted" />
              <div className="h-4 w-24 rounded-md bg-muted" />
            </div>
            <div className="h-4 w-14 rounded-md bg-muted" />
          </div>
          <div className="flex w-full items-center justify-between gap-2">
            <div className="h-3 w-24 rounded-md bg-muted" />
            <div className="h-3 w-28 rounded-md bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );

  const renderEmpty = () => {
    if (activeTab === 'global') {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Server className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="m-4 text-lg font-medium text-muted-foreground">
            No workers available
          </h3>
          <p className="text-sm text-muted-foreground">
            There are no global workers at the moment.
          </p>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Loader2Icon className="h-6 w-6 text-muted-foreground animate-spin" />
        </div>
        <h3 className="m-4 text-lg font-medium text-muted-foreground">
          Pending connect workers...
        </h3>
        <ConnectWorkerTrigger />
      </div>
    );
  };

  const renderNoMatch = () => (
    <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <SearchX className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="m-4 text-lg font-medium text-muted-foreground">
        No matching workers
      </h3>
      <p className="text-sm text-muted-foreground">
        Try a different search or filter.
      </p>
    </div>
  );

  const renderWorkerGrid = (workers: WorkerListItemDto[]) => (
    <div className={GRID_CLASS}>
      {workers.map((worker) => (
        // Same layout as ToolCard: the detail link is a full-card overlay, so
        // the internal-network badge can sit beside it instead of nested inside
        <div
          key={worker.id}
          className={`relative flex h-full flex-col items-start gap-2 rounded-lg border p-5 text-left transition-colors hover:border-primary hover:bg-accent/50 ${isWorkerOnline(worker) ? '' : 'opacity-50'}`}
        >
          <button
            type="button"
            aria-label={worker.name}
            onClick={() =>
              navigate({ to: '/workers/$id', params: { id: worker.id } })
            }
            className="absolute inset-0 rounded-lg cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex w-full items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <LogoFrame className="shrink-0 overflow-hidden">
                {worker.os ? (
                  <img
                    width={24}
                    height={24}
                    src={`/${worker.os}.svg`}
                    alt={worker.os}
                  />
                ) : (
                  <Server className="size-6 dark:text-black" />
                )}
              </LogoFrame>
              <h3 className="truncate text-base font-semibold">
                {worker.name}
              </h3>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <WorkerStatus worker={worker} />
            </div>
          </div>
          <div className="flex w-full items-center justify-between gap-2 text-sm text-muted-foreground">
            {worker.currentJobsCount > 0 ? (
              <span className="text-green-600">
                {worker.currentJobsCount} active job
                {worker.currentJobsCount > 1 ? 's' : ''}
              </span>
            ) : (
              <span>No active jobs</span>
            )}
            <span>Created {dayjs(worker.createdAt).fromNow()}</span>
          </div>
          {worker.internalNetworkId && (
            // Pinned to the bottom so badges line up across cards
            <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
              <Badge
                asChild
                variant="secondary"
                className="relative z-10 cursor-pointer hover:bg-secondary/80"
              >
                <button
                  type="button"
                  onClick={() =>
                    navigateWithParams(
                      `/internal-networks/${worker.internalNetworkId}`,
                    )
                  }
                >
                  Internal network
                </button>
              </Badge>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const renderTabContent = () => {
    if (isLoading) return renderSkeleton();
    if (!data?.data?.length) return renderEmpty();
    if (!filteredWorkers.length) return renderNoMatch();
    return renderWorkerGrid(filteredWorkers);
  };

  const hasWorkspaceWorkers = (workspaceData?.data?.length ?? 0) > 0;

  return (
    <Page
      title="Workers"
      permission="worker.read"
      description="Workers connect your infrastructure to run scans."
    >
      {/* gap-4 = the 16px rhythm of the tools and integrations pages */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full gap-4">
        <TabsList>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="global">Global</TabsTrigger>
        </TabsList>
        {/* Same toolbar as DataTable (targets page): search and filters on
            the left, actions on the right from md up; stacked below md */}
        <div className="flex flex-col gap-2 md:flex-row-reverse md:items-center md:justify-between">
          {activeTab === 'workspace' && hasWorkspaceWorkers && (
            <div className="flex items-center gap-2 md:justify-end">
              <ConnectWorkerTrigger />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 md:min-w-0 md:flex-1">
            <div className="relative w-full md:min-w-48 md:flex-1 md:max-w-xs xl:max-w-sm">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search workers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 pl-8 text-xs"
              />
            </div>
            <Select
              value={surface}
              onValueChange={(value) => setSurface(value as WorkerSurface)}
            >
              <SelectTrigger className="w-[150px] border-dashed py-0 text-xs focus:outline-none focus:ring-0 focus:ring-offset-0">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All types</SelectItem>
                <SelectItem value="EXTERNAL">External</SelectItem>
                <SelectItem value="INTERNAL">Internal</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <TabsContent value="workspace">{renderTabContent()}</TabsContent>
        <TabsContent value="global">{renderTabContent()}</TabsContent>
      </Tabs>
    </Page>
  );
};

export default ListWorkers;
