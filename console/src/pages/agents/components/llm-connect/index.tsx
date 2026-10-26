import { useLLMConfigs } from '@/hooks/use-llm-configs';
import {
  CreateLLMConfigDtoProvider,
} from '@/services/apis/gen/queries';
import type { AxiosError } from 'axios';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import type { ConnectFormData } from './schema';
import { rowKey } from './schema';
import { ConnectedConfigRow } from './connected-config-row';
import { DialogLLMConnect } from './dialog-llm-connect';

function usePendingIds() {
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const addPending = useCallback((id: string) => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const removePending = useCallback((id: string) => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const isPending = useCallback(
    (id: string) => pendingIds.has(id),
    [pendingIds],
  );

  return { addPending, removePending, isPending };
}

export default function LlmConnect() {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const { addPending, removePending, isPending } = usePendingIds();

  const {
    providers,
    connectedProviders,
    isLoading,
    isError,
    invalidate,
    refetch,
    createConfig,
    updateConfig,
    deleteConfig,
    setPreferredConfig,
  } = useLLMConfigs();

  const handleSetPreferred = useCallback(
    async (configId: string) => {
      addPending(configId);
      try {
        await setPreferredConfig.mutateAsync({ id: configId });
        invalidate();
        toast.success('Default model updated');
      } catch {
        toast.error('Failed to set default model');
      } finally {
        removePending(configId);
      }
    },
    [setPreferredConfig, invalidate, addPending, removePending],
  );

  const handleModelChange = useCallback(
    async (configId: string, modelId: string) => {
      addPending(configId);
      try {
        await updateConfig.mutateAsync({
          id: configId,
          data: { model: modelId },
        });
        invalidate();
        toast.success('Model updated');
      } catch {
        toast.error('Failed to update model');
      } finally {
        removePending(configId);
      }
    },
    [updateConfig, invalidate, addPending, removePending],
  );

  const handleConnect = useCallback(
    async (data: ConnectFormData, providerId: string): Promise<boolean> => {
      const apiKey = data.apiKey?.trim() || '';
      const apiUrl = data.apiUrl?.trim() || '';
      if (!apiUrl && !apiKey) return false;

      try {
        await createConfig.mutateAsync({
          data: {
            provider: providerId as CreateLLMConfigDtoProvider,
            name: data.name?.trim() || undefined,
            apiKey,
            apiUrl: apiUrl || undefined,
          },
        });
        invalidate();
        toast.success('Provider connected successfully');
        return true;
      } catch (err) {
        const axiosError = err as AxiosError<{ message: string | string[] }>;
        const raw = axiosError.response?.data?.message;
        const message = Array.isArray(raw)
          ? raw.join(', ')
          : (raw ?? 'Failed to connect provider');
        toast.error(message);
        return false;
      }
    },
    [createConfig, invalidate],
  );

  const handleDelete = useCallback(
    async (configId: string) => {
      addPending(configId);
      try {
        await deleteConfig.mutateAsync({ id: configId });
        toast.success('Disconnected successfully');
        invalidate();
        setExpandedKey(null);
      } catch {
        toast.error('Failed to disconnect');
      } finally {
        removePending(configId);
      }
    },
    [deleteConfig, invalidate, addPending, removePending],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-3">
        <div className="text-sm text-destructive">Failed to load providers</div>
        <button
          type="button"
          className="text-sm text-primary underline hover:no-underline"
          onClick={() => refetch()}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {connectedProviders.map((item) => {
        const key = rowKey(item);
        return (
          <ConnectedConfigRow
            key={key}
            item={item}
            isExpanded={expandedKey === key}
            onToggle={() => setExpandedKey(expandedKey === key ? null : key)}
            onModelChange={handleModelChange}
            onDelete={handleDelete}
            onSetPreferred={handleSetPreferred}
            isUpdating={isPending(key)}
          />
        );
      })}

      <DialogLLMConnect
        providersList={providers}
        onSubmit={handleConnect}
      />
    </div>
  );
}
