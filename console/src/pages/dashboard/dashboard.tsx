import Page from "@/components/common/page";
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import CreateWorkspace from '../workspaces/create-workspace';
import AssetLocationsMap from './components/asset-locations-map';
import IssuesTimeline from './components/issues-timeline';
import Statistic from "./components/statistic";
import TopTagsAssets from './components/top-tags-assets';
import VulnerabilityStatistic from "./components/vulnerabilities-statistic";

export default function Dashboard() {
    const { workspaces } = useWorkspaceSelector()
    if (workspaces.length === 0) return <CreateWorkspace />;
    return (
        <Page title="Dashboard">
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
                <div className="col-span-1 xl:col-span-3 gap-4 space-y-4">
                    <Statistic />
                    <div className='grid grid-cols-1 min-h-96 xl:grid-cols-2 gap-4'>
                        <div className='col-span-1'>
                            <IssuesTimeline />
                        </div>
                        <div className='col-span-1'>
                            <AssetLocationsMap />
                        </div>
                    </div>
                </div>
                <div className="col-span-1 space-y-4 flex flex-col">
                    <VulnerabilityStatistic />
                    <TopTagsAssets />
                </div>
            </div>
        </Page>
    );
}