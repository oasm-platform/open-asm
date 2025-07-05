import Statistic from "./Statistic";
import JobsRegistry from "./jobs-registry";

export default function Dashboard() {
    return <div className="p-6 grid grid-cols-4 gap-6">
        <Statistic />
        <JobsRegistry />
    </div>
}
