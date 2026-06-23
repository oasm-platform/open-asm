import Page from '@/components/common/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { ConnectWorkerTrigger } from '@/components/ui/connect-worker-trigger';
import Image from '@/components/ui/image';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useNavigateWithParams } from '@/hooks/useNavigateWithParams';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { useWorkersControllerGetWorkers } from '@/services/apis/gen/queries';
import type { WorkersControllerGetWorkersParams } from '@/services/apis/gen/queries';
import { useNavigate, useSearch } from '@tanstack/react-router';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Loader2Icon, Server } from 'lucide-react';
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

const VALID_TABS = ['global', 'workspace'] as const;
type TabValue = (typeof VALID_TABS)[number];

const ListWorkers = () => {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const navigateWithParams = useNavigateWithParams();
  const search = useSearch({ strict: false }) as Record<string, string | undefined>;
  const activeTab: TabValue = VALID_TABS.includes(search.tab as TabValue)
    ? (search.tab as TabValue)
    : 'global';

  const navigate = useNavigate();
  const setActiveTab = (tab: TabValue) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    navigate({ search: { ...search, tab } as any, replace: true });
  };

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

  const renderWorkerGrid = (workers: NonNullable<typeof globalData>['data']) => {
    const isWorkerOnline = (w: NonNullable<typeof globalData>['data'][number]) =>
      w.isOnline ??
      new Date().getTime() - new Date(w.lastSeenAt).getTime() < 30000;

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
        {workers.map((worker) => (
          <Card key={worker.id} className={`p-1 transition-opacity ${isWorkerOnline(worker) ? '' : 'opacity-50'}`}>
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
                      {worker.isOnline !== undefined ? (
                        worker.isOnline ? (
                          <>
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                            </span>
                            <span className="text-sm text-green-600">
                              Online
                            </span>
                          </>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            {dayjs(worker.lastSeenAt).fromNow()}
                          </span>
                        )
                      ) : new Date().getTime() -
                          new Date(worker.lastSeenAt).getTime() <
                        30000 ? (
                        <>
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                          </span>
                          <span className="text-sm text-green-600">Online</span>
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {dayjs(worker.lastSeenAt).fromNow()}
                        </span>
                      )}
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
                    <span className="text-muted-foreground">
                      No active jobs
                    </span>
                  )}
                </div>
              </div>
              <div className="text-sm text-muted-foreground text-right">
                Created {dayjs(worker.createdAt).fromNow()}
              </div>
            </CardContent>
            {/* <CardContent className="p-3 space-y-3">
              <div className="flex justify-between items-start">
                <Badge variant="outline">Scope</Badge>
                <div className="flex">
                  <Badge variant="outline" className={`ml-2`}>
                    {worker.scope === 'cloud' ? 'Global' : 'This workspace'}
                  </Badge>
                </div>
              </div>
              <div className="flex justify-between items-start">
                <Badge variant="outline">Surface</Badge>
                <div className="flex">
                  <Badge variant="outline" className={`ml-2`}>
                    {worker.internalNetworkId ? 'Internal network' : 'External'}
                  </Badge>
                </div>
              </div>
              <div className="flex justify-between items-start">
                <Badge variant="outline">Tools</Badge>
                {worker.tools && worker.tools.length > 0 ? (
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
                        <Avatar className="h-8 w-8 border-2 border-background">
                          <AvatarImage
                            src={`/api/${tool.logoUrl}`}
                            alt={tool.name ?? ''}
                          />
                          <AvatarFallback className="text-xs">
                            {tool.name?.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      </Button>
                    ))}
                  </div>
                ) : (
                  <Badge variant="outline">Built-in</Badge>
                )}
              </div>
              <div className="flex justify-between items-start">
                <Badge variant="outline">{worker.id.slice(0, 8)}</Badge>
                <Badge
                  variant={
                    worker.currentJobsCount > 0 ? 'default' : 'secondary'
                  }
                  className={`${worker.currentJobsCount > 0 ? 'bg-green-500 hover:bg-green-700 text-white' : ''} ml-2`}
                >
                  {worker.currentJobsCount > 0 ? (
                    <Loader2Icon className="animate-spin mr-1 h-4 w-4" />
                  ) : (
                    ''
                  )}{' '}
                  {worker.currentJobsCount > 0 ? 'Running' : 'Idle'}
                </Badge>
              </div>

              <div className="flex items-center justify-between">
                <Badge variant="outline">Status</Badge>
                <div className="flex items-center space-x-2">
                  {worker.isOnline !== undefined ? (
                    worker.isOnline ? (
                      <>
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                        <span className="text-sm text-green-600">Online</span>
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {dayjs(worker.lastSeenAt).fromNow()}
                      </span>
                    )
                  ) : new Date().getTime() -
                      new Date(worker.lastSeenAt).getTime() <
                    30000 ? (
                    <>
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                      </span>
                      <span className="text-sm text-green-600">Online</span>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {dayjs(worker.lastSeenAt).fromNow()}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Badge variant="outline">Created at</Badge>
                <span className="text-sm text-muted-foreground">
                  {dayjs(worker.createdAt).fromNow()}
                </span>
              </div>
            </CardContent> */}
          </Card>
        ))}
      </div>
    );
  };

  const renderTabContent = () => {
    if (isLoading) return renderSkeleton();
    if (!data?.data?.length) return renderEmpty();
    return renderWorkerGrid(data.data);
  };

  const hasWorkspaceWorkers = (workspaceData?.data?.length ?? 0) > 0;

  return (
    <Page title="Workers">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'global' | 'workspace')}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="global">Global</TabsTrigger>
            <TabsTrigger value="workspace">Workspace</TabsTrigger>
          </TabsList>
          {activeTab === 'workspace' && hasWorkspaceWorkers && <ConnectWorkerTrigger />}
        </div>
        <TabsContent value="global">{renderTabContent()}</TabsContent>
        <TabsContent value="workspace">{renderTabContent()}</TabsContent>
      </Tabs>
    </Page>
  );
};

export default ListWorkers;
