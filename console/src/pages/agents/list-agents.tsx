import { type ColumnDef } from '@tanstack/react-table';
import { useNavigate } from 'react-router-dom';

import { DataTable } from '@/components/ui/data-table';
import { useAgentsControllerGetLLMConfigs } from '@/services/apis/gen/queries';

import { Badge } from '@/components/ui/badge';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import type { LLMConfigResponseDto } from '@/services/apis/gen/queries';
import { format } from 'date-fns';

const providerLabels: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  custom: 'Custom',
};

const providerColors: Record<string, 'default' | 'secondary' | 'outline'> = {
  openai: 'default',
  anthropic: 'secondary',
  custom: 'outline',
};

const agentColumns: ColumnDef<LLMConfigResponseDto>[] = [
  {
    accessorKey: 'provider',
    header: 'Provider',
    cell: ({ row }) => {
      const value: string = row.getValue('provider');
      const label = providerLabels[value] ?? value;
      return (
        <Badge variant={providerColors[value] ?? 'outline'}>{label}</Badge>
      );
    },
  },
  {
    accessorKey: 'model',
    header: 'Model',
    cell: ({ row }) => (
      <div className="font-medium">{row.getValue('model')}</div>
    ),
  },
  {
    accessorKey: 'isPreferred',
    header: 'Status',
    cell: ({ row }) => {
      const isPreferred: boolean = row.getValue('isPreferred');
      return (
        <Badge variant={isPreferred ? 'default' : 'secondary'}>
          {isPreferred ? 'Preferred' : 'Active'}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'createdAt',
    header: 'Connected',
    cell: ({ row }) => {
      const value: string = row.getValue('createdAt');
      return (
        <div className="text-muted-foreground text-sm">
          {format(new Date(value), 'MMM dd, yyyy')}
        </div>
      );
    },
  },
];

export function ListAgents() {
  const navigate = useNavigate();
  const {
    tableParams: { page, pageSize, sortBy, sortOrder },
    tableHandlers: { setPage, setPageSize, setParams },
  } = useServerDataTable();

  const { data, isLoading } = useAgentsControllerGetLLMConfigs(
    {
      limit: pageSize,
      page,
      sortBy,
      sortOrder,
    },
    {
      query: {
        queryKey: ['agents', pageSize, page, sortBy, sortOrder],
      },
    },
  );

  const agents = data?.data ?? [];
  const total = data?.total ?? 0;

  const handleRowClick = (row: LLMConfigResponseDto) => {
    navigate(`/agents/${row.id}`);
  };

  return (
    <DataTable
      data={agents}
      columns={agentColumns}
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
      totalItems={total}
      onRowClick={handleRowClick}
    />
  );
}
