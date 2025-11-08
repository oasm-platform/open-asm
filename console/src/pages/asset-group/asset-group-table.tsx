import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import {
  useAssetGroupControllerGetAll,
  type AssetGroupResponseDto,
} from '@/services/apis/gen/queries';
import { type ColumnDef } from '@tanstack/react-table';
import dayjs from 'dayjs';
import { motion } from 'framer-motion';
import { MoreHorizontal } from 'lucide-react';

const columns: ColumnDef<AssetGroupResponseDto>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => <div className="font-medium">{row.original.name}</div>,
  },
  {
    accessorKey: 'createdAt',
    header: 'Created Date',
    cell: ({ row }) => (
      <div>{dayjs(row.original.createdAt).format('YYYY-MM-DD HH:mm')}</div>
    ),
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => {
      const assetGroup = row.original;

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => navigator.clipboard.writeText(assetGroup.id)}
            >
              Copy ID
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

export function AssetGroupTable() {
  const {
    tableParams: { page, pageSize, sortBy, filter, sortOrder },
    tableHandlers: { setFilter, setPage, setPageSize, setSortBy, setSortOrder },
  } = useServerDataTable({
    defaultSortBy: 'name',
  });

  const { data, isLoading } = useAssetGroupControllerGetAll({
    limit: pageSize,
    page,
    sortBy,
    sortOrder,
  });

  const assetGroups = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <DataTable
        data={assetGroups}
        columns={columns}
        isLoading={isLoading}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        onSortChange={(col, order) => {
          setSortBy(col);
          setSortOrder(order);
        }}
        totalItems={total}
        sortBy={sortBy}
        sortOrder={sortOrder}
        filterColumnKey="name"
        onFilterChange={setFilter}
        filterValue={filter}
        isShowBorder={true}
        emptyMessage="No asset groups found"
      />
    </motion.div>
  );
}
