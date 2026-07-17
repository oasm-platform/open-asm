import type { LLMConfigWithProviderDto } from '@/services/apis/gen/queries';
import {
  CreateLLMConfigDtoProvider,
  useAgentsControllerCreateLLMConfig,
  useAgentsControllerDeleteLLMConfig,
  useAgentsControllerGetLLMConfigs,
  useAgentsControllerSetPreferredLLMConfig,
  useAgentsControllerUpdateLLMConfig,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { ConnectFormData } from './schema';
import { rowKey } from './schema';
import { ConnectedConfigRow } from './connected-config-row';
import { DialogLLMConnect } from './dialog-llm-connect';

export default function LlmConnect() {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const { data: providers, isLoading } =
    useAgentsControllerGetLLMConfigs<LLMConfigWithProviderDto[]>();

  const providersList = useMemo(() => providers ?? [], [providers]);
  const connectedConfigs = useMemo(
    () => providersList.filter((p) => p.isConnected),
    [providersList],
  );

  const createLLMConfig = useAgentsControllerCreateLLMConfig();
  const updateLLMConfig = useAgentsControllerUpdateLLMConfig();
  const deleteLLMConfig = useAgentsControllerDeleteLLMConfig();
  const setPreferredLLMConfig = useAgentsControllerSetPreferredLLMConfig();

  const invalidate = useCallback(
    () =>
      void queryClient.invalidateQueries({
        queryKey: ['/api/agents/llm-configs'],
      }),
    [queryClient],
  );

  const handleSetPreferred = useCallback(
    async (configId: string) => {
      setUpdatingId(configId);
      try {
        await setPreferredLLMConfig.mutateAsync({ id: configId });
        invalidate();
        toast.success('Default model updated');
      } catch {
        toast.error('Failed to set default model');
      } finally {
        setUpdatingId(null);
      }
    },
    [setPreferredLLMConfig, invalidate],
  );

  const handleModelChange = useCallback(
    async (configId: string, modelId: string) => {
      setUpdatingId(configId);
      try {
        await updateLLMConfig.mutateAsync({
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
    [updateLLMConfig, invalidate],
  );

  const handleConnect = useCallback(
    async (data: ConnectFormData, providerId: string) => {
      const apiKey = data.apiKey?.trim() || '';
      const apiUrl = data.apiUrl?.trim() || '';
      if (!apiUrl && !apiKey) return;

      try {
        await createLLMConfig.mutateAsync({
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
    [createLLMConfig, invalidate],
  );

  const handleDelete = useCallback(
    async (configId: string) => {
      setUpdatingId(configId);
      try {
        await deleteLLMConfig.mutateAsync({ id: configId });
        toast.success('Disconnected successfully');
        invalidate();
        setExpandedKey(null);
      } catch {
        toast.error('Failed to disconnect');
      } finally {
        setUpdatingId(null);
      }
    },
    [deleteLLMConfig, invalidate],
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
      {connectedConfigs.map((item) => {
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
        providersList={providersList}
        onSubmit={handleConnect}
      />
    </div>
  );
}
