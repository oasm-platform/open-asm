import { BadgeCheckIcon, ClockIcon, Loader2Icon } from "lucide-react";
import { Badge } from "./badge";

interface TargetStatusProps {
    status: string;
}

const TargetStatus = ({ status }: TargetStatusProps) => {
    switch (status) {
        case "pending":
            return (
                <Badge variant="secondary" className="bg-yellow-500 text-white">
                    <ClockIcon className="mr-1 h-4 w-4" />
                    Pending
                </Badge>
            );
        case "in_progress":
            return (
                <Badge variant="secondary" className="bg-purple-500 text-white">
                    <Loader2Icon className="animate-spin mr-1 h-4 w-4" />
                    In Progress
                </Badge>
            );
        case "completed":
            return (
                <Badge variant="secondary" className="bg-green-500 text-white">
                    <BadgeCheckIcon className="mr-1 h-4 w-4" />
                    Completed
                </Badge>
            );
        default:
            return (
                <Badge variant="secondary" className="bg-gray-500 text-white">
                    Unknown
                </Badge>
            );
    }
};

export default TargetStatus;
