import { cn } from '@/lib/utils';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type VisibilityState,
} from '@tanstack/react-table';
import { ArrowDownNarrowWide, ArrowUpNarrowWide } from 'lucide-react';
import * as React from 'react';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import useDebounce from '@/hooks/use-debounce';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from './pagination';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './collapsible';

// Define props interface
interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading?: boolean;
  filterColumnKey?: string;
  filterValue?: string;
  onRowClick?: (row: TData) => void;
  rowClassName?: string;
  onFilterChange?: (value: string) => void;
  filterPlaceholder?: string;
  showColumnVisibility?: boolean;
  showPagination?: boolean;
  page: number;
  pageSize: number;
  totalItems?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  onSortChange?: (sortBy: string, sortOrder: 'ASC' | 'DESC') => void;
  emptyMessage?: string;
  filterComponents?: React.JSX.Element[];
  isShowHeader?: boolean;
  isShowBorder?: boolean;
  collapsibleElement: (row: TData) => React.JSX.Element;
}

export function CollapsibleDataTable<TData, TValue>({
  columns,
  data,
  isLoading = false,
  filterColumnKey,
  filterValue = '',
  onFilterChange,
  onRowClick,
  rowClassName,
  filterPlaceholder = 'Filter...',
  showPagination = true,
  page,
  pageSize,
  totalItems = 0,
  onPageChange,
  onPageSizeChange,
  sortBy,
  sortOrder,
  onSortChange,
  emptyMessage = 'No data',
  filterComponents,
  isShowHeader = true,
  isShowBorder = true,
  collapsibleElement,
}: DataTableProps<TData, TValue>) {
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});

  const [searchValue, setSearchValue] = React.useState(filterValue);
  const debouncedSearchValue = useDebounce(searchValue, 500);

  React.useEffect(() => {
    onFilterChange?.(debouncedSearchValue);
  }, [debouncedSearchValue, onFilterChange]);

  const table = useReactTable({
    data,
    columns,
    state: {
      columnVisibility,
      pagination: { pageIndex: page - 1, pageSize }, // 0-based index for react-table
      sorting: sortBy ? [{ id: sortBy, desc: sortOrder === 'DESC' }] : [],
    },
    pageCount: Math.ceil(totalItems / pageSize),
    manualPagination: true,
    manualFiltering: true,
    manualSorting: true,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
  });

  // Handle column sorting
  const handleSort = (columnId: string) => {
    if (!onSortChange) return;
    const newSortOrder =
      sortBy === columnId && sortOrder === 'ASC' ? 'DESC' : 'ASC';
    onSortChange(columnId, newSortOrder);
  };

  // Generate pagination page numbers with ellipsis
  const getPaginationPages = () => {
    const pageCount = Math.ceil(totalItems / pageSize);
    const pages = Array.from({ length: pageCount }, (_, i) => i + 1).filter(
      (p) => p === 1 || p === pageCount || Math.abs(p - page) <= 2,
    );

    const mergedPages: (number | '...')[] = [];
    pages.forEach((curr, i) => {
      if (i === 0 || curr - pages[i - 1] === 1) {
        mergedPages.push(curr);
      } else {
        mergedPages.push('...', curr);
      }
    });

    return mergedPages;
  };

  const showSkeleton = isLoading && data.length === 0;
  return (
    <div className="w-full">
      {/* Filter and column visibility controls */}
      {filterColumnKey && (
        <div className="flex items-center gap-4 py-1">
          <Input
            placeholder={filterPlaceholder}
            className="max-w-sm"
            value={searchValue}
            onChange={(e) => {
              setSearchValue(e.target.value);
            }}
          />
        </div>
      )}

      {filterComponents}

      {/* Table */}
      <div className={cn('rounded-md', isShowBorder && 'border')}>
        <Table>
          {isShowHeader && (
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      onClick={() =>
                        header.column.getCanSort() &&
                        handleSort(header.column.id)
                      }
                      className={`whitespace-nowrap ${header.column.getCanSort() ? 'cursor-pointer' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {sortBy === header.column.id &&
                          (sortOrder === 'ASC' ? (
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
          )}
          <TableBody>
            {showSkeleton ? (
              [...Array(pageSize)].map((_, rowIndex) => (
                <TableRow key={`skeleton-${rowIndex}`}>
                  {[...Array(table.getAllLeafColumns().length)].map(
                    (_, colIndex) => (
                      <TableCell key={`skeleton-cell-${colIndex}`}>
                        <div className="h-4 w-full bg-muted rounded animate-pulse" />
                      </TableCell>
                    ),
                  )}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <Collapsible asChild key={row.id}>
                  <>
                    <CollapsibleTrigger asChild>
                      <TableRow
                        data-state={row.getIsSelected() && 'selected'}
                        className={cn(
                          rowClassName,
                          'cursor-pointer',
                          onRowClick && 'hover:bg-muted/50',
                        )}
                        onClick={() => onRowClick?.(row.original)}
                      >
                        {/* These cells render normally in their correct columns */}
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    </CollapsibleTrigger>

                    <CollapsibleContent asChild>
                      <TableRow className="bg-background hover:bg-background">
                        <TableCell colSpan={columns.length} className="p-0">
                          {collapsibleElement(row.original)}
                        </TableCell>
                      </TableRow>
                    </CollapsibleContent>
                  </>
                </Collapsible>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {showPagination && (
        <div className="flex flex-row-reverse justify-end items-center bg-background px-2">
          <div className="flex items-center gap-2 my-5">
            <Select
              value={pageSize.toString()}
              onValueChange={(value) => onPageSizeChange?.(parseInt(value))}
            >
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[5, 10, 20, 50, 100].map((size) => (
                  <SelectItem
                    key={size}
                    value={size.toString()}
                    className="justify-center"
                  >
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    onPageChange?.(page - 1);
                  }}
                  className={page <= 1 ? 'pointer-events-none opacity-50' : ''}
                />
              </PaginationItem>

              {getPaginationPages().map((p, idx) =>
                p === '...' ? (
                  <PaginationItem key={`ellipsis-${idx}`}>
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : (
                  <PaginationItem key={p}>
                    <PaginationLink
                      href="#"
                      isActive={p === page}
                      onClick={(e) => {
                        e.preventDefault();
                        onPageChange?.(p as number);
                      }}
                    >
                      {p}
                    </PaginationLink>
                  </PaginationItem>
                ),
              )}

              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    onPageChange?.(page + 1);
                  }}
                  className={
                    page >= Math.ceil(totalItems / pageSize)
                      ? 'pointer-events-none opacity-50'
                      : ''
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}
