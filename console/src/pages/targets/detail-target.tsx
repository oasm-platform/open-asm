import Page from '@/components/common/page';
import { Button } from '@/components/ui/button';
import JobStatusBadge from '@/components/ui/job-status';
import {
  JobStatus,
  TargetType,
  useTargetsControllerGetTargetById,
} from '@/services/apis/gen/queries';
import { getRouteApi, useNavigate, useParams } from '@tanstack/react-router';
import dayjs from 'dayjs';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import AssetProvider from '../assets/context/asset-context';
import { DiscoverUrlsDialog } from '../assets/components/discover-urls-dialog';
import { ListAssets } from '../assets/list-assets';
import { FastScanDialog } from '../vulnerabilities/components/fast-scan-dialog';
import { ListVulnerabilities } from '../vulnerabilities/list-vulnerabilitys';
import VulnerabilitiesStatistic from '../vulnerabilities/vulnerabilites-statistic';
import AssetsDiscovering from './assets-discovering';
import { GitOrgDetail } from './git-org-detail';
import { TargetSwitcher } from './components/target-switcher';
import SettingTarget from './setting-target';

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

  // Vulnerabilities used to be its own path tab; it now lives in the asset tab
  // row (`?tab=vulnerabilities`). Git orgs still use the path tab.
  const isLegacyVulnPath =
    !!target && target.type !== TargetType.GIT_ORG && tab === 'vulnerabilities';
  useEffect(() => {
    if (!isLegacyVulnPath) return;
    navigate({
      to: '/targets/$id/$tab',
      params: { id, tab: 'inventory' },
      search: { tab: 'vulnerabilities' },
      replace: true,
    });
  }, [isLegacyVulnPath, id, navigate]);

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

  // A Git organization has repositories, not a host inventory.
  if (target.type === TargetType.GIT_ORG) {
    return <GitOrgDetail target={target} tab={tab} refetch={refetch} />;
  }

  return (
    <Page
      permission="target.read"
      title={
        <TargetSwitcher
          currentTargetId={target.id}
          currentTargetValue={target.value}
          currentTargetLogo={target.logo}
        />
      }
      isShowButtonGoBack
      header={
        <div className="flex items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <JobStatusBadge
              status={target.status}
              onClick={() => {
                const showAnimation =
                  target.status === JobStatus.pending ||
                  target.status === JobStatus.in_progress;
                navigate({
                  search: {
                    animation: showAnimation ? 'true' : undefined,
                  },
                  replace: true,
                });
              }}
            />
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
        <ListAssets
          urlsActions={
            // URL discovery only accepts domain targets.
            target.type === TargetType.DOMAIN ? (
              <DiscoverUrlsDialog
                target={{ id: target.id, value: target.value }}
                disabled={target.status !== JobStatus.completed}
              />
            ) : null
          }
          extraTabs={[
            {
              value: 'vulnerabilities',
              text: 'Vulnerabilities',
              tab: (
                <div className="flex flex-col gap-5">
                  <VulnerabilitiesStatistic targetId={target.id} />
                  <ListVulnerabilities
                    targetId={target.id}
                    actions={
                      <FastScanDialog
                        target={{ id: target.id, value: target.value }}
                        disabled={target.status !== JobStatus.completed}
                      />
                    }
                  />
                </div>
              ),
            },
          ]}
        />
      </AssetProvider>
    </Page>
  );
}

export default DetailTarget;
