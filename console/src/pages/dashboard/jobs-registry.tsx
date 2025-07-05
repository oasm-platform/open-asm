import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useJobsRegistryControllerGetManyJobs } from "@/services/apis/gen/queries";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

const JobsRegistry = () => {
    const { data } = useJobsRegistryControllerGetManyJobs(
        { limit: 100, page: 1, sortBy: "updatedAt", sortOrder: "DESC" },
        { query: { refetchInterval: 1000 } }
    );

    const getStatusColor = (status: string) => {
        switch (status) {
            case "in_progress":
                return "bg-yellow-400 text-black";
            case "completed":
                return "bg-green-500 text-white";
            case "failed":
                return "bg-red-500 text-white";
            default:
                return "bg-gray-300 text-black";
        }
    };

    return (
        <div className="col-span-4 lg:col-span-1">
            <Card className="h-full">
                <CardHeader>
                    <CardTitle>Jobs Registry</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <ScrollArea className="h-[500px] p-4 space-y-4">
                        {data?.data.map((job) => {
                            return (
                                <div
                                    key={job.id}
                                    className="border mb-1 rounded-xl p-3 shadow-sm bg-muted/50"
                                >
                                    <div className="flex justify-between items-center">
                                        <span className="font-medium">{job.workerName}</span>
                                        <Badge className={getStatusColor(job.status)}>
                                            {job.status.replace(/_/g, " ")}
                                        </Badge>
                                    </div>
                                    <div className="text-sm mt-1 text-muted-foreground">
                                        {dayjs(job.createdAt).fromNow()}
                                    </div>
                                </div>
                            );
                        })}
                        {data?.data.length === 0 && (
                            <p className="text-sm text-muted-foreground text-center">No jobs found.</p>
                        )}
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>
    );
};

export default JobsRegistry;
