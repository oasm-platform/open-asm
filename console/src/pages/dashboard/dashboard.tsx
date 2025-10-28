import Page from "@/components/common/page";
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import CreateWorkspace from '../workspaces/create-workspace';
import AssetLocationsMap from './components/asset-locations-map';
import IssuesTimeline from './components/issues-timeline';
import Statistic from "./components/statistic";
import TlsExpirationTable from './components/tls-expiration-table';
import TopTagsAssets from './components/top-tags-assets';
import VulnerabilityStatistic from "./components/vulnerabilities-statistic";

export default function Dashboard() {
    const { workspaces, isLoading } = useWorkspaceSelector()
    if (isLoading) return null;
    return (
        <Page title="Dashboard">
            {workspaces.length === 0 ? <CreateWorkspace /> :
                <div className="grid grid-cols-1 2xl:grid-cols-4 gap-4">
                    <div className="col-span-1 2xl:col-span-3 gap-4 space-y-4 2xl:order-1">
                        <Statistic />
                        <div className='grid grid-cols-1 min-h-96 2xl:grid-cols-2 gap-4'>
                            <div className='col-span-1'>
                                <IssuesTimeline />
                            </div>
                            <div className='col-span-1'>
                                <AssetLocationsMap />
                            </div>
                            <TlsExpirationTable />
                        </div>
                    </div>
                    <div className="col-span-1 space-y-4 flex flex-col order-first 2xl:order-2">
                        <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-1 gap-4">
                            <VulnerabilityStatistic />
                            <TopTagsAssets />
                        </div>

                    </div>
                </div>
            }
        </Page>
    );
}
