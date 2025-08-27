import Page from "@/components/common/page";
import JobsRegistry from "./jobs-registry";
import Statistic from "./statistic";
import VulnerabilitySeverityDonutChart from "./vulnerability-severity-donut-chart";

export default function Dashboard() {
  return (
    <Page title="Dashboard" className="flex flex-col gap-4">
      <Statistic />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <VulnerabilitySeverityDonutChart />
      </div>
      <JobsRegistry />
    </Page>
  );
}
