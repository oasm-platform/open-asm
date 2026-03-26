import { Button } from '@/components/ui/button';
import type { LLMConfigWithProviderDto } from '@/services/apis/gen/queries';
import {
  CreateLLMConfigDtoProvider,
  useAgentsControllerCreateLLMConfig,
  useAgentsControllerDeleteLLMConfig,
  useAgentsControllerGetLLMConfigs,
  useAgentsControllerUpdateLLMConfig,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, ChevronUp, PlugZap, Unplug } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import Image from './ui/image';

export default function LlmConnect({ onSuccess }: { onSuccess?: () => void }) {
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [formData, setFormData] = useState<
    Record<string, { apiKey: string; model: string }>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const queryClient = useQueryClient();

  const { data: providers, isLoading } =
    useAgentsControllerGetLLMConfigs<LLMConfigWithProviderDto[]>();

  const providersList = providers ?? [];

  const createLLMConfig = useAgentsControllerCreateLLMConfig();
  const updateLLMConfig = useAgentsControllerUpdateLLMConfig();
  const deleteLLMConfig = useAgentsControllerDeleteLLMConfig();

  const handleToggleExpand = (providerId: string) => {
    setExpandedProvider(expandedProvider === providerId ? null : providerId);
  };

  const handleInputChange = (
    providerId: string,
    field: 'apiKey' | 'model',
    value: string,
  ) => {
    setFormData((prev) => ({
      ...prev,
      [providerId]: {
        ...prev[providerId],
        [field]: value,
      },
    }));
  };

  const handleSubmit = async (e: React.FormEvent, providerId: string) => {
    e.preventDefault();
    const data = formData[providerId];
    if (!data?.apiKey.trim() || !data?.model.trim()) return;

    setIsSubmitting(true);
    try {
      const provider = providersList.find((p) => p.providerId === providerId);

      if (provider?.isConnected && provider.configId) {
        await updateLLMConfig.mutateAsync({
          id: provider.configId,
          data: {
            apiKey: data.apiKey.trim(),
            model: data.model.trim(),
          },
        });
      } else {
        await createLLMConfig.mutateAsync({
          data: {
            provider: providerId as CreateLLMConfigDtoProvider,
            apiKey: data.apiKey.trim(),
            model: data.model.trim(),
          },
        });
      }

      void queryClient.invalidateQueries({
        queryKey: ['/api/agents/llm-configs'],
      });

      setFormData((prev) => ({
        ...prev,
        [providerId]: { apiKey: '', model: '' },
      }));
      setExpandedProvider(null);
      onSuccess?.();
    } catch {
      // Error handled by mutation
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (providerId: string) => {
    const provider = providersList.find((p) => p.providerId === providerId);
    if (!provider?.configId) return;

    await deleteLLMConfig.mutateAsync(
      { id: provider.configId },
      {
        onSuccess: () => {
          toast.success('Provider disconnected successfully');
          void queryClient.invalidateQueries({
            queryKey: ['/api/agents/llm-configs'],
          });
          setExpandedProvider(null);
          setFormData((prev) => ({
            ...prev,
            [providerId]: { apiKey: '', model: '' },
          }));
          onSuccess?.();
        },
        onError: () => {
          toast.error('Failed to disconnect provider');
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-sm text-muted-foreground">
          Loading providers...
        </div>
      </div>
    );
  }

  if (providersList.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-sm text-muted-foreground">
          No providers available
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {providersList.map((provider) => {
        const isExpanded = expandedProvider === provider.providerId;
        const hasConfig = provider.isConnected;
        console.log(provider.logo);
        return (
          <div
            key={provider.providerId}
            className="rounded-lg border bg-card overflow-hidden"
          >
            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-9 h-9 rounded-md dark:bg-white bg-gray-500">
                  <Image width={24} height={24} url={provider.logo} />
                </div>
                <div className="flex flex-col justify-start items-start">
                  <span className="font-medium text-foreground">
                    {provider.providerName}
                  </span>
                  {hasConfig && provider.model && (
                    <span className="text-xs text-muted-foreground">
                      {provider.model}
                    </span>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleToggleExpand(provider.providerId)}
                className={
                  hasConfig
                    ? 'gap-1 border border-green-600 text-green-600 hover:bg-green-50'
                    : 'gap-1'
                }
              >
                {hasConfig ? (
                  <>
                    <Check size={16} />
                    Connected
                    {isExpanded ? (
                      <ChevronUp size={16} />
                    ) : (
                      <ChevronDown size={16} />
                    )}
                  </>
                ) : (
                  <>
                    <PlugZap size={16} />
                    Connect
                    {isExpanded ? (
                      <ChevronUp size={16} />
                    ) : (
                      <ChevronDown size={16} />
                    )}
                  </>
                )}
              </Button>
            </div>

            {isExpanded && (
              <form
                onSubmit={(e) => handleSubmit(e, provider.providerId)}
                className="border-t p-4 flex flex-col gap-3 bg-muted/30"
              >
                <div className="flex flex-col gap-1.5">
                  <input
                    type="password"
                    value={formData[provider.providerId]?.apiKey || ''}
                    onChange={(e) =>
                      handleInputChange(
                        provider.providerId,
                        'apiKey',
                        e.target.value,
                      )
                    }
                    placeholder="Enter your API key"
                    autoComplete="new-password"
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <input
                    type="text"
                    defaultValue={hasConfig ? provider.model : ''}
                    value={formData[provider.providerId]?.model || ''}
                    onChange={(e) =>
                      handleInputChange(
                        provider.providerId,
                        'model',
                        e.target.value,
                      )
                    }
                    placeholder="Enter your model ID"
                    autoComplete="off"
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring"
                    required
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={
                      isSubmitting ||
                      !formData[provider.providerId]?.apiKey?.trim() ||
                      !formData[provider.providerId]?.model?.trim()
                    }
                  >
                    {isSubmitting
                      ? 'Saving...'
                      : hasConfig
                        ? 'Update'
                        : 'Connect'}
                  </Button>

                  {hasConfig && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(provider.providerId)}
                      disabled={deleteLLMConfig.isPending}
                      className="gap-2"
                    >
                      <Unplug size={16} />
                      {deleteLLMConfig.isPending
                        ? 'Disconnecting...'
                        : 'Disconnect'}
                    </Button>
                  )}
                </div>
              </form>
            )}
          </div>
        );
      })}
    </div>
  );
}
