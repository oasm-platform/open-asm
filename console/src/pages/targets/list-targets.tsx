"use client"

import {
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
    type ColumnDef,
    type ColumnFiltersState,
    type SortingState,
    type VisibilityState,
} from "@tanstack/react-table"
import { BadgeCheckIcon, ChevronDown, Loader2Icon, MoreHorizontal } from "lucide-react"
import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

import { useWorkspaceSelector } from "@/hooks/useWorkspaceSelector"
import { useTargetsControllerGetTargetsInWorkspace } from "@/services/apis/gen/queries"

import type { Target } from "@/services/apis/gen/queries"

export const columns: ColumnDef<Target, any>[] = [
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
            return value === "DONE" ? <Badge
                variant="secondary"
                className="bg-green-500 text-white dark:bg-green-500"
            >
                <BadgeCheckIcon />
                Done
            </Badge> : <Badge
                variant="secondary"
                className="bg-yellow-500 text-white dark:bg-yellow-600"
            >
                <Loader2Icon className="animate-spin" />
                Running
            </Badge>
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
        }, {
        query: {
            refetchInterval: 5000
        }
    }
    )


    const targets = data?.data ?? []

    const [sorting, setSorting] = React.useState<SortingState>([])
    const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
    const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
    const [rowSelection, setRowSelection] = React.useState({})

    const table = useReactTable({
        data: targets,
        columns,
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        onColumnVisibilityChange: setColumnVisibility,
        onRowSelectionChange: setRowSelection,
        state: {
            sorting,
            columnFilters,
            columnVisibility,
            rowSelection,
        },
    })

    if (isLoading) return <div>Loading...</div>
    if (!data) return <div>Error loading targets.</div>

    return (
        <div className="w-full">
            <div className="flex items-center py-4">
                <Input
                    placeholder="Filter value..."
                    value={(table.getColumn("value")?.getFilterValue() as string) ?? ""}
                    onChange={(event) =>
                        table.getColumn("value")?.setFilterValue(event.target.value)
                    }
                    className="max-w-sm"
                />
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="ml-auto">
                            Columns <ChevronDown />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        {table
                            .getAllColumns()
                            .filter((column) => column.getCanHide())
                            .map((column) => (
                                <DropdownMenuCheckboxItem
                                    key={column.id}
                                    className="capitalize"
                                    checked={column.getIsVisible()}
                                    onCheckedChange={(value) =>
                                        column.toggleVisibility(!!value)
                                    }
                                >
                                    {column.id}
                                </DropdownMenuCheckboxItem>
                            ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                    <TableHead key={header.id}>
                                        {header.isPlaceholder
                                            ? null
                                            : flexRender(
                                                header.column.columnDef.header,
                                                header.getContext()
                                            )}
                                    </TableHead>
                                ))}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow
                                    key={row.id}
                                    data-state={row.getIsSelected() && "selected"}
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id}>
                                            {flexRender(
                                                cell.column.columnDef.cell,
                                                cell.getContext()
                                            )}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell
                                    colSpan={columns.length}
                                    className="h-24 text-center"
                                >
                                    No results.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
            <div className="flex items-center justify-end space-x-2 py-4">

                <div className="space-x-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                    >
                        Previous
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                    >
                        Next
                    </Button>
                </div>
            </div>
        </div>
    )
}
