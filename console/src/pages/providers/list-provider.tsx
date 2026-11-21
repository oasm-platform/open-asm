import { type ColumnDef } from '@tanstack/react-table';
import { useNavigate } from '@tanstack/react-router';
import { useMemo } from 'react';

import { type TFunction, useT } from '@/lib/i18n-dictionary';

import { DataTable } from '@/components/ui/data-table';
import { useProvidersControllerGetManyProviders } from '@/services/apis/gen/queries';

import { Badge } from '@/components/ui/badge';
import { OpenLink } from '@/components/ui/open-link';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import type { ToolProvider } from '@/services/apis/gen/queries';

const getProviderColumns = (t: TFunction): ColumnDef<ToolProvider>[] => [
  {
    accessorKey: 'name',
    header: t('common.name'),
    cell: ({ row }) => (
      <div className="font-medium">{row.getValue('name')}</div>
    ),
  },
  {
    accessorKey: 'code',
    header: t('providers.list.code'),
    cell: ({ row }) => {
      const value: string = row.getValue('code');
      return <div className="text-gray-500">{value}</div>;
    },
  },
  {
    accessorKey: 'company',
    header: t('providers.form.company'),
    cell: ({ row }) => {
      const value: string = row.getValue('company');
      return <div>{value || '-'}</div>;
    },
  },
  {
    accessorKey: 'websiteUrl',
    header: t('providers.list.website'),
    cell: ({ row }) => {
      const value: string = row.getValue('websiteUrl');
      return (
        <div className="text-blue-500 hover:underline">
          {value ? (
            <OpenLink href={value} target="_blank" rel="noopener noreferrer">
              {t('providers.list.visit')}
            </OpenLink>
          ) : (
            '-'
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'isActive',
    header: t('common.status'),
    cell: ({ row }) => {
      const value: boolean = row.getValue('isActive');
      return (
        <div className="flex items-center">
          <Badge
            variant={value ? 'default' : 'destructive'}
            className="text-xs font-medium"
          >
            {value ? t('providers.list.active') : t('providers.list.inactive')}
          </Badge>
        </div>
      );
    },
  },
];

export function ListProviders() {
  const t = useT();
  const providerColumns = useMemo(() => getProviderColumns(t), [t]);
  const navigate = useNavigate();
  const {
    tableParams: { page, pageSize, sortBy, sortOrder, filter },
    tableHandlers: { setPage, setPageSize, setFilter, setParams },
  } = useServerDataTable();

  const { data, isLoading } = useProvidersControllerGetManyProviders(
    {
      limit: pageSize,
      page,
      sortBy,
      sortOrder,
      name: filter || undefined, // Add name filter
    },
    {
      query: {
        queryKey: [
          'providers',
          pageSize,
          page,
          sortBy,
          sortOrder,
          filter, // Add filter to query key
        ],
      },
    },
  );

  const providers = data?.data ?? [];
  const total = data?.total ?? 0;

  // Handle row click to navigate to provider detail page
  const handleRowClick = (row: ToolProvider) => {
    navigate({ to: `/providers/${row.id}` });
  };

  return (
    <DataTable
      data={providers}
      columns={providerColumns}
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
      totalItems={total}
      onRowClick={handleRowClick} // Add row click handler
    />
  );
}

