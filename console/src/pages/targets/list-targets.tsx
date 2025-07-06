"use client"

import { type ColumnDef } from "@tanstack/react-table"
import { BadgeCheckIcon, Loader2Icon, MoreHorizontal } from "lucide-react"

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
import { useTargetsControllerGetTargetsInWorkspace } from "@/services/apis/gen/queries"

import type { Target } from "@/services/apis/gen/queries"

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
            return <div><b>{value}</b> assets</div>
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
                <Badge
                    variant="secondary"
                    className="bg-green-500 text-white dark:bg-green-500"
                >
                    <BadgeCheckIcon />
                    Done
                </Badge>
            ) : (
                <Badge
                    variant="secondary"
                    className="bg-yellow-500 text-white dark:bg-yellow-600"
                >
                    <Loader2Icon className="animate-spin" />
                    Running
                </Badge>
            )
        },
    },
    {
        id: "actions",
        enableHiding: false,
        cell: ({ row }) => {
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
                        <DropdownMenuItem
                            onClick={() => navigator.clipboard.writeText(target.id)}
                        >
                            Copy ID
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )
        },
    },
]

export function ListTargets() {
    const { selectedWorkspace } = useWorkspaceSelector()
    const { data, isLoading } = useTargetsControllerGetTargetsInWorkspace(
        {
            workspaceId: selectedWorkspace ?? "",
            limit: 10,
            page: 1,
            sortBy: "createdAt",
            sortOrder: "DESC",
        },
        {
            query: {
                refetchInterval: 5000,
            },
        }
    )

    const targets = data?.data ?? []

    if (!data && !isLoading) return <div>Error loading targets.</div>

    return (
        <DataTable
            columns={targetColumns}
            data={targets}
            isLoading={isLoading}
            filterColumnKey="value"
            filterPlaceholder="Filter target"
            showColumnVisibility={true}
            showPagination={true}
            pageSize={10}
            emptyMessage="No targets found."
        />
    )
}