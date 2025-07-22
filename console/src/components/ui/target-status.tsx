import { JobStatus } from "@/services/apis/gen/queries";
import { BadgeCheckIcon, ClockIcon, Loader2Icon, XCircleIcon } from "lucide-react";
import { Badge } from "./badge";

interface StatusConfig {
    icon: React.ReactNode;
    className: string;
    label: string;
    variant: "default" | "outline";
}

const statusConfigs: Record<JobStatus, StatusConfig> = {
    [JobStatus.pending]: {
        icon: <ClockIcon className="mr-1 h-4 w-4" />,
        className: "text-yellow-500",
        label: "Pending",
        variant: "outline"
    },
    [JobStatus.in_progress]: {
        icon: <Loader2Icon className="animate-spin mr-1 h-4 w-4" />,
        className: "text-purple-500",
        label: "In Progress",
        variant: "outline"
    },
    [JobStatus.completed]: {
        icon: <BadgeCheckIcon className="mr-1 h-4 w-4" />,
        className: "text-green-500",
        label: "Completed",
        variant: "outline"
    },
    [JobStatus.failed]: {
        icon: <XCircleIcon className="mr-1 h-4 w-4" />,
        className: "text-red-500",
        label: "Failed",
        variant: "outline"
    },
    [JobStatus.cancelled]: {
        icon: <XCircleIcon className="mr-1 h-4 w-4" />,
        className: "text-gray-500",
        label: "Cancelled",
        variant: "outline"
    }
};

const defaultConfig: StatusConfig = {
    icon: null,
    className: "text-gray-500 text-white",
    label: "Unknown",
    variant: "outline"
};

interface TargetStatusProps {
    status: JobStatus;
}

const TargetStatus = ({ status }: TargetStatusProps) => {
    const config = statusConfigs[status] || defaultConfig;

    return (
        <Badge variant={config.variant} className={config.className + " h-8 text-md"}>
            {config.icon}
            {config.label}
        </Badge>
    );
};

export default TargetStatus;
