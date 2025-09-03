import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useJobsRegistryControllerGetJobsTimeline } from "@/services/apis/gen/queries";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.extend(timezone);

const JobsTimeline = () => {
    // Sử dụng API endpoint mới cho timeline
    const { data, isLoading } = useJobsRegistryControllerGetJobsTimeline({
        query: { refetchInterval: 5000 }
    });

    // Nhóm các job theo target để hiển thị liên kết
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

    const formatTime = (time: string) => {
        return dayjs(time).utc().format('YYYY-MM-DD HH:mm:ss');
    };

    return (
        <Card className="border rounded-lg">
            <CardHeader className="border-b pb-3">
                <CardTitle>Jobs Timeline</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                <ScrollArea className="h-[800px]">
                    <div className="p-4">
                        {isLoading && (
                            <div className="flex items-center justify-center py-8">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                            </div>
                        )}

                        {Object.entries(groupedByTarget).map(([target, items]) => (
                            <div key={target} className="mb-8 last:mb-0">
                                <div className="font-medium text-lg mb-2">Target: {target}</div>
                                
                                {/* Timeline container */}
                                <div className="relative pl-4">
                                    {items.map((item, index) => (
                                        <div key={`${item.name}-${index}`} className="relative mb-12 last:mb-0">
                                            {/* Timeline dot positioned at the center left of the card */}
                                            <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                                                <div className="w-4 h-4 rounded-full bg-white border-2 border-gray-300 flex items-center justify-center">
                                                    <div className="w-2 h-2 rounded-full bg-gray-300"></div>
                                                </div>
                                            </div>
                                            
                                            {/* Vertical line connecting to the next dot (if not the last item) */}
                                            {index < items.length - 1 && (
                                                <div className="absolute left-0 -translate-x-1/2 w-px bg-gray-300" style={{
                                                    top: 'calc(70% + 4px)', // Start 4px below the center of current dot
                                                    height: 'calc(100% + 4px)', // Extend to 4px above the next dot
                                                }}></div>
                                            )}
                                            
                                            {/* Card with content */}
                                            <div className="bg-card border rounded-lg p-4 ml-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center">
                                                        {getStatusIcon(item.status)}
                                                        <span className="font-medium ml-2">{item.name}</span>
                                                    </div>
                                                    <Badge className={
                                                        item.status === 'completed' ? 'bg-green-500 text-white border-0' : 
                                                        item.status === 'in_progress' ? 'bg-yellow-500 text-black border-0' :
                                                        item.status === 'failed' ? 'bg-red-500 text-white border-0' :
                                                        'bg-gray-400 text-white border-0'
                                                    }>
                                                        {item.status === 'in_progress' ? 'in progress' : item.status}
                                                    </Badge>
                                                </div>
                                                
                                                <div className="text-xs text-muted-foreground mt-2 flex justify-between">
                                                    <div>
                                                        <span className="font-medium">Start:</span> {formatTime(item.startTime)}
                                                    </div>
                                                    {item.status !== 'pending' && (
                                                        <div>
                                                            <span className="font-medium">
                                                                {item.status === 'in_progress' ? 'Updated:' : 'End:'}
                                                            </span> {formatTime(item.endTime)}
                                                        </div>
                                                    )}
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