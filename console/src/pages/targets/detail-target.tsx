import Page from '@/components/common/page';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import JobStatusBadge from '@/components/ui/job-status';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  JobStatus,
  useTargetsControllerGetTargetById,
  useVulnerabilitiesControllerScan,
} from '@/services/apis/gen/queries';
import dayjs from 'dayjs';
import { Bug, Loader2 } from 'lucide-react';
import { getRouteApi, useNavigate, useParams } from '@tanstack/react-router';
import { toast } from 'sonner';
import AssetProvider from '../assets/context/asset-context';
import { ListAssets } from '../assets/list-assets';
import { ListVulnerabilities } from '../vulnerabilities/list-vulnerabilitys';
import VulnerabilitiesStatistic from '../vulnerabilities/vulnerabilites-statistic';
import AssetsDiscovering from './assets-discovering';
import SettingTarget from './setting-target';

// Define tabs configuration
const TABS = [
  { value: 'inventory', label: 'Inventory' },
  { value: 'vulnerabilities', label: 'Vulnerabilities' },
];

const routeApi = getRouteApi('/_authed/targets/$id/$tab');

export function DetailTarget() {
  const { id, tab } = useParams({ from: '/_authed/targets/$id/$tab' });
  const { animation } = routeApi.useSearch();
  const navigate = useNavigate({ from: '/targets/$id/$tab' });

  const {
    data: target,
    isLoading,
    error,
    refetch,
  } = useTargetsControllerGetTargetById(id || '', {
    query: { enabled: !!id, refetchInterval: 5000 },
  });

  const { mutate: scanVulnerabilities } = useVulnerabilitiesControllerScan();

  const activeTab = TABS.some((t) => t.value === tab) ? tab : 'inventory';

  const handleTabChange = (value: string) => {
    navigate({ to: '/targets/$id/$tab', params: { id, tab: value } });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (error || !target) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">Target not found</h2>
        <p className="text-muted-foreground mt-2">
          The target you're looking for doesn't exist or you don't have
          permission to view it.
        </p>
        <Button className="mt-4" onClick={() => window.history.back()}>
          Go back
        </Button>
      </div>
    );
  }

  return (
    <Page
      title={target.value}
      isShowButtonGoBack
      header={
        <div className="flex items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <JobStatusBadge status={target.status} />
          </div>
          <div className="flex items-center gap-3">
            <p className="text-muted-foreground hidden md:block">
              {dayjs(target.lastDiscoveredAt).fromNow()}
            </p>
            <SettingTarget target={target} refetch={refetch} />
          </div>
        </div>
      }
    >
      <Tabs
        value={activeTab!}
        onValueChange={handleTabChange}
        className="w-full"
      >
        <div className="flex justify-between items-center gap-5">
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="hover:cursor-pointer"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {tab === 'vulnerabilities' && (
            <ConfirmDialog
              title="Scan vulnerabilities"
              description={`Are you sure you want to scan vulnerabilities for target ${target.value}?`}
              onConfirm={() =>
                scanVulnerabilities(
                  {
                    data: { targetId: target.id },
                  },
                  {
                    onSuccess: () => {
                      toast.success('Scan started successfully');
                      navigate({
                        to: '/targets/$id/$tab',
                        params: { id: id!, tab: 'vulnerabilities' },
                      });
                    },
                    onError: () => {
                      toast.error('Failed to start scan');
                    },
                  },
                )
              }
              trigger={
                <Button
                  disabled={target.status !== JobStatus.completed}
                  variant="secondary"
                  className="hover:cursor-pointer text-sm"
                  size={'sm'}
                  title={`Start scan vulnerabilities for target ${target.value}`}
                >
                  <Bug className="h-4 w-4" />
                  Fast scan
                </Button>
              }
            />
          )}
        </div>
        <TabsContent value="inventory">
          {animation &&
            (target.status === JobStatus.in_progress ||
              target.status === JobStatus.pending) && (
              <AssetsDiscovering targetId={target.id} />
            )}
          <AssetProvider
            targetId={target.id}
            refetchInterval={
              target.status === JobStatus.in_progress ? 1000 : 30 * 1000
            }
          >
            <ListAssets />
          </AssetProvider>
        </TabsContent>
        <TabsContent
          value="vulnerabilities"
          className="flex flex-col gap-5 py-3"
        >
          <VulnerabilitiesStatistic targetId={target.id} />
          <ListVulnerabilities targetId={target.id} />
        </TabsContent>
      </Tabs>
    </Page>
  );
}

export default DetailTarget;
