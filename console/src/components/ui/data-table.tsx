import {
    flexRender,
    getCoreRowModel,
    useReactTable,
    type ColumnDef,
    type VisibilityState,
} from "@tanstack/react-table"
import { ArrowDownNarrowWide, ArrowUpNarrowWide, ChevronDown } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "./pagination"

// Define props interface
interface DataTableProps<TData, TValue> {
    columns: ColumnDef<TData, TValue>[]
    data: TData[]
    isLoading?: boolean
    filterColumnKey?: string
    filterValue?: string
    onFilterChange?: (value: string) => void
    filterPlaceholder?: string
    showColumnVisibility?: boolean
    showPagination?: boolean
    page: number
    pageSize: number
    totalItems?: number
    onPageChange?: (page: number) => void
    onPageSizeChange?: (size: number) => void
    sortBy?: string
    sortOrder?: "ASC" | "DESC"
    onSortChange?: (sortBy: string, sortOrder: "ASC" | "DESC") => void
    emptyMessage?: string
}

export function DataTable<TData, TValue>({
    columns,
    data,
    isLoading = false,
    filterColumnKey,
    filterValue = "",
    onFilterChange,
    filterPlaceholder = "Filter...",
    showColumnVisibility = true,
    showPagination = true,
    page,
    pageSize,
    totalItems = 0,
    onPageChange,
    onPageSizeChange,
    sortBy,
    sortOrder,
    onSortChange,
    emptyMessage = "No data",
}: DataTableProps<TData, TValue>) {
    const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})

    // Initialize table with react-table
    const table = useReactTable({
        data,
        columns,
        state: {
            columnVisibility,
            pagination: { pageIndex: page - 1, pageSize }, // 0-based index for react-table
            sorting: sortBy ? [{ id: sortBy, desc: sortOrder === "DESC" }] : [],
        },
        pageCount: Math.ceil(totalItems / pageSize),
        manualPagination: true,
        manualSorting: true,
        onColumnVisibilityChange: setColumnVisibility,
        getCoreRowModel: getCoreRowModel(),
    })

    // Handle column sorting
    const handleSort = (columnId: string) => {
        if (!onSortChange) return
        const newSortOrder = sortBy === columnId && sortOrder === "ASC" ? "DESC" : "ASC"
        onSortChange(columnId, newSortOrder)
    }

    // Generate pagination page numbers with ellipsis
    const getPaginationPages = () => {
        const pageCount = Math.ceil(totalItems / pageSize)
        const pages = Array.from({ length: pageCount }, (_, i) => i + 1).filter(
            (p) => p === 1 || p === pageCount || Math.abs(p - page) <= 2
        )

        const mergedPages: (number | "...")[] = []
        pages.forEach((curr, i) => {
            if (i === 0 || curr - pages[i - 1] === 1) {
                mergedPages.push(curr)
            } else {
                mergedPages.push("...", curr)
            }
        })

        return mergedPages
    }

    return (
        <div className="w-full space-y-4">
            {/* Filter and column visibility controls */}
            {(filterColumnKey || showColumnVisibility) && (
                <div className="flex items-center gap-4 py-4">
                    {filterColumnKey && (
                        <Input
                            placeholder={filterPlaceholder}
                            value={filterValue}
                            onChange={(e) => onFilterChange?.(e.target.value)}
                            className="max-w-sm"
                        />
                    )}
                    {showColumnVisibility && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="ml-auto">
                                    Columns <ChevronDown className="ml-2 h-4 w-4" />
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
                                            onCheckedChange={(value) => column.toggleVisibility(!!value)}
                                        >
                                            {column.id}
                                        </DropdownMenuCheckboxItem>
                                    ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            )}

            {/* Table */}
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                    <TableHead
                                        key={header.id}
                                        onClick={() => header.column.getCanSort() && handleSort(header.column.id)}
                                        className={`whitespace-nowrap ${header.column.getCanSort() ? "cursor-pointer" : ""}`}
                                    >
                                        <div className="flex items-center gap-2">
                                            {flexRender(header.column.columnDef.header, header.getContext())}
                                            {sortBy === header.column.id &&
                                                (sortOrder === "ASC" ? (
                                                    <ArrowUpNarrowWide size={16} />
                                                ) : (
                                                    <ArrowDownNarrowWide size={16} />
                                                ))}
                                        </div>
                                    </TableHead>
                                ))}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow key={row.id}>
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id}>
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="h-24 text-center">
                                    {emptyMessage}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination */}
            {showPagination && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between py-4">
                    {/* Page size selector */}
                    <div className="flex items-center gap-2">
                        <Select value={pageSize.toString()} onValueChange={(value) => onPageSizeChange?.(parseInt(value))}>
                            <SelectTrigger className="w-[70px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {[10, 20, 50, 100].map((size) => (
                                    <SelectItem key={size} value={size.toString()}>
                                        {size}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Pagination controls */}
                    <Pagination>
                        <PaginationContent>
                            <PaginationItem>
                                <PaginationPrevious
                                    href="#"
                                    onClick={(e) => {
                                        e.preventDefault()
                                        onPageChange?.(page - 1)
                                    }}
                                    className={page <= 1 ? "pointer-events-none opacity-50" : ""}
                                />
                            </PaginationItem>

                            {getPaginationPages().map((p, idx) =>
                                p === "..." ? (
                                    <PaginationItem key={`ellipsis-${idx}`}>
                                        <PaginationEllipsis />
                                    </PaginationItem>
                                ) : (
                                    <PaginationItem key={p}>
                                        <PaginationLink
                                            href="#"
                                            isActive={p === page}
                                            onClick={(e) => {
                                                e.preventDefault()
                                                onPageChange?.(p as number)
                                            }}
                                        >
                                            {p}
                                        </PaginationLink>
                                    </PaginationItem>
                                )
                            )}

                            <PaginationItem>
                                <PaginationNext
                                    href="#"
                                    onClick={(e) => {
                                        e.preventDefault()
                                        onPageChange?.(page + 1)
                                    }}
                                    className={page >= Math.ceil(totalItems / pageSize) ? "pointer-events-none opacity-50" : ""}
                                />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                </div>
            )}
        </div>
    )
}