import Page from '@/components/common/page';
import { useIpLocationData } from '@/hooks/useIpLocationData';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { useStatisticControllerGetAssetLocations } from '@/services/apis/gen/queries';
import { useState } from 'react';
import CreateWorkspace from '../workspaces/create-workspace';
import { AssetTrends } from './components/asset-trends';
import IpLocationsCard from './components/ip-locations-card';
import IssuesTimeline from './components/issues-timeline';
import NeedsAttention from './components/needs-attention';
import RecentAssets from './components/recent-assets';
import Statistic from './components/statistic';
import TlsStatistics from './components/tls-statistics';
import TopAssetsVulnerabilitiesChart from './components/top-assets-vulnerabilities-chart';
import TopPorts from './components/top-ports';
import TopTechnologies from './components/top-technologies';
import VulnerabilityStatistic from './components/vulnerabilities-statistic';
import VulnerabilityActivity from './components/vulnerability-activity';
import VulnerabilityLifecycle from './components/vulnerability-lifecycle';

export default function Dashboard() {
  const { workspaces, isLoading: workspacesLoading } = useWorkspaceSelector();
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);

  const { data: locations, isLoading: locationsLoading } =
    useStatisticControllerGetAssetLocations();

  const { data: ipLocationData, totalIps } = useIpLocationData({
    locations,
    isLoading: locationsLoading,
  });

  if (workspacesLoading) return <Page title="Dashboard" description="Workspace security overview" />;

  if (workspaces.length === 0) {
    return (
      <Page title="Dashboard" description="Workspace security overview">
        <CreateWorkspace />
      </Page>
    );
  }

  return (
    <Page title="Dashboard" description="Workspace security overview">
      {/* Columns follow the dashboard's own width, not the viewport's: the
          app sidebar and the AI chat panel take their share first. */}
      <div className="@container/dashboard space-y-4">
        <div className="grid grid-cols-1 @6xl/dashboard:grid-cols-4 gap-4">
          {/* `dashboard-main`: the stat cards and the map size by this column */}
          <div className="@container/dashboard-main col-span-1 @6xl/dashboard:col-span-3 order-2 @6xl/dashboard:order-0 flex flex-col gap-4">
            <div className="flex-1">
              <Statistic />
            </div>
            <div className="flex-1">
              <IpLocationsCard
                isLoading={locationsLoading}
                data={ipLocationData}
                totalIps={totalIps}
                selectedCountry={selectedCountry}
                onCountrySelect={setSelectedCountry}
              />
            </div>
          </div>
          {/* Stacked above the main column, the two cards share a row */}
          <div className="col-span-1 order-1 @6xl/dashboard:order-0 flex flex-col @2xl/dashboard:flex-row @6xl/dashboard:flex-col gap-4">
            <div className="flex-1 min-w-0">
              <VulnerabilityStatistic />
            </div>
            <div className="flex-1 min-w-0">
              <TlsStatistics />
            </div>
          </div>
        </div>
        <VulnerabilityLifecycle />
        <div className="grid grid-cols-1 @6xl/dashboard:grid-cols-6 gap-4">
          <div className="@6xl/dashboard:col-span-2">
            <NeedsAttention />
          </div>
          <div className="@6xl/dashboard:col-span-4">
            <VulnerabilityActivity />
          </div>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-1 @6xl/dashboard:grid-cols-6 gap-4">
            <div className="@6xl/dashboard:col-span-4">
              <AssetTrends />
            </div>
            <div className="@6xl/dashboard:col-span-2">
              <RecentAssets />
            </div>
          </div>
          <div className="grid grid-cols-1 @5xl/dashboard:grid-cols-2 gap-4">
            <TopPorts />
            <TopTechnologies />
          </div>
          <div className="grid grid-cols-1 @6xl/dashboard:grid-cols-6 gap-4">
            <div className="@6xl/dashboard:col-span-4">
              <IssuesTimeline />
            </div>
            <div className="@6xl/dashboard:col-span-2">
              <TopAssetsVulnerabilitiesChart />
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}
