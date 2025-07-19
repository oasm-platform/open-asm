import { Badge } from "@/components/ui/badge"
import { DataTable } from "@/components/ui/data-table"
import StatusCode from "@/components/ui/status-code"
import { useServerDataTable } from "@/hooks/useServerDataTable"
import { useWorkspaceSelector } from "@/hooks/useWorkspaceSelector"
import { cn } from "@/lib/utils"
import { useAssetsControllerGetAssets } from "@/services/apis/gen/queries"
import { type ColumnDef } from "@tanstack/react-table"
import dayjs from "dayjs"
import { ArrowRight, BriefcaseBusiness, EthernetPort, Globe, Lock, Network } from "lucide-react"

export const assetColumns: ColumnDef<any, any>[] = [
    {
        accessorKey: "value",
        header: "Value",
        cell: ({ row }) => {
            const data = row.original
            const ports = data.metadata?.ports
            const httpx = data.metadata?.httpx
            const ipAddresses = data.dnsRecords?.["A"]
            const statusCode = httpx?.status_code
            return <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                    {httpx?.failed ? (
                        <span className="text-gray-500 font-bold line-through">{data.value}</span>
                    ) : (
                        <a target="_blank" href={httpx?.url}>
                            <span className="font-bold">{data.value}</span>
                        </a>
                    )}
                    {httpx?.chain_status_codes
                        ?
                        <div className="flex items-center gap-1">
                            <StatusCode code={httpx?.chain_status_codes[0].toString()} />
                            <ArrowRight size={15} />
                            <StatusCode code={httpx?.chain_status_codes[httpx.chain_status_codes.length - 1].toString()} />
                        </div>
                        :
                        <StatusCode code={statusCode} />
                    }
                </div>
                {httpx?.title && <p>{httpx?.title}</p>}
                {httpx?.error && <p className="text-red-500">{httpx?.error}</p>}
                <div className="flex gap-0.5">
                    {ipAddresses?.map((ipAddress: string) => <Badge variant="outline" className="mr-1 h-7" key={ipAddress}><Network />{ipAddress}</Badge>)}
                </div>
                <div className="flex gap-0.5">
                    {ports?.sort((a: number, b: number) => a - b)?.map((port: number) => <Badge variant="outline" className="mr-1 h-7" key={port}><EthernetPort />{port}</Badge>)}
                </div>

            </div>
        },
    },
    {
        header: "Technologies",
        size: 25,
        minSize: 10,
        maxSize: 30,
        cell: ({ row }) => {
            const data = row.original
            const technologies: string[] = data.metadata?.httpx?.tech ?? []
            const maxTechDisplay = 10
            const displayedTechs = technologies.slice(0, maxTechDisplay)
            const remainingCount = technologies.length - maxTechDisplay

            return (
                <div className="flex flex-wrap gap-2 max-w-xs overflow-x-auto">
                    {displayedTechs.map((tech) => (
                        <Badge
                            className="h-7"
                            variant="outline"
                            key={tech}

                        >
                            {tech}
                        </Badge>
                    ))}
                    {remainingCount > 0 && (
                        <Badge variant="outline">
                            +{remainingCount}
                        </Badge>
                    )}
                </div>
            )
        }

    },
    {
        header: "Certificate",
        size: 25,
        minSize: 10,
        maxSize: 30,
        cell: ({ row }) => {
            const data = row.original
            const tls = data.metadata?.httpx?.tls
            if (!tls) return null
            const daysLeft = Math.round(Math.abs((new Date(tls.not_before).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))
            const color = daysLeft < 30 ? "red" : daysLeft < 60 ? "yellow" : "green"
            return (
                <div className="flex flex-col flex-wrap gap-2 max-w-xs overflow-x-auto">
                    <Badge variant="outline" className={cn("h-7", color === "red" ? "text-red-500" : color === "yellow" ? "text-yellow-500" : "text-green-500")}>
                        <Lock size={20} color={color} /> SSL {daysLeft} days left
                    </Badge>
                    {tls?.issuer_org.map((issuer: string) => (
                        <Badge
                            variant="outline"
                            key={issuer}
                            className="h-7"
                        >
                            <Globe size={20} />  {issuer}
                        </Badge>
                    ))}
                    {tls?.subject_org?.map((subject: string) => (
                        <Badge
                            variant="outline"
                            key={subject}
                            className="h-7"
                        >
                            <BriefcaseBusiness size={20} />  {subject}
                        </Badge>
                    ))}
                </div>
            )
        }

    },
    {
        header: "Time",
        size: 25,
        minSize: 10,
        maxSize: 30,
        cell: ({ row }) => {
            const data = row.original
            const createdAt = data.createdAt
            if (!createdAt) return null
            return (
                <div className="flex flex-col flex-wrap gap-2 max-w-xs overflow-x-auto">
                    <div className="flex items-center gap-1">
                        <span className="text-xs">
                            {dayjs(createdAt).fromNow()}
                        </span>
                    </div>

                </div>
            )
        }
    }
]

export function ListAssets() {
    const { selectedWorkspace } = useWorkspaceSelector()

    const {
        tableParams: { page, pageSize, sortBy, sortOrder, filter },
        tableHandlers: {
            setPage,
            setPageSize,
            setSortBy,
            setSortOrder,
            setFilter,
        },
    } = useServerDataTable()

    const { data, isLoading } = useAssetsControllerGetAssets(
        {
            workspaceId: selectedWorkspace ?? "",
            limit: pageSize,
            page,
            sortBy,
            sortOrder,
        },
        {
            query: {
                refetchInterval: 5000,
            },
        },
    )

    const targets = data?.data ?? []
    const total = data?.total ?? 0

    if (!data && !isLoading) return <div>Error loading targets.</div>

    return (
        <DataTable
            data={targets}
            columns={assetColumns}
            isLoading={isLoading}
            page={page}
            pageSize={pageSize}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            onSortChange={(col, order) => {
                setSortBy(col)
                setSortOrder(order)
            }}
            filterColumnKey="value"
            filterValue={filter}
            onFilterChange={setFilter}
            totalItems={total}
        />
    )
}
