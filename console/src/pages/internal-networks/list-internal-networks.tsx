import { type ColumnDef } from '@tanstack/react-table';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

import { DataTable } from '@/components/ui/data-table';
import { DataTableError } from '@/components/ui/data-table-error-boundary';
import { useInternalNetworksControllerGetManyInternalNetworks } from '@/services/apis/gen/queries';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import type { GetManyInternalNetworksResponseDtoDataItem } from '@/services/apis/gen/queries';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { Button } from '@/components/ui/button';
import { Network } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const internalNetworkColumns: ColumnDef<GetManyInternalNetworksResponseDtoDataItem>[] = [
  {
    accessorKey: 'id',
    header: 'ID',
    cell: ({ row }) => (
      <div className="font-medium">{row.getValue('id')}</div>
    ),
  },
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <div className="font-medium">{row.getValue('name')}</div>
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
];

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

  if (!data && !isLoading)
    return (
      <DataTableError message="Failed to load internal networks." onRetry={refetch} />
    );

  return (
    <DataTable
      data={internalNetworks}
      columns={internalNetworkColumns}
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