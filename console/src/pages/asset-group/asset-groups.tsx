import Page from '@/components/common/page';
import { DataTable } from '@/components/ui/data-table';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import {
  useAssetGroupControllerGetAll,
  type AssetGroup,
} from '@/services/apis/gen/queries';
import { type ColumnDef } from '@tanstack/react-table';
import dayjs from 'dayjs';
import { useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';

export function AssetGroups() {
  const {
    tableParams: { page, pageSize, sortBy, sortOrder, filter },
    tableHandlers: { setPage, setPageSize, setFilter },
  } = useServerDataTable();

  const navigate = useNavigate();

  const columns: ColumnDef<AssetGroup>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <div className="font-medium flex items-center gap-2">
          <div
            className={`h-4 w-4 rounded-full`}
            style={{ background: row.original.hexColor }}
          ></div>
          <span>{row.original.name}</span>
        </div>
      ),
    },
    {
      accessorKey: 'totalAssets',
      header: 'Total Hosts',
      cell: ({ row }) => (
        <div className="font-medium">{row.original.totalAssets || 0}</div>
      ),
    },
    {
      accessorKey: 'lastRunAt',
      header: 'Last Run',
      cell: ({ row }) => (
        <div className="font-medium">
          {row.original.lastRunAt
            ? dayjs(row.original.lastRunAt).format('YYYY-MM-DD HH:mm')
            : '—'}
        </div>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Created Date',
      enableSorting: false,
      cell: ({ row }) => (
        <div>{dayjs(row.original.createdAt).format('YYYY-MM-DD HH:mm')}</div>
      ),
    },
  ];

  const { data, isLoading } = useAssetGroupControllerGetAll(
    {
      limit: pageSize,
      page: page,
      sortBy: 'name',
      sortOrder: sortOrder,
      search: filter,
    },
    {
      query: {
        queryKey: ['asset-group', pageSize, page, sortBy, sortOrder, filter],
      },
    },
  );

  const assetGroups = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <Page title="Groups">
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
        toolbarComponents={[
          <Button
            key="create"
            variant="outline"
            onClick={() => navigate({ to: '/groups/create' })}
          >
            <Plus />
            Create
          </Button>,
        ]}
        sortOrder={sortOrder}
        isShowBorder={true}
        onRowClick={(row) => navigate({ to: '/groups/' + row.id })}
        emptyMessage="No groups found"
        filterColumnKey="name"
        filterValue={filter}
        onFilterChange={setFilter}
      />
    </Page>
  );
}
