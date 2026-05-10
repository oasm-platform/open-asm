import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type {
  LLMConfigWithProviderDto,
  ProviderModelDto,
} from '@/services/apis/gen/queries';
import {
  CreateLLMConfigDtoProvider,
  LLMConfigWithProviderDtoProviderId,
  useAgentsControllerCreateLLMConfig,
  useAgentsControllerDeleteLLMConfig,
  useAgentsControllerGetLLMConfigs,
  useAgentsControllerGetProviderModels,
  useAgentsControllerSetPreferredLLMConfig,
  useAgentsControllerUpdateLLMConfig,
} from '@/services/apis/gen/queries';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import {
  Check,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  PlugZap,
  Star,
  Unplug,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from './ui/command';
import Image from './ui/image';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';



function getConnectSchema(
  isCustomProvider: boolean,
  isAcceptCustomApiUrl: boolean,
) {
  const requiresApiKey = !isCustomProvider && !isAcceptCustomApiUrl;

  return z
    .object({
      apiUrl: z.string().url('Invalid URL format').optional(),
      apiKey: requiresApiKey
        ? z.string().min(1, 'API key is required')
        : z.string().optional(),
    })
    .refine((data) => requiresApiKey || data.apiUrl || data.apiKey, {
      message: 'API key or URL is required',
    });
}

type ConnectFormData = z.infer<ReturnType<typeof getConnectSchema>>;

export default function LlmConnect() {
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const queryClient = useQueryClient();

  const { data: providers, isLoading } =
    useAgentsControllerGetLLMConfigs<LLMConfigWithProviderDto[]>();

  const providersList = providers ?? [];

  const createLLMConfig = useAgentsControllerCreateLLMConfig({
    mutation: {
      onError: (error: AxiosError<{ message: string }>) => {
        toast.error(
          error.response?.data.message || 'Failed to connect provider',
        );
      },
    },
  });
  const updateLLMConfig = useAgentsControllerUpdateLLMConfig();
  const deleteLLMConfig = useAgentsControllerDeleteLLMConfig();
  const setPreferredLLMConfig = useAgentsControllerSetPreferredLLMConfig();

  const handleSetPreferred = async (providerId: string) => {
    const provider = providersList.find((p) => p.providerId === providerId);
    if (!provider?.configId) return;

    setIsSubmitting(true);
    try {
      await setPreferredLLMConfig.mutateAsync({ id: provider.configId });
      void queryClient.invalidateQueries({
        queryKey: ['/api/agents/llm-configs'],
      });
      toast.success('Preferred model set successfully');
    } catch {
      toast.error('Failed to set preferred model');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleExpand = (providerId: string) => {
    setExpandedProvider(expandedProvider === providerId ? null : providerId);
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
    } catch {
      toast.error('Failed to update model');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (data: ConnectFormData, providerId: string) => {
    const hasApiKey = data.apiKey?.trim();
    const hasApiUrl = data.apiUrl?.trim();

    if (!hasApiUrl && !hasApiKey) return;

    setIsSubmitting(true);
    try {
      await createLLMConfig.mutateAsync({
        data: {
          provider: providerId as CreateLLMConfigDtoProvider,
          apiKey: hasApiKey || '',
          apiUrl: hasApiUrl || undefined,
        },
      });

      void queryClient.invalidateQueries({
        queryKey: ['/api/agents/llm-configs'],
      });

      setExpandedProvider(null);
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
                    onSetPreferred={() =>
                      handleSetPreferred(provider.providerId)
                    }
                    isUpdating={isSubmitting}
                  />
                ) : (
                  <ConnectForm
                    provider={provider}
                    onSubmit={handleSubmit}
                    isSubmitting={isSubmitting}
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
  onSetPreferred,
  isUpdating,
}: {
  provider: LLMConfigWithProviderDto;
  onModelChange: (providerId: string, modelId: string) => Promise<void>;
  onDelete: () => void;
  onSetPreferred: () => void;
  isUpdating: boolean;
}) {
  const configId = provider.configId ?? '';
  const [selectOpen, setSelectOpen] = useState(false);
  const { data: models, isLoading } = useAgentsControllerGetProviderModels<
    ProviderModelDto[]
  >(configId, {
    query: {
      enabled: !!provider.configId,
      staleTime: 5 * 60 * 1000,
    },
  });

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
          onClick={onSetPreferred}
          disabled={isUpdating}
          className={cn(
            'gap-2',
            provider.isPreferred && 'border-yellow-500 text-yellow-600',
          )}
        >
          <Star
            size={16}
            className={
              provider.isPreferred
                ? 'fill-yellow-500 text-yellow-500'
                : 'text-muted-foreground'
            }
          />
          {provider.isPreferred ? 'Preferred' : 'Set Preferred'}
        </Button>
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
  onSubmit,
  isSubmitting,
}: {
  provider: LLMConfigWithProviderDto;
  onSubmit: (data: ConnectFormData, providerId: string) => void;
  isSubmitting: boolean;
}) {
  const isCustomProvider =
    provider.providerId === LLMConfigWithProviderDtoProviderId.custom;
  const schema = useMemo(
    () => getConnectSchema(isCustomProvider, provider.isAcceptCustomApiUrl),
    [isCustomProvider, provider.isAcceptCustomApiUrl],
  );

  const {
    register,
    handleSubmit: handleFormSubmit,
    formState: { errors },
  } = useForm<ConnectFormData>({
    resolver: zodResolver(schema),
    defaultValues: { apiUrl: '', apiKey: '' },
  });

  const isApiKeyOptional = isCustomProvider || provider.isAcceptCustomApiUrl;

  return (
    <form
      onSubmit={handleFormSubmit((data) => onSubmit(data, provider.providerId))}
      className="flex flex-col gap-3"
    >
      {provider.isAcceptCustomApiUrl && (
        <div className="flex flex-col gap-1.5">
          <Input
            {...register('apiUrl')}
            type="url"
            placeholder="https://api.myprovider.com/v1"
            autoComplete="off"
            error={errors.apiUrl?.message}
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Input
          {...register('apiKey')}
          type="password"
          placeholder={
            isApiKeyOptional ? 'Optional API key' : 'Enter your API key'
          }
          autoComplete="new-password"
          error={errors.apiKey?.message}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? 'Connecting...' : 'Connect'}
        </Button>
      </div>
    </form>
  );
}
