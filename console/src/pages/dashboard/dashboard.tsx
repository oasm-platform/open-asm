import Page from "@/components/common/page";
import JobsTimeline from "./jobs-timeline";
import Statistic from "./statistic";
import VulnerabilitySeverityDonutChart from "./vulnerability-severity-donut-chart";

export default function Dashboard() {
    return (
        <Page title="Dashboard">
            <div className="flex w-full gap-4 flex-col lg:flex-row h-full">
                <div className="w-full lg:w-3/4 flex flex-col gap-4">
                    <Statistic />
                    <div className="w-full lg:w-1/4">

                    </div>
                </div>
                <div className="w-full lg:w-1/4 gap-3 flex flex-col h-full">
                    <VulnerabilitySeverityDonutChart />
                    <JobsTimeline />
                </div>
            </div>

        </Page>
    );
}