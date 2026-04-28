import { type ColumnDef } from '@tanstack/react-table';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

import { DataTable } from '@/components/ui/data-table';
import { DataTableError } from '@/components/ui/data-table-error-boundary';
import { useInternalNetworksControllerGetManyInternalNetworks, useInternalNetworksControllerDeleteInternalNetwork } from '@/services/apis/gen/queries';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import type { GetManyInternalNetworksResponseDtoDataItem } from '@/services/apis/gen/queries';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { Button } from '@/components/ui/button';
import { Network, Trash2 } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface DeleteButtonProps {
  id: string;
  name: string;
  onDeleteSuccess?: () => void;
}

const DeleteButton = ({ id, name, onDeleteSuccess }: DeleteButtonProps) => {
  const deleteMutation = useInternalNetworksControllerDeleteInternalNetwork({
    mutation: {
      onSuccess: () => {
        onDeleteSuccess?.();
      },
    },
  });

  return (
    <ConfirmDialog
      title="Delete Internal Network"
      description={`Are you sure you want to delete "${name}"? This action cannot be undone.`}
      onConfirm={() => deleteMutation.mutate({ id })}
      trigger={
        <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-800">
          <Trash2 className="h-4 w-4" />
        </Button>
      }
      confirmText="Delete"
    />
  );
};

export function ListInternalNetworks() {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const navigate = useNavigate();

  const {
    tableParams: { page, pageSize, sortBy, sortOrder, filter },
    tableHandlers: { setPage, setPageSize, setFilter, setParams },
  } = useServerDataTable();

  const { data, isLoading, refetch } = useInternalNetworksControllerGetManyInternalNetworks(
    {
      limit: pageSize,
      page,
      sortBy,
      sortOrder,
      search: filter,
    },
    {
      query: {
        queryKey: [
          'internalNetworks',
          selectedWorkspaceId,
          pageSize,
          page,
          sortBy,
          sortOrder,
          filter,
        ],
      },
    },
  );

  const internalNetworks = data?.data ?? [];
  const total = data?.total ?? 0;

  const columns: ColumnDef<GetManyInternalNetworksResponseDtoDataItem>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <Link
          to={`/internal-networks/${row.original.id}`}
          className="font-medium text-blue-600 hover:text-blue-800"
        >
          {row.getValue('name')}
        </Link>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ row }) => {
        const value: string = row.getValue('createdAt');
        return (
          <div className="text-gray-400 font-semibold">
            {dayjs(value).fromNow()}
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const network = row.original;
        return (
          <DeleteButton
            id={network.id as string}
            name={network.name as string}
            onDeleteSuccess={refetch}
          />
        );
      },
    },
  ];

  if (!data && !isLoading)
    return (
      <DataTableError message="Failed to load internal networks." onRetry={refetch} />
    );

  return (
    <DataTable
      data={internalNetworks}
      columns={columns}
      isLoading={isLoading}
      page={page}
      pageSize={pageSize}
      sortBy={sortBy}
      sortOrder={sortOrder}
      onPageChange={setPage}
      onPageSizeChange={setPageSize}
      onSortChange={(col, order) => {
        setParams({ sortBy: col, sortOrder: order });
      }}
      filterColumnKey="name"
      filterValue={filter}
      onFilterChange={setFilter}
      toolbarComponents={[
        <Button
          key="create-network"
          variant="outline"
          className="gap-2"
          onClick={() => navigate('/internal-networks/create')}
        >
          <Network className="shrink-0" />
          <span>Create network</span>
        </Button>,
      ]}
      totalItems={total}
    />
  );
}