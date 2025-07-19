import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useWorkersControllerGetWorkers } from "@/services/apis/gen/queries"
import { formatDistanceToNow } from "date-fns"
import { Copy } from "lucide-react"
import { toast } from "sonner"


const ListWorkers = () => {
    const { data } = useWorkersControllerGetWorkers({
        limit: 100,
        page: 1,
        sortBy: "createdAt",
        sortOrder: "DESC",
    }, {
        query: {
            refetchInterval: 1000
        }
    })
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data?.data?.map((worker) => (
                <Card key={worker.id}>
                    <CardContent className="p-3 space-y-1.5">
                        <div className="text-sm text-muted-foreground">ID</div>
                        <div className="break-words font-mono text-sm">{worker.id}</div>

                        <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Token</span>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 cursor-pointer"
                                onClick={() => {
                                    navigator.clipboard.writeText(worker.token)
                                    toast.success('Token copied to clipboard')
                                }}
                            >
                                <Copy className="h-3.5 w-3.5" />
                                <span className="sr-only">Copy token</span>
                            </Button>
                        </div>

                        <div className="flex items-center justify-between mt-3">
                            <Badge variant="outline">Last seen</Badge>
                            <span className="text-sm text-muted-foreground">
                                {formatDistanceToNow(new Date(worker.lastSeenAt), {
                                    addSuffix: true,
                                })}
                            </span>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}

export default ListWorkers
