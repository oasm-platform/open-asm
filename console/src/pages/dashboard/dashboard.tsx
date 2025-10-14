import Page from "@/components/common/page";
import Statistic from "./components/statistic";
import TopTagsAssets from './components/top-tags-assets';
import VulnerabilitySeverityDonutChart from "./components/vulnerabilities-statistic";

export default function Dashboard() {
    return (
        <Page title="Dashboard">
            <div className="flex flex-col w-full gap-4 flex-col lg:flex-row h-full">
                <div className="w-full lg:w-3/4 flex flex-col gap-4">
                    <Statistic />
                </div>
                <div className="w-full lg:w-1/4 gap-3 flex flex-col h-full">
                    <VulnerabilitySeverityDonutChart />
                    <TopTagsAssets />
                </div>
            </div>
        </Page>
    );
}