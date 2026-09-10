import Page from '@/components/common/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { ConnectWorkerTrigger } from '@/components/ui/connect-worker-trigger';
import Image from '@/components/ui/image';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger, useQueryTab } from '@/components/ui/tabs';
import { useNavigateWithParams } from '@/hooks/useNavigateWithParams';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { useWorkersControllerGetWorkers } from '@/services/apis/gen/queries';
import type {
  WorkerInstance,
  WorkersControllerGetWorkersParams,
} from '@/services/apis/gen/queries';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Loader2Icon, Search, SearchX, Server } from 'lucide-react';
import { useMemo, useState } from 'react';
dayjs.extend(relativeTime);

const COMMON_PARAMS = {
  limit: 100,
  page: 1,
  sortBy: 'createdAt',
  sortOrder: 'DESC',
} as const;

const QueryOptions = {
  query: { refetchInterval: 1000 },
} as const;

const VALID_TABS = ['workspace', 'global'] as const;

type WorkerSurface = 'ALL' | 'INTERNAL' | 'EXTERNAL';

const isWorkerOnline = (worker: WorkerInstance) =>
  worker.isOnline ??
  new Date().getTime() - new Date(worker.lastSeenAt).getTime() < 30000;

const WorkerStatus = ({ worker }: { worker: WorkerInstance }) =>
  isWorkerOnline(worker) ? (
    <>
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
      </span>
      <span className="text-sm text-green-600">Online</span>
    </>
  ) : (
    <span className="text-sm text-muted-foreground">
      {dayjs(worker.lastSeenAt).fromNow()}
    </span>
  );

const ListWorkers = () => {
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

  const { data: globalData, isLoading: isGlobalLoading } =
    useWorkersControllerGetWorkers(
      {
        ...COMMON_PARAMS,
        scope: 'cloud',
      } as WorkersControllerGetWorkersParams,
      QueryOptions,
    );

  const { data: workspaceData, isLoading: isWorkspaceLoading } =
    useWorkersControllerGetWorkers(
      {
        ...COMMON_PARAMS,
        scope: 'workspace',
        workspaceId: selectedWorkspaceId,
      } as WorkersControllerGetWorkersParams,
      {
        query: {
          ...QueryOptions.query,
          enabled: !!selectedWorkspaceId,
        },
      },
    );

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

  const renderSkeleton = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {[...Array(3)].map((_, i) => (
        <Card key={i}>
          <CardContent className="p-3 space-y-4">
            <div className="flex justify-between items-start">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-6 w-16" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </CardContent>
        </Card>
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

  const renderWorkerGrid = (workers: WorkerInstance[]) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
      {workers.map((worker) => (
        <Card
          key={worker.id}
          className={`p-1 transition-opacity ${isWorkerOnline(worker) ? '' : 'opacity-50'}`}
        >
          <CardContent className="p-3 space-y-4">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1 bg-muted rounded-lg">
                  {worker.os ? (
                    <img
                      className="dark:brightness-0 dark:invert"
                      width={30}
                      height={30}
                      src={`/${worker.os}.svg`}
                      alt={worker.os}
                    />
                  ) : (
                    <Server />
                  )}
                </div>
                <div>
                  <span className="text-sm">{worker.name}</span>
                  <div className="flex items-center space-x-2">
                    <WorkerStatus worker={worker} />
                  </div>
                </div>
              </div>
              <Badge
                variant="secondary"
                className={`${worker.internalNetworkId ? 'cursor-pointer hover:bg-secondary/80' : ''}`}
                onClick={() => {
                  if (worker.internalNetworkId) {
                    navigateWithParams(
                      `/internal-networks/${worker.internalNetworkId}`,
                    );
                  }
                }}
              >
                {worker.internalNetworkId ? 'Internal network' : 'External'}
              </Badge>
            </CardTitle>
            <div className="flex justify-between items-center">
              <div className="flex -space-x-2">
                {worker.tools.map((tool) => (
                  <Button
                    key={tool.id}
                    variant="ghost"
                    className="h-8 w-8 p-0 rounded-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigateWithParams(`/tools/${tool.id}`);
                    }}
                  >
                    <Image
                      className="rounded-full"
                      height={30}
                      width={30}
                      url={tool.logoUrl}
                    />
                  </Button>
                ))}
              </div>
              <div className="flex justify-between">
                {worker.currentJobsCount > 0 ? (
                  <span className="text-green-600">
                    {worker.currentJobsCount} active job
                    {worker.currentJobsCount > 1 ? 's' : ''}
                  </span>
                ) : (
                  <span className="text-muted-foreground">No active jobs</span>
                )}
              </div>
            </div>
            <div className="text-sm text-muted-foreground text-right">
              Created {dayjs(worker.createdAt).fromNow()}
            </div>
          </CardContent>
        </Card>
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
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="workspace">Workspace</TabsTrigger>
            <TabsTrigger value="global">Global</TabsTrigger>
          </TabsList>
          {activeTab === 'workspace' && hasWorkspaceWorkers && (
            <ConnectWorkerTrigger />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative w-56 max-w-xs">
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
            <SelectTrigger className="w-[130px] border-dashed py-0 text-xs focus:outline-none focus:ring-0 focus:ring-offset-0">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All types</SelectItem>
              <SelectItem value="EXTERNAL">External</SelectItem>
              <SelectItem value="INTERNAL">Internal</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <TabsContent value="workspace">{renderTabContent()}</TabsContent>
        <TabsContent value="global">{renderTabContent()}</TabsContent>
      </Tabs>
    </Page>
  );
};

export default ListWorkers;
