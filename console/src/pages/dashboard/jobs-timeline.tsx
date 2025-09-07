import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useJobsRegistryControllerGetJobsTimeline } from "@/services/apis/gen/queries";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.extend(timezone);

const JobsTimeline = () => {
    const { data, isLoading } = useJobsRegistryControllerGetJobsTimeline({
        query: { refetchInterval: 5000 }
    });

    const groupedByTarget = data?.data.reduce((acc, item) => {
        if (!acc[item.target]) {
            acc[item.target] = [];
        }
        acc[item.target].push(item);
        return acc;
    }, {} as Record<string, typeof data.data>) || {};

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
        <Card className="border rounded-lg h-full flex flex-col">
            <CardHeader className="border-b pb-3">
                <CardTitle>Jobs Timeline</CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-grow">
                <ScrollArea className="h-full">
                    <div className="p-4">
                        {isLoading && (
                            <div className="flex items-center justify-center py-8">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                            </div>
                        )}
                        {Object.entries(groupedByTarget).map(([target, items]) => (
                            <div key={target} className="mb-4">
                                <div className="font-medium text-lg mb-2 text-end">{target}</div>
                                {/* Timeline container */}
                                <div className="relative pl-4">
                                    {items.map((item, index) => (
                                        <div key={`${item.name}-${index}`} className="relative">
                                            {/* Timeline dot positioned at the center left of the card */}
                                            <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                                                <div className="w-5 h-5 rounded-full bg-white border-2 border-primary-foreground flex items-center justify-center">
                                                    {getStatusIcon(item.status)}
                                                </div>
                                            </div>

                                            {/* Vertical line connecting to the next dot (if not the last item) */}
                                            {index < items.length - 1 && (
                                                <div className="absolute left-0 top-1/2 -translate-x-1/2 w-[2px] bg-primary h-full"></div>
                                            )}

                                            {/* Card with content */}
                                            <div className="bg-card rounded-lg p-2 ml-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center">

                                                        <span className="font-medium ml-2">{item.name}</span>
                                                    </div>
                                                </div>

                                                <div className="text-xs text-muted-foreground mt-2">
                                                    <div>
                                                        <span className="font-medium">Time:</span> {getTimeDisplay(item)}
                                                    </div>
                                                </div>

                                                {item.duration && (
                                                    <div className="text-xs text-muted-foreground mt-1">
                                                        Duration: {item.duration} seconds
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}

                        {data?.data.length === 0 && !isLoading && (
                            <div className="text-center py-8 text-muted-foreground">
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