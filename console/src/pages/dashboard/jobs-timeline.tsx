import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useJobsRegistryControllerGetJobsTimeline } from "@/services/apis/gen/queries";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

// Define type for timeline item with jobHistoryId
interface TimelineItemWithJobHistory {
    name: string;
    target: string;
    targetId: string;
    startTime: string;
    endTime: string;
    status: string;
    description?: string;
    toolCategory?: string;
    duration?: number;
    jobHistoryId: string;
}

dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.extend(timezone);

const JobsTimeline = () => {
    const navigate = useNavigate();
    const { data, isLoading } = useJobsRegistryControllerGetJobsTimeline({
        query: { refetchInterval: 5000 }
    });

    // Group by jobHistoryId first, then by target
    const groupedByJobHistory = data?.data.reduce((acc, item) => {
        const jobHistoryId = item.jobHistoryId || 'unknown';
        if (!acc[jobHistoryId]) {
            acc[jobHistoryId] = {};
        }
        if (!acc[jobHistoryId][item.target]) {
            acc[jobHistoryId][item.target] = [];
        }
        acc[jobHistoryId][item.target].push(item);
        return acc;
    }, {} as Record<string, Record<string, TimelineItemWithJobHistory[]>>) || {};

    const getStatusIcon = (status: string) => {
        switch (status) {
            case "completed":
                return <CheckCircle2 className="h-5 w-5 text-green-500" />;
            case "in_progress":
                return <Clock className="h-5 w-5 text-yellow-500" />;
            case "failed":
                return <XCircle className="h-5 w-5 text-red-500" />;
            default:
                return <Clock className="h-5 w-5 text-gray-400" />;
        }
    };

    const getTimeDisplay = (item: { status: string; startTime: string; endTime: string }) => {
        if (item.status === 'pending' || item.status === 'in_progress') {
            return dayjs(item.startTime).utc().fromNow();
        }
        return dayjs(item.endTime).utc().fromNow();
    };


    return (
        <Card className="h-full flex flex-col">
            <CardHeader className="border-b pb-3">
                <CardTitle>Jobs Timeline</CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-grow">
                <ScrollArea className="h-full">
                    <div className="p-2">
                        {isLoading && (
                            <div className="flex items-center justify-center py-4">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                            </div>
                        )}
                        {Object.entries(groupedByJobHistory).map(([jobHistoryId, targets]) => (
                            <div key={jobHistoryId} className="mb-4 p-2 border-b">
                                {/* <div className="font-medium text-lg mb-3">Job History: {jobHistoryId}</div> */}
                                {Object.entries(targets).map(([target, items]) => (
                                    <div key={`${jobHistoryId}-${target}`} className="mb-2 ml-2">
                                        <div
                                            className="font-medium text-md mb-1 hover:text-primary hover:cursor-pointer"
                                            onClick={() => navigate(`/targets/${items[0]?.targetId}`)}
                                        >
                                            {target}
                                        </div>
                                        {/* Timeline container */}
                                        <div className="relative pl-2">
                                            {/* Extended timeline connecting bar centered with dots */}
                                            <div className="absolute left-2 top-4 -translate-x-1/2 w-[2px] bg-primary" style={{ height: `calc(100% - 1rem)` }}></div>
                                            {items.map((item, index) => (
                                                <div key={`${item.name}-${index}`} className="relative py-2">
                                                    {/* Timeline dot positioned at the top left */}
                                                    <div className="absolute left-0 top-4 -translate-x-1/2 -translate-y-1/2 z-0">
                                                        <div className="w-5 h-5 rounded-full bg-white border-2 border-primary-foreground flex items-center justify-center">
                                                            {getStatusIcon(item.status)}
                                                        </div>
                                                    </div>

                                                    {/* Time label adjacent to status icon at the top */}
                                                    <div className="absolute left-5 top-4 -translate-y-1/2 text-xs text-muted-foreground whitespace-nowrap">
                                                        {getTimeDisplay(item)}
                                                    </div>

                                                    {/* Tool name frame with border below time label */}
                                                    <div className="ml-5 w-[calc(100%-2rem)] mt-5 bg-card p-1">
                                                        <div className="font-medium">{item.name}</div>
                                                        {item.duration && (
                                                            <div className="text-xs text-muted-foreground mt-1">
                                                                {item.duration} seconds
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ))}

                        {data?.data.length === 0 && !isLoading && (
                            <div className="text-center py-4 text-muted-foreground">
                                No jobs found
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
};

export default JobsTimeline;