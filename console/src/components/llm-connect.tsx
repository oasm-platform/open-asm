import { Button } from '@/components/ui/button';
import type { LLMConfigWithProviderDto } from '@/services/apis/gen/queries';
import {
  CreateLLMConfigDtoProvider,
  useAgentsControllerCreateLLMConfig,
  useAgentsControllerDeleteLLMConfig,
  useAgentsControllerGetLLMConfigs,
  useAgentsControllerGetProviderModels,
  useAgentsControllerUpdateLLMConfig,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  PlugZap,
  Unplug,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from './ui/command';
import Image from './ui/image';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

export default function LlmConnect({ onSuccess }: { onSuccess?: () => void }) {
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, { apiKey: string }>>(
    {},
  );
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

  const handleApiKeyChange = (providerId: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [providerId]: { apiKey: value },
    }));
  };

  const handleModelChange = async (providerId: string, modelId: string) => {
    const provider = providersList.find((p) => p.providerId === providerId);
    if (!provider?.configId) return;

    setIsSubmitting(true);
    try {
      await updateLLMConfig.mutateAsync({
        id: provider.configId,
        data: { model: modelId },
      });
      void queryClient.invalidateQueries({
        queryKey: ['/api/agents/llm-configs'],
      });
      toast.success('Model updated successfully');
      onSuccess?.();
    } catch {
      toast.error('Failed to update model');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent, providerId: string) => {
    e.preventDefault();
    const data = formData[providerId];
    if (!data?.apiKey.trim()) return;

    setIsSubmitting(true);
    try {
      await createLLMConfig.mutateAsync({
        data: {
          provider: providerId as CreateLLMConfigDtoProvider,
          apiKey: data.apiKey.trim(),
        },
      });

      void queryClient.invalidateQueries({
        queryKey: ['/api/agents/llm-configs'],
      });

      setFormData((prev) => ({
        ...prev,
        [providerId]: { apiKey: '' },
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
            [providerId]: { apiKey: '' },
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
              <div className="border-t p-4 flex flex-col gap-3 bg-muted/30">
                {hasConfig ? (
                  <ModelSelectForm
                    provider={provider}
                    onModelChange={handleModelChange}
                    onDelete={() => handleDelete(provider.providerId)}
                    isUpdating={isSubmitting}
                  />
                ) : (
                  <ConnectForm
                    provider={provider}
                    formData={formData}
                    isSubmitting={isSubmitting}
                    onApiKeyChange={handleApiKeyChange}
                    onSubmit={handleSubmit}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ModelSelectForm({
  provider,
  onModelChange,
  onDelete,
  isUpdating,
}: {
  provider: LLMConfigWithProviderDto;
  onModelChange: (providerId: string, modelId: string) => Promise<void>;
  onDelete: () => void;
  isUpdating: boolean;
}) {
  const configId = provider.configId ?? '';
  const [selectOpen, setSelectOpen] = useState(false);
  const { data: models, isLoading } = useAgentsControllerGetProviderModels(
    configId,
    {
      query: {
        enabled: !!provider.configId,
        staleTime: 5 * 60 * 1000,
      },
    },
  );

  const modelList = models ?? [];
  const currentModel = provider.model;

  const handleSelect = useCallback(
    (modelId: string) => {
      void onModelChange(provider.providerId, modelId);
      setSelectOpen(false);
    },
    [provider.providerId, onModelChange],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">Models</label>
        <Popover open={selectOpen} onOpenChange={setSelectOpen}>
          <PopoverTrigger asChild>
            <button
              disabled={isUpdating || isLoading}
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 flex items-center justify-between"
            >
              <span className="truncate">
                {currentModel ||
                  (isLoading ? 'Loading models...' : 'Select a model')}
              </span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="p-0" align="start" sideOffset={4}>
            <Command>
              <CommandInput placeholder="Search models..." />
              <CommandList className="max-h-[320px]">
                <CommandEmpty>
                  {isLoading ? 'Loading models...' : 'No models found'}
                </CommandEmpty>
                {modelList.map((model) => (
                  <CommandItem
                    key={model.id}
                    value={model.name}
                    onSelect={() => handleSelect(model.id)}
                    className="flex items-center gap-2 px-2"
                  >
                    <span className="truncate flex-1">{model.name}</span>
                    {currentModel === model.id && (
                      <Check className="h-4 w-4 shrink-0" />
                    )}
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onDelete}
          disabled={isUpdating}
          className="gap-2"
        >
          <Unplug size={16} />
          Disconnect
        </Button>
      </div>
    </div>
  );
}

function ConnectForm({
  provider,
  formData,
  isSubmitting,
  onApiKeyChange,
  onSubmit,
}: {
  provider: LLMConfigWithProviderDto;
  formData: Record<string, { apiKey: string }>;
  isSubmitting: boolean;
  onApiKeyChange: (providerId: string, value: string) => void;
  onSubmit: (e: React.FormEvent, providerId: string) => Promise<void>;
}) {
  return (
    <form
      onSubmit={(e) => onSubmit(e, provider.providerId)}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-1.5">
        <input
          type="password"
          value={formData[provider.providerId]?.apiKey || ''}
          onChange={(e) => onApiKeyChange(provider.providerId, e.target.value)}
          placeholder="Enter your API key"
          autoComplete="new-password"
          className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring"
          required
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={
            isSubmitting || !formData[provider.providerId]?.apiKey?.trim()
          }
        >
          {isSubmitting ? 'Connecting...' : 'Connect'}
        </Button>
      </div>
    </form>
  );
}
