import { DataTable } from '@/components/ui/data-table';
import {
  useAssetGroupControllerGetAll,
  type AssetGroupResponseDto,
} from '@/services/apis/gen/queries';
import { type ColumnDef } from '@tanstack/react-table';
import dayjs from 'dayjs';
import { motion } from 'framer-motion';
import { useAsset } from '../context/asset-context';

const columns: ColumnDef<AssetGroupResponseDto>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => <div className="font-medium">{row.original.name}</div>,
  },
  {
    accessorKey: 'createdAt',
    header: 'Created Date',
    enableSorting: false,
    cell: ({ row }) => (
      <div>{dayjs(row.original.createdAt).format('YYYY-MM-DD HH:mm')}</div>
    ),
  },
  // {
  //   id: 'actions',
  //   header: 'Actions',
  //   cell: ({ row }) => {
  //     const assetGroup = row.original;
  //     const {mutate} = useAssetGroupControllerDelete()
  //
  //     return (
  //       <DropdownMenu>
  //         <DropdownMenuTrigger asChild>
  //           <Button variant="ghost" className="h-8 w-8 p-0">
  //             <span className="sr-only">Open menu</span>
  //             <MoreHorizontal className="h-4 w-4" />
  //           </Button>
  //         </DropdownMenuTrigger>
  //         <DropdownMenuContent align="end">
  //           <DropdownMenuLabel>Actions</DropdownMenuLabel>
  //           <DropdownMenuItem
  //             onClick={() => navigator.clipboard.writeText(assetGroup.id)}
  //           >
  //             Delete
  //           </DropdownMenuItem>
  //         </DropdownMenuContent>
  //       </DropdownMenu>
  //     );
  //   },
  // },
];

export function AssetGroupTab() {
  const {
    tableHandlers: { setPage, setPageSize },
    tableParams: { page, pageSize, sortBy, sortOrder },
    queryParams,
    queryOptions,
  } = useAsset();

  const { data, isLoading } = useAssetGroupControllerGetAll(
    {
      limit: queryParams.limit,
      page,
      sortBy: 'name',
      sortOrder,
    },
    {
      query: {
        ...queryOptions.query,
        queryKey: ['asset-group', ...queryOptions.query.queryKey],
      },
    },
  );

  const assetGroups = data?.data ?? [];
  const total = data?.total ?? 0;

  if (!data && !isLoading) return <div>Error loading targets.</div>;

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
        totalItems={total}
        sortBy={sortBy}
        sortOrder={sortOrder}
        isShowBorder={true}
        emptyMessage="No asset groups found"
      />
    </motion.div>
  );
}
