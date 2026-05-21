import { type ColumnDef } from '@tanstack/react-table';
import { useNavigate } from 'react-router-dom';

import { DataTable } from '@/components/ui/data-table';
import {
  useAgentsControllerGetLLMConfigs,
  type LLMConfigWithProviderDto,
} from '@/services/apis/gen/queries';

import { Badge } from '@/components/ui/badge';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
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

const agentColumns: ColumnDef<LLMConfigWithProviderDto>[] = [
  {
    accessorKey: 'providerId',
    header: 'Provider',
    cell: ({ row }) => {
      const value: string = row.getValue('providerId');
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

  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();

  const { data, isLoading } = useAgentsControllerGetLLMConfigs({
    query: {
      queryKey: ['agents', selectedWorkspaceId],
      enabled: !!selectedWorkspaceId,
    },
  });

  const agents = (data as LLMConfigWithProviderDto[] | undefined) ?? [];
  const total = agents.length;

  const handleRowClick = (row: LLMConfigWithProviderDto) => {
    if (row.configId) {
      navigate(`/agents/${row.configId}`);
    }
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
