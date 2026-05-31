import Page from '@/components/common/page';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import CreateWorkspace from '../workspaces/create-workspace';
import AssetLocationsMap from './components/asset-locations-map';
import { AssetTrends } from './components/asset-trends';
import IssuesTimeline from './components/issues-timeline';
import Statistic from './components/statistic';
import TlsStatistics from './components/tls-statistics';
import TopAssetsVulnerabilitiesChart from './components/top-assets-vulnerabilities-chart';
import VulnerabilityStatistic from './components/vulnerabilities-statistic';

export default function Dashboard() {
  const { workspaces, isLoading } = useWorkspaceSelector();

  if (isLoading) return <Page title="Dashboard" />;

  if (workspaces.length === 0) {
    return (
      <Page title="Dashboard">
        <CreateWorkspace />
      </Page>
    );
  }

  return (
    <Page title="Dashboard">
      <div className="grid grid-cols-1 2xl:grid-cols-4 gap-4">
        <div className="col-span-1 2xl:col-span-3 space-y-4 2xl:order-1">
          <Statistic />
          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
            <IssuesTimeline />
            <AssetTrends />

            <TopAssetsVulnerabilitiesChart />
            <AssetLocationsMap />
          </div>
        </div>
        <div className="col-span-1 space-y-4 order-first 2xl:order-2">
          <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-1 gap-4">
            <VulnerabilityStatistic />
            <TlsStatistics />
          </div>
        </div>
        <div className="col-span-1 2xl:col-span-3 min-h-96 order-last"></div>
      </div>
    </Page>
  );
}
