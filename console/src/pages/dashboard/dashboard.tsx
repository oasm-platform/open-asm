import Page from "@/components/common/page";
import JobsTimeline from "./jobs-timeline";
import Statistic from "./statistic";

export default function Dashboard() {
    return (
        <Page title="Dashboard">
            <div className="space-y-4">
                <Statistic />
                <JobsTimeline />
            </div>
        </Page>
    );
}