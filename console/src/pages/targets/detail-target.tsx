import Page from '@/components/common/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import JobStatusBadge from '@/components/ui/job-status';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  JobStatus,
  TargetType,
  useTargetsControllerGetTargetById,
} from '@/services/apis/gen/queries';
import { getRouteApi, useNavigate, useParams } from '@tanstack/react-router';
import dayjs from 'dayjs';
import { CalendarClock, Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import AssetProvider from '../assets/context/asset-context';
import { DiscoverUrlsDialog } from '../assets/components/discover-urls-dialog';
import { ListAssets } from '../assets/list-assets';
import { FastScanDialog } from '../vulnerabilities/components/fast-scan-dialog';
import { VulnerabilitiesView } from '../vulnerabilities/vulnerabilities-view';
import AssetsDiscovering from './assets-discovering';
import { GitOrgDetail } from './git-org-detail';
import { TargetSwitcher } from './components/target-switcher';
import { TargetActivityTab } from './tabs/activity-tab';
import { TargetOverviewTab } from './tabs/overview-tab';
import { TargetSettingsTab } from './tabs/settings-tab';
import {
  TARGET_TABS,
  isScheduled,
  isTargetTab,
  scheduleLabel,
  targetTabRedirect,
} from './target-utils';

const routeApi = getRouteApi('/_authed/targets/$id/$tab');

export function DetailTarget() {
  const { id, tab } = useParams({ from: '/_authed/targets/$id/$tab' });
  const search = routeApi.useSearch();
  const navigate = useNavigate({ from: '/targets/$id/$tab' });

  const {
    data: target,
    isLoading,
    error,
    refetch,
  } = useTargetsControllerGetTargetById(id || '', {
    query: { enabled: !!id, refetchInterval: 5000 },
  });

  // Old path tabs (`inventory`, `asset-services`), the old vulnerabilities
  // asset tab and unknown ones land on their tab today, keeping the query
  // (notification links carry `?tab=urls`). Git orgs keep their own tabs.
  const isGitOrg = target?.type === TargetType.GIT_ORG;
  const redirect =
    !target || isGitOrg ? null : targetTabRedirect(tab, search.tab);
  const redirectTab = redirect?.tab ?? null;
  const redirectInner = redirect?.innerTab;
  useEffect(() => {
    if (!redirectTab) return;
    navigate({
      to: '/targets/$id/$tab',
      params: { id, tab: redirectTab },
      search: { ...search, tab: redirectInner },
      replace: true,
    });
  }, [redirectTab, redirectInner, id, navigate, search]);

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
  if (isGitOrg) {
    return <GitOrgDetail target={target} tab={tab} refetch={refetch} />;
  }
  if (redirectTab || !isTargetTab(tab)) return null;

  const scanning =
    target.status === JobStatus.pending ||
    target.status === JobStatus.in_progress;

  const goTab = (value: string) =>
    navigate({ to: '/targets/$id/$tab', params: { id, tab: value }, search: {} });

  const tabs = {
    overview: <TargetOverviewTab target={target} />,
    assets: (
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
        />
      </AssetProvider>
    ),
    vulnerabilities: (
      <VulnerabilitiesView
        targetId={target.id}
        actions={
          <FastScanDialog
            target={{ id: target.id, value: target.value }}
            disabled={target.status !== JobStatus.completed}
          />
        }
      />
    ),
    activity: <TargetActivityTab targetId={target.id} />,
    settings: <TargetSettingsTab target={target} refetch={refetch} />,
  };

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
      header={
        <div className="flex flex-wrap items-center gap-3">
          <JobStatusBadge
            status={target.status}
            onClick={() =>
              navigate({
                search: { ...search, animation: scanning ? 'true' : undefined },
                replace: true,
              })
            }
          />
          <Badge
            variant="outline"
            className="cursor-pointer gap-1.5 font-normal"
            onClick={() => goTab('settings')}
            title="Scan schedule"
          >
            <CalendarClock className="size-3.5" />
            {isScheduled(target.scanSchedule)
              ? scheduleLabel(target.scanSchedule)
              : 'Manual'}
          </Badge>
          <p className="text-sm text-muted-foreground hidden md:block">
            Discovered {dayjs(target.lastDiscoveredAt).fromNow()}
          </p>
        </div>
      }
    >
      {search.animation && scanning && (
        <AssetsDiscovering targetId={target.id} />
      )}
      <div className="flex flex-col gap-4">
        <Tabs value={tab} onValueChange={goTab}>
          <div className="w-full overflow-x-auto scrollbar-hide">
            <TabsList className="flex w-max flex-nowrap rounded-none bg-transparent p-0">
              {TARGET_TABS.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="h-9 flex-none hover:cursor-pointer"
                >
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>
        {tabs[tab]}
      </div>
    </Page>
  );
}

export default DetailTarget;
