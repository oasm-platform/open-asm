import { BadgeCheckIcon, Loader2Icon } from "lucide-react";
import { Badge } from "./badge";

interface TargetStatusProps {
    status: string
}
const TargetStatus = ({ status }: TargetStatusProps) => {
    return status === "DONE" ? (
        <Badge variant="secondary" className="bg-green-500 text-white">
            <BadgeCheckIcon className="mr-1 h-4 w-4" />
            Done
        </Badge>
    ) : (
        <Badge variant="secondary" className="bg-purple-500 text-white">
            <Loader2Icon className="animate-spin mr-1 h-4 w-4" />
            Running
        </Badge>
    )
};

export default TargetStatus;