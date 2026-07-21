import { useLLMConfigs } from '@/hooks/use-llm-configs';
import { type ColumnDef } from '@tanstack/react-table';
import { useNavigate } from '@tanstack/react-router';

import { DataTable } from '@/components/ui/data-table';
import type {
  LLMConfigWithProviderDto,
} from '@/services/apis/gen/queries';

import { Badge } from '@/components/ui/badge';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { format } from 'date-fns';
import { useMemo } from 'react';

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
      if (!row.original.isConnected) {
        return <Badge variant="outline">Disconnected</Badge>;
      }
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
      if (!value) return <div className="text-muted-foreground text-sm">-</div>;
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

  const { providers, isLoading } = useLLMConfigs({
    enabled: !!selectedWorkspaceId,
  });

  const agents = providers;
  const total = agents.length;

  const processedAgents = useMemo(() => {
    const result = [...agents];
    if (sortBy) {
      result.sort((a, b) => {
        const aVal = a[sortBy as keyof LLMConfigWithProviderDto];
        const bVal = b[sortBy as keyof LLMConfigWithProviderDto];
        if (aVal === bVal) return 0;
        if (aVal === undefined || aVal === null) return 1;
        if (bVal === undefined || bVal === null) return -1;
        const comp = aVal < bVal ? -1 : 1;
        return sortOrder === 'ASC' ? comp : -comp;
      });
    }
    const start = (page - 1) * pageSize;
    return result.slice(start, start + pageSize);
  }, [agents, sortBy, sortOrder, page, pageSize]);

  const handleRowClick = (row: LLMConfigWithProviderDto) => {
    if (row.configId) {
      navigate({ to: `/agents/${row.configId}` });
    }
  };

  return (
    <DataTable
      data={processedAgents}
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
