import { type ColumnDef } from '@tanstack/react-table';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import {
  useAgentsControllerGetLLMConfigs,
  useAgentsControllerCreateLLMConfig,
  useAgentsControllerDeleteLLMConfig,
  useAgentsControllerSetPreferredLLMConfig,
  type LLMConfigResponseDto,
} from '@/services/apis/gen/queries';
import { format } from 'date-fns';
import { MoreHorizontal, Pencil, Plus, Star, Trash2 } from 'lucide-react';

import { AgentForm, type AgentFormData } from '@/pages/agents/agent-form';

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

const ProvidersSettings = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

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

  const { mutate: createConfig, isPending: isCreating } =
    useAgentsControllerCreateLLMConfig();
  const { mutate: deleteConfig } = useAgentsControllerDeleteLLMConfig();
  const { mutate: setPreferred } = useAgentsControllerSetPreferredLLMConfig();

  const agents = data?.data ?? [];
  const total = data?.total ?? 0;

  const handleCreate = (formData: AgentFormData) => {
    createConfig(
      { data: formData },
      {
        onSuccess: () => {
          toast.success('Provider connected successfully');
          queryClient.invalidateQueries({ queryKey: ['agents'] });
          setCreateOpen(false);
        },
        onError: () => {
          toast.error('Failed to connect provider');
        },
      },
    );
  };

  const handleDelete = (id: string) => {
    deleteConfig(
      { id },
      {
        onSuccess: () => {
          toast.success('Provider deleted successfully');
          queryClient.invalidateQueries({ queryKey: ['agents'] });
        },
        onError: () => {
          toast.error('Failed to delete provider');
        },
      },
    );
  };

  const handleSetPreferred = (id: string) => {
    setPreferred(
      { id },
      {
        onSuccess: () => {
          toast.success('Preferred provider updated');
          queryClient.invalidateQueries({ queryKey: ['agents'] });
        },
        onError: () => {
          toast.error('Failed to set preferred provider');
        },
      },
    );
  };

  const columns: ColumnDef<LLMConfigResponseDto>[] = [
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
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const agent = row.original;
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {!agent.isPreferred && (
                  <DropdownMenuItem onClick={() => handleSetPreferred(agent.id)}>
                    <Star className="mr-2 h-4 w-4" />
                    Set Preferred
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => navigate(`/agents/${agent.id}`)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <ConfirmDialog
                  title="Delete Provider"
                  description={`Are you sure you want to delete this ${providerLabels[agent.provider] ?? agent.provider} configuration? This action cannot be undone.`}
                  onConfirm={() => handleDelete(agent.id)}
                  trigger={
                    <DropdownMenuItem
                      className="text-red-600 focus:text-red-600"
                      onSelect={(e) => e.preventDefault()}
                    >
                      <Trash2 className="mr-2 h-4 w-4 text-red-600" />
                      <span className="text-red-600">Delete</span>
                    </DropdownMenuItem>
                  }
                  confirmText="Delete"
                  cancelText="Cancel"
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Connect Provider
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Connect AI Provider</DialogTitle>
            </DialogHeader>
            <AgentForm
              onSubmit={handleCreate}
              isPending={isCreating}
              submitButtonText="Connect Provider"
            />
          </DialogContent>
        </Dialog>
      </div>

      <DataTable
        data={agents}
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
        totalItems={total}
      />
    </div>
  );
};

export default ProvidersSettings;
