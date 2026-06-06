import Page from '@/components/common/page';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { useStatisticControllerGetAssetLocations } from '@/services/apis/gen/queries';
import { useIpLocationData } from '@/hooks/useIpLocationData';
import CreateWorkspace from '../workspaces/create-workspace';
import IpLocationsCard from './components/ip-locations-card';
import { AssetTrends } from './components/asset-trends';
import IssuesTimeline from './components/issues-timeline';
import Statistic from './components/statistic';
import TlsStatistics from './components/tls-statistics';
import TopAssetsVulnerabilitiesChart from './components/top-assets-vulnerabilities-chart';
import VulnerabilityStatistic from './components/vulnerabilities-statistic';
import { useState } from 'react';

export default function Dashboard() {
  const { workspaces, isLoading: workspacesLoading } = useWorkspaceSelector();
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);

  const { data: locations, isLoading: locationsLoading } =
    useStatisticControllerGetAssetLocations();

  const { data: ipLocationData, totalIps, totalCountries } =
    useIpLocationData({ locations, isLoading: locationsLoading });

  if (workspacesLoading) return <Page title="Dashboard" />;

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
          </div>
          <IpLocationsCard
            data={ipLocationData}
            totalIps={totalIps}
            totalCountries={totalCountries}
            selectedCountry={selectedCountry}
            onCountrySelect={setSelectedCountry}
          />
          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
            <TopAssetsVulnerabilitiesChart />
          </div>
        </div>
        <div className="col-span-1 space-y-4 order-first 2xl:order-2">
          <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-1 gap-4">
            <VulnerabilityStatistic />
            <TlsStatistics />
          </div>
        </div>
      </div>
    </Page>
  );
}
