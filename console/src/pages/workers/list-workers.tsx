import Page from "@/components/common/page"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { ConnectWorker } from "@/components/ui/connect-worker"
import { Skeleton } from "@/components/ui/skeleton"
import { useWorkspaceSelector } from "@/hooks/useWorkspaceSelector"
import { useWorkersControllerGetWorkers } from "@/services/apis/gen/queries"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import { Loader2Icon } from "lucide-react"
dayjs.extend(relativeTime)


const ListWorkers = () => {
    const { selectedWorkspace } = useWorkspaceSelector();
    const { data, isLoading } = useWorkersControllerGetWorkers({
        limit: 100,
        page: 1,
        sortBy: "createdAt",
        sortOrder: "DESC",
        workspaceId: selectedWorkspace as string,

    }, {
        query: {
            refetchInterval: 1000
        }
    })

    // Skeleton loading state
    if (isLoading) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => (
                    <Card key={i}>
                        <CardContent className="p-3 space-y-4">
                            <div className="flex justify-between items-start">
                                <Skeleton className="h-4 w-20" />
                                <Skeleton className="h-6 w-16" />
                            </div>
                            <div className="space-y-2">
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-3/4" />
                                <Skeleton className="h-4 w-2/3" />
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        )
    }

    // Empty state
    if (!data?.data?.length) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <Loader2Icon className="h-6 w-6 text-muted-foreground animate-spin" />
                </div>
                <h3 className="m-4 text-lg font-medium text-muted-foreground">Pending connect workers...</h3>
                <ConnectWorker />
            </div>
        )
    }

    return (
        <Page title="Workers" header={
            <div className="flex items-center justify-end gap-2">
                {data.data.length && <ConnectWorker />}
            </div>
        }>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
                {data.data.map((worker) => (
                    <Card key={worker.id} className='py-2'>
                        <CardContent className="p-3 space-y-3">
                            <div className="flex justify-between items-start">
                                <Badge variant="outline">
                                    Scope
                                </Badge>
                                <Badge
                                    variant="outline"
                                    className={`ml-2`}
                                >
                                    {worker.scope === "cloud" ? "Global" : "This workspace"}
                                </Badge>
                            </div>
                            <div className="flex justify-between items-start">
                                <Badge variant="outline">
                                    {worker.id.slice(0, 8)}
                                </Badge>
                                <Badge
                                    variant={worker.currentJobsCount > 0 ? "default" : "secondary"}
                                    className={`${worker.currentJobsCount > 0 ? 'bg-green-500 hover:bg-green-700 text-white' : ''} ml-2`}
                                >
                                    {worker.currentJobsCount > 0 ? <Loader2Icon className="animate-spin mr-1 h-4 w-4" /> : ""}  {worker.currentJobsCount > 0 ? "Running" : "Idle"}
                                </Badge>
                            </div>

                            <div className="flex items-center justify-between">
                                <Badge variant="outline">Status</Badge>
                                <div className="flex items-center space-x-2">
                                    {new Date().getTime() - new Date(worker.lastSeenAt).getTime() < 30000 ? (
                                        <>
                                            <span className="relative flex h-2 w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                            </span>
                                            <span className="text-sm text-green-600">Online</span>
                                        </>
                                    ) : (
                                        <span className="text-sm text-muted-foreground">
                                            {dayjs(worker.lastSeenAt).fromNow()}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <Badge variant="outline">Created at</Badge>
                                <span className="text-sm text-muted-foreground">
                                    {dayjs(worker.createdAt).fromNow()}
                                </span>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </Page>
    )
}

export default ListWorkers
