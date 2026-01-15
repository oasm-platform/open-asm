import { Skeleton } from '@/components/ui/skeleton';
import {
  useAiAssistantControllerGetLLMConfigs,
  useAiAssistantControllerUpdateLLMConfig,
  useAiAssistantControllerDeleteLLMConfig,
  useAiAssistantControllerSetPreferredLLMConfig,
} from '@/services/apis/gen/queries';
import type { LLMConfigResponseDto } from '@/services/apis/gen/queries';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { useState } from 'react';
import { toast } from 'sonner';
import { Brain, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LLMList } from './llm-list';
import { LLMForm } from './llm-form';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

type ViewMode = 'list' | 'add' | 'edit';

export function LLMManagerContent() {
  const { selectedWorkspace } = useWorkspaceSelector();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [editingId, setEditingId] = useState<string | null>(null);

  const {
    data: configs,
    isLoading: isLoadingConfigs,
    refetch: refetchConfigs,
  } = useAiAssistantControllerGetLLMConfigs(undefined, {
    query: {
      enabled: !!selectedWorkspace,
    },
  });

  const { mutate: updateConfig, isPending: isUpdating } =
    useAiAssistantControllerUpdateLLMConfig();
  const { mutate: deleteConfig } = useAiAssistantControllerDeleteLLMConfig();
  const { mutate: setPreferredConfig } =
    useAiAssistantControllerSetPreferredLLMConfig();

  const handleAdd = () => {
    setViewMode('add');
    setEditingId(null);
  };

  const handleEdit = (id: string) => {
    setViewMode('edit');
    setEditingId(id);
  };

  const handleCancel = () => {
    setViewMode('list');
    setEditingId(null);
  };

  const configsList =
    (Array.isArray(configs) ? configs : [])?.map((c: LLMConfigResponseDto) => ({
      id: c.id,
      provider: c.provider,
      model: c.model || '',
      apiKey: c.apiKey,
      isPreferred: !!c.isPreferred,
      isEditable: c.isEditable,
      apiUrl: c.apiUrl,
    })) || [];

  const handleSetDefault = (id: string) => {
    if (!selectedWorkspace) return;

    setPreferredConfig(
      {
        id,
      },
      {
        onSuccess: (response) => {
          toast.success(`Set ${response.provider} as preferred LLM`);
          refetchConfigs();
        },
        onError: (err: unknown) => {
          const message = err instanceof Error ? err.message : 'Unknown error';
          toast.error(`Failed to set preferred LLM: ${message}`);
        },
      },
    );
  };

  const handleSubmit = (data: {
    provider: string;
    apiKey: string;
    model: string;
    apiUrl?: string;
  }) => {
    if (!selectedWorkspace) return;

    updateConfig(
      {
        data: {
          id: editingId || undefined,
          provider: data.provider,
          apiKey: data.apiKey,
          model: data.model,
          apiUrl: data.apiUrl,
        },
      },
      {
        onSuccess: () => {
          toast.success(
            `${viewMode === 'add' ? 'Added' : 'Updated'} ${data.provider} configuration`,
          );
          refetchConfigs();
          setViewMode('list');
          setEditingId(null);
        },
        onError: (err: unknown) => {
          const message = err instanceof Error ? err.message : 'Unknown error';
          toast.error(`Failed to save configuration: ${message}`);
        },
      },
    );
  };

  const handleDelete = (id: string) => {
    if (!selectedWorkspace) return;

    deleteConfig(
      {
        id,
      },
      {
        onSuccess: () => {
          toast.success(`Deleted configuration`);
          refetchConfigs();
        },
        onError: (err: unknown) => {
          const message = err instanceof Error ? err.message : 'Unknown error';
          toast.error(`Failed to delete: ${message}`);
        },
      },
    );
  };

  const editingConfig = editingId
    ? configsList.find((c) => c.id === editingId)
    : null;

  return (
    <>
      <DialogHeader className="p-6 pr-12 border-b shrink-0 bg-background relative">
        <div className="flex flex-row items-start justify-between gap-4 text-left">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <Brain className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
            <div className="flex flex-col gap-1 min-w-0 items-start">
              <DialogTitle className="text-lg font-semibold truncate leading-none text-left">
                LLM Manager
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground line-clamp-2 text-left">
                Configure external LLM providers and API keys.
              </DialogDescription>
            </div>
          </div>
          <Button
            onClick={handleAdd}
            variant="outline"
            size="sm"
            className="gap-2 shrink-0 h-9"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add Provider</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>
      </DialogHeader>

      <div className="flex-1 overflow-y-auto custom-scrollbar bg-background p-6">
        <div className="space-y-6">
          {isLoadingConfigs ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-40 w-full" />
              ))}
            </div>
          ) : (
            <LLMList
              configs={configsList}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onSetDefault={handleSetDefault}
            />
          )}
        </div>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog
        open={viewMode !== 'list'}
        onOpenChange={(open) => !open && handleCancel()}
      >
        <DialogContent className="max-w-2xl bg-background border-border sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {viewMode === 'add' ? 'Add LLM Provider' : 'Edit LLM Provider'}
            </DialogTitle>
            <DialogDescription>
              {viewMode === 'add'
                ? 'Configure a new LLM provider'
                : 'Update LLM provider configuration'}
            </DialogDescription>
          </DialogHeader>
          <LLMForm
            mode={viewMode as 'add' | 'edit'}
            initialData={
              editingConfig
                ? {
                    provider: editingConfig.provider,
                    apiKey: editingConfig.apiKey,
                    model: editingConfig.model,
                    apiUrl: editingConfig.apiUrl,
                  }
                : undefined
            }
            isUpdating={isUpdating}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
