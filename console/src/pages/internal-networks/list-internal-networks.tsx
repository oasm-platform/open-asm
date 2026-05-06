import { type ColumnDef } from '@tanstack/react-table';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { DataTableError } from '@/components/ui/data-table-error-boundary';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import type { GetManyInternalNetworksResponseDtoDataItem } from '@/services/apis/gen/queries';
import { useInternalNetworksControllerGetManyInternalNetworks } from '@/services/apis/gen/queries';
import { Network } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function ListInternalNetworks() {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const navigate = useNavigate();

  const {
    tableParams: { page, pageSize, sortBy, sortOrder, filter },
    tableHandlers: { setPage, setPageSize, setFilter, setParams },
  } = useServerDataTable();

  const { data, isLoading, refetch } =
    useInternalNetworksControllerGetManyInternalNetworks(
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
        <div className="font-medium">{row.getValue('name')}</div>
      ),
    },
    {
      accessorKey: 'agents',
      header: 'Worker agents',
      cell: ({ row }) => (
        <div className="font-medium">{row.getValue('agents')}</div>
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

  if (!data && !isLoading)
    return (
      <DataTableError
        message="Failed to load internal networks."
        onRetry={refetch}
      />
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
      onRowClick={(row) => navigate(`/internal-networks/${row.id}`)}
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
