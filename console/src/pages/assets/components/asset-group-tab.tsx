import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useAssetGroupControllerDelete,
  useAssetGroupControllerGetAll,
  type AssetGroup,
} from '@/services/apis/gen/queries';
import { type ColumnDef } from '@tanstack/react-table';
import dayjs from 'dayjs';
import { MoreHorizontal } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAsset } from '../context/asset-context';

export function AssetGroupTab() {
  const {
    tableHandlers: { setPage, setPageSize },
    tableParams: { page, pageSize, sortBy, sortOrder },
    queryParams,
    queryOptions,
  } = useAsset();

  const { mutate } = useAssetGroupControllerDelete();

  const columns: ColumnDef<AssetGroup>[] = [
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
                onClick={(e) => {
                  e.stopPropagation();
                  mutate(
                    { id: assetGroup.id },
                    {
                      onSuccess: () => {
                        refetch();
                        toast('Asset group deleted successfully');
                      },
                    },
                  );
                }}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
  const navigate = useNavigate();

  const { data, isLoading, refetch } = useAssetGroupControllerGetAll(
    {
      limit: pageSize,
      page: page,
      sortBy: 'name',
      sortOrder: sortOrder,
      targetIds: queryParams.targetIds,
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

  if (!data && !isLoading) return <div>Error loading asset groups.</div>;

  return (
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
      onRowClick={(row) => navigate('/asset-group/' + row.id)}
      emptyMessage="No asset groups found"
    />
  );
}
