import { type ColumnDef } from "@tanstack/react-table"
import { BadgeCheckIcon, Loader2Icon, MoreHorizontal, Trash2Icon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { DataTable } from "@/components/ui/data-table"
import { useWorkspaceSelector } from "@/hooks/useWorkspaceSelector"
import { useTargetsControllerDeleteTargetFromWorkspace, useTargetsControllerGetTargetsInWorkspace } from "@/services/apis/gen/queries"

import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useServerDataTable } from "@/hooks/useServerDataTable"
import type { Target } from "@/services/apis/gen/queries"
import { useQueryClient } from "@tanstack/react-query"

export const targetColumns: ColumnDef<Target, any>[] = [
    {
        accessorKey: "value",
        header: "Value",
        cell: ({ row }) => <div>{row.getValue("value")}</div>,
    },
    {
        accessorKey: "totalAssets",
        header: "Total assets",
        cell: ({ row }) => {
            const value: string = row.getValue("totalAssets")
            return (
                <div>
                    <b>{value}</b> assets
                </div>
            )
        },
    },
    {
        accessorKey: "lastDiscoveredAt",
        header: "Last Discovered At",
        cell: ({ row }) => {
            const value: string = row.getValue("lastDiscoveredAt")
            return <div>{new Date(value).toLocaleString()}</div>
        },
    },
    {
        accessorKey: "status",
        header: "Scan status",
        cell: ({ row }) => {
            const value: string = row.getValue("status")
            return value === "DONE" ? (
                <Badge variant="secondary" className="bg-green-500 text-white">
                    <BadgeCheckIcon className="mr-1 h-4 w-4" />
                    Done
                </Badge>
            ) : (
                <Badge variant="secondary" className="bg-yellow-500 text-white">
                    <Loader2Icon className="animate-spin mr-1 h-4 w-4" />
                    Running
                </Badge>
            )
        },
    },
    {
        id: "actions",
        enableHiding: false,
        cell: ({ row }) => {
            const { selectedWorkspace } = useWorkspaceSelector()
            const { mutate: deleteTarget } = useTargetsControllerDeleteTargetFromWorkspace({
                mutation: {
                    onSuccess: () => {
                        useQueryClient().invalidateQueries({
                            queryKey: ["targets", selectedWorkspace],
                        })
                    },
                },
            })
            const target = row.original
            return (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <ConfirmDialog
                            title="Delete target"
                            description="Are you sure you want to delete this target?"
                            onConfirm={() => {
                                deleteTarget({
                                    id: target.id,
                                    workspaceId: selectedWorkspace ?? "",
                                })
                            }}
                            trigger={
                                <DropdownMenuItem
                                    className="cursor-pointer"
                                >
                                    <Trash2Icon className="mr-1 h-4 w-4" />  Delete
                                </DropdownMenuItem>
                            }
                        />
                    </DropdownMenuContent>
                </DropdownMenu>
            )
        },
    },
]

export function ListTargets() {
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

    const { data, isLoading } = useTargetsControllerGetTargetsInWorkspace(
        {
            workspaceId: selectedWorkspace ?? "",
            limit: pageSize,
            page,
            sortBy,
            sortOrder,
            value: filter,
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
            columns={targetColumns}
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
