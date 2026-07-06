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

// ─── Schema ────────────────────────────────────────────────────────────────

function getConnectSchema(
  isCustomProvider: boolean,
  isAcceptCustomApiUrl: boolean,
) {
  const requiresApiKey = !isCustomProvider && !isAcceptCustomApiUrl;
  return z
    .object({
      name: z.string().optional(),
      apiUrl: z
        .union([z.literal(''), z.string().url('Invalid URL format')])
        .optional()
        .transform((val) => (val === '' ? undefined : val)),
      apiKey: requiresApiKey
        ? z.string().min(1, 'API key is required')
        : z.string().optional(),
    })
    .refine((data) => requiresApiKey || data.apiUrl || data.apiKey, {
      message: 'API key or URL is required',
    });
}

type ConnectFormData = z.infer<ReturnType<typeof getConnectSchema>>;

// Key used as React key and expand state: configId for existing, providerId for unconnected
function rowKey(item: LLMConfigWithProviderDto): string {
  return item.configId ?? item.providerId;
}

function ModelSelectForm({
  provider,
  onModelChange,
  onDelete,
  onSetPreferred,
  isUpdating,
}: {
  provider: LLMConfigWithProviderDto;
  onModelChange: (configId: string, modelId: string) => Promise<void>;
  onDelete: (configId: string) => void;
  onSetPreferred: (configId: string) => void;
  isUpdating: boolean;
}) {
  const configId = provider.configId ?? '';
  const [selectOpen, setSelectOpen] = useState(false);
  const { data: models, isLoading } = useAgentsControllerGetProviderModels<
    ProviderModelDto[]
  >(configId, { query: { enabled: !!configId, staleTime: 5 * 60 * 1000 } });

  const modelList = models ?? [];
  const currentModel = provider.model;

  const handleSelect = useCallback(
    (modelId: string) => {
      void onModelChange(configId, modelId);
      setSelectOpen(false);
    },
    [configId, onModelChange],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">Model</label>
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
          onClick={() => onSetPreferred(configId)}
          disabled={isUpdating || provider.isPreferred}
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
          {provider.isPreferred ? 'Default' : 'Set as Default'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onDelete(configId)}
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
  onCancel,
  isSubmitting,
}: {
  provider: LLMConfigWithProviderDto;
  onSubmit: (data: ConnectFormData, providerId: string) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const isCustomProvider =
    provider.providerId === LLMConfigWithProviderDtoProviderId.custom;
  const schema = useMemo(
    () =>
      getConnectSchema(
        isCustomProvider,
        provider.isAcceptCustomApiUrl ?? false,
      ),
    [isCustomProvider, provider.isAcceptCustomApiUrl],
  );

  const {
    register,
    handleSubmit: handleFormSubmit,
    formState: { errors },
  } = useForm<ConnectFormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', apiUrl: '', apiKey: '' },
  });

  const isApiKeyOptional = isCustomProvider || provider.isAcceptCustomApiUrl;

  return (
    <form
      onSubmit={handleFormSubmit((data) => onSubmit(data, provider.providerId))}
      className="flex flex-col gap-3"
    >
      <Input
        {...register('name')}
        placeholder="Label (optional, e.g. My Work Key)"
        autoComplete="off"
      />

      {provider.isAcceptCustomApiUrl && (
        <Input
          {...register('apiUrl')}
          type="url"
          placeholder="https://api.myprovider.com/v1"
          autoComplete="off"
          error={errors.apiUrl?.message}
        />
      )}

      <Input
        {...register('apiKey')}
        type="password"
        placeholder={
          isApiKeyOptional ? 'Optional API key' : 'Enter your API key'
        }
        autoComplete="new-password"
        error={errors.apiKey?.message}
      />

      <div className="flex justify-between items-center gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? 'Connecting...' : 'Connect'}
        </Button>
      </div>
    </form>
  );
}

const ALL_PROVIDERS = Object.values(
  LLMConfigWithProviderDtoProviderId,
) as string[];

