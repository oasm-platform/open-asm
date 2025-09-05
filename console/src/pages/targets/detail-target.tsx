import Page from '@/components/common/page';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TargetStatus from '@/components/ui/target-status';
import {
  JobStatus,
  useTargetsControllerGetTargetById,
  useVulnerabilitiesControllerScan,
} from '@/services/apis/gen/queries';
import dayjs from 'dayjs';
import { Bug, Loader2 } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import AssetProvider from '../assets/context/asset-context';
import { ListAssets } from '../assets/list-assets';
import { ListVulnerabilities } from '../vulnerabilities/list-vulnerabilitys';
import VulnerabilitiesStatistic from '../vulnerabilities/vulnerabilites-statistic';
import AssetsDiscovering from './assets-discovering';
import SettingTarget from './setting-target';

// Define tabs configuration
const TABS = [
  { value: 'assets', label: 'Assets' },
  { value: 'vulnerabilities', label: 'Vulnerabilities' },
];

export function DetailTarget() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const animation = searchParams.get('animation') === 'true';
  const tab = searchParams.get('tab');

  const {
    data: target,
    isLoading,
    error,
    refetch
  } = useTargetsControllerGetTargetById(id || '', {
    query: { enabled: !!id, refetchInterval: 5000 },
  });

  const { mutate: scanVulnerabilities } = useVulnerabilitiesControllerScan();

  // Determine active tab, default to "assets" if not specified
  const activeTab = TABS.some((t) => t.value === tab) ? tab : 'assets';

  // Handle tab change
  const handleTabChange = (value: string) => {
    // Create new search params with the selected tab
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.set('tab', value);
    navigate(`?${newSearchParams.toString()}`);
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
        <Button className="mt-4" onClick={() => navigate(-1)}>
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
            <TargetStatus status={target.status} />
          </div>
          <div className="flex items-center gap-3">
            <p className="text-muted-foreground">
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
        className="w-full my-6"
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
                      navigate(`?tab=vulnerabilities`);
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
                  Scan vulnerability
                </Button>
              }
            />
          )}
        </div>
        <TabsContent value="assets">
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
