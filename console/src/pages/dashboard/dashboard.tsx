import Page from "@/components/common/page";
import JobsTimeline from "./jobs-timeline";
import Statistic from "./statistic";
import VulnerabilitySeverityDonutChart from "./vulnerability-severity-donut-chart";

export default function Dashboard() {
    return (
        <Page title="Dashboard">
            <div className="flex w-full gap-4 flex-col lg:flex-row">
                <div className="flex flex-col w-full lg:w-3/4 gap-4">
                    <Statistic />
                    <VulnerabilitySeverityDonutChart />
                </div>
                <div className="w-full lg:w-1/4">
                    <JobsTimeline />
                </div>
            </div>

        </Page>
    );
}