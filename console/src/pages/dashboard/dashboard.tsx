import Page from "@/components/common/page";
import JobsRegistry from "./jobs-registry";
import Statistic from "./statistic";

export default function Dashboard() {
    return <Page title="Dashboard">
        <div className="grid grid-cols-4 gap-6">
            <Statistic />
            <JobsRegistry />
        </div>
    </Page>
}