function AddConfigPanel({
  providersList,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  providersList: LLMConfigWithProviderDto[];
  onSubmit: (data: ConnectFormData, providerId: string) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [selectedProviderId, setSelectedProviderId] = useState<string>(
    ALL_PROVIDERS[0] ?? '',
  );

  // Find the provider entry (connected or unconnected) to get metadata
  const providerEntry = useMemo(
    () =>
      providersList.find(
        (p) => p.providerId === selectedProviderId && !p.isConnected,
      ) ??
      providersList.find((p) => p.providerId === selectedProviderId) ?? {
        providerId:
          selectedProviderId as LLMConfigWithProviderDto['providerId'],
        providerName: selectedProviderId,
        isConnected: false,
        isAcceptCustomApiUrl: false,
      },
    [providersList, selectedProviderId],
  );

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="p-3 border-b bg-muted/30">
        <p className="text-sm font-medium mb-2">Connect provider</p>
        <div className="flex flex-wrap gap-1.5">
          {ALL_PROVIDERS.map((pid) => {
            const meta = providersList.find((p) => p.providerId === pid);
            return (
              <button
                key={pid}
                type="button"
                onClick={() => setSelectedProviderId(pid)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border transition-colors',
                  selectedProviderId === pid
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border hover:bg-accent',
                )}
              >
                {meta?.logo && (
                  <span className="inline-flex size-3.5 items-center justify-center rounded bg-white/10">
                    <Image width={12} height={12} url={meta.logo} />
                  </span>
                )}
                {meta?.providerName ?? pid}
              </button>
            );
          })}
        </div>
      </div>
      <div className="p-3">
        <ConnectForm
          provider={providerEntry}
          onSubmit={onSubmit}
          onCancel={onCancel}
          isSubmitting={isSubmitting}
        />
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function LlmConnect() {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const queryClient = useQueryClient();

  const { data: providers, isLoading } =
    useAgentsControllerGetLLMConfigs<LLMConfigWithProviderDto[]>();

  const providersList = providers ?? [];
  const connectedConfigs = providersList.filter((p) => p.isConnected);

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

  const handleSetPreferred = async (configId: string) => {
    setIsSubmitting(true);
    try {
      await setPreferredLLMConfig.mutateAsync({ id: configId });
      invalidate();
      toast.success('Default model updated');
    } catch {
      toast.error('Failed to set default model');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleModelChange = async (configId: string, modelId: string) => {
    setIsSubmitting(true);
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
      setIsSubmitting(false);
    }
  };

  const handleConnect = async (data: ConnectFormData, providerId: string) => {
    const hasApiKey = data.apiKey?.trim();
    const hasApiUrl = data.apiUrl?.trim();
    if (!hasApiUrl && !hasApiKey) return;

    setIsSubmitting(true);
    try {
      await createLLMConfig.mutateAsync({
        data: {
          provider: providerId as CreateLLMConfigDtoProvider,
          name: data.name?.trim() || undefined,
          apiKey: hasApiKey || '',
          apiUrl: hasApiUrl || undefined,
        },
      });
      invalidate();
      setShowAddPanel(false);
      toast.success('Provider connected successfully');
    } catch (err) {
      const axiosError = err as AxiosError<{ message: string | string[] }>;
      const raw = axiosError.response?.data?.message;
      const message = Array.isArray(raw)
        ? raw.join(', ')
        : (raw ?? 'Failed to connect provider');
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (configId: string) => {
    await deleteLLMConfig.mutateAsync(
      { id: configId },
      {
        onSuccess: () => {
          toast.success('Disconnected successfully');
          invalidate();
          setExpandedKey(null);
        },
        onError: () => toast.error('Failed to disconnect'),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Connected configs */}
      {connectedConfigs.map((item) => {
        const key = rowKey(item);
        const isExpanded = expandedKey === key;

        return (
          <div key={key} className="rounded-lg border bg-card overflow-hidden">
            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-9 h-9 rounded-md bg-white shrink-0">
                  <Image width={24} height={24} url={item.logo} />
                </div>
                <div className="flex flex-col justify-start items-start">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-foreground">
                      {item.providerName}
                    </span>
                    {item.isPreferred && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 font-medium leading-none">
                        default
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {item.name ? `${item.name} · ` : ''}
                    {item.model ?? ''}
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExpandedKey(isExpanded ? null : key)}
                className="gap-1 border border-green-600 text-green-600 hover:bg-green-50"
              >
                <Check size={16} />
                Connected
                {isExpanded ? (
                  <ChevronUp size={16} />
                ) : (
                  <ChevronDown size={16} />
                )}
              </Button>
            </div>

            {isExpanded && (
              <div className="border-t p-4 flex flex-col gap-3 bg-muted/30">
                <ModelSelectForm
                  provider={item}
                  onModelChange={handleModelChange}
                  onDelete={handleDelete}
                  onSetPreferred={handleSetPreferred}
                  isUpdating={isSubmitting}
                />
              </div>
            )}
          </div>
        );
      })}

      <div className="flex justify-center items-center w-full">
        {/* Add new config panel */}
        {showAddPanel ? (
          <AddConfigPanel
            providersList={providersList}
            onSubmit={handleConnect}
            onCancel={() => setShowAddPanel(false)}
            isSubmitting={isSubmitting}
          />
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddPanel(true)}
            className="gap-2 self-start"
          >
            <PlugZap size={16} />
            Connect provider
          </Button>
        )}
      </div>
    </div>
  );
}
