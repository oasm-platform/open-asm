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

export default function LlmConnect() {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const {
    providers,
    connectedProviders,
    isLoading,
    invalidate,
    createConfig,
    updateConfig,
    deleteConfig,
    setPreferredConfig,
  } = useLLMConfigs();

  const handleSetPreferred = useCallback(
    async (configId: string) => {
      setUpdatingId(configId);
      try {
        await setPreferredConfig.mutateAsync({ id: configId });
        invalidate();
        toast.success('Default model updated');
      } catch {
        toast.error('Failed to set default model');
      } finally {
        setUpdatingId(null);
      }
    },
    [setPreferredConfig, invalidate],
  );

  const handleModelChange = useCallback(
    async (configId: string, modelId: string) => {
      setUpdatingId(configId);
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
        setUpdatingId(null);
      }
    },
    [updateConfig, invalidate],
  );

  const handleConnect = useCallback(
    async (data: ConnectFormData, providerId: string) => {
      const apiKey = data.apiKey?.trim() || '';
      const apiUrl = data.apiUrl?.trim() || '';
      if (!apiUrl && !apiKey) return;

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
      } catch (err) {
        const axiosError = err as AxiosError<{ message: string | string[] }>;
        const raw = axiosError.response?.data?.message;
        const message = Array.isArray(raw)
          ? raw.join(', ')
          : (raw ?? 'Failed to connect provider');
        toast.error(message);
      }
    },
    [createConfig, invalidate],
  );

  const handleDelete = useCallback(
    async (configId: string) => {
      setUpdatingId(configId);
      try {
        await deleteConfig.mutateAsync({ id: configId });
        toast.success('Disconnected successfully');
        invalidate();
        setExpandedKey(null);
      } catch {
        toast.error('Failed to disconnect');
      } finally {
        setUpdatingId(null);
      }
    },
    [deleteConfig, invalidate],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-sm text-muted-foreground">Loading...</div>
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
            isUpdating={updatingId === key}
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
