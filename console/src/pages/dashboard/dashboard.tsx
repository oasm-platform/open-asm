import Page from "@/components/common/page";
import JobsTimeline from "./jobs-timeline";
import Statistic from "./statistic";
import VulnerabilitySeverityDonutChart from "./vulnerability-severity-donut-chart";

export default function Dashboard() {
    return (
        <Page title="Dashboard">
            <div className="flex w-full gap-4 lg:flex-row flex-col">
                <div className="flex flex-col w-full lg:w-4/5 gap-4">
                    <Statistic />
                    <VulnerabilitySeverityDonutChart />
                </div>
                <div className="w-full lg:w-1/5">
                    <JobsTimeline />
                </div>
            </div>

        </Page>
    );
}