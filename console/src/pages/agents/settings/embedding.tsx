import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAgentsControllerGetEmbeddingProviders,
  useAgentsControllerCreateEmbeddingConfig,
  useAgentsControllerUpdateEmbeddingConfig,
  useAgentsControllerDeleteEmbeddingConfig,
  useAgentsControllerSetPreferredEmbeddingConfig,
  getAgentsControllerGetEmbeddingProvidersQueryKey,
  type EmbeddingProviderStatusDto,
  type EmbeddingConfigResponseDto,
  type CreateEmbeddingConfigDto,
  type UpdateEmbeddingConfigDto,
  type EmbeddingModelInfoDto,
} from '@/services/apis/gen/queries';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import Image from '@/components/ui/image';
import { toast } from 'sonner';
import {
  Check,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Plus,
  Star,
  Unplug,
} from 'lucide-react';
import type { AxiosError } from 'axios';
import { cn } from '@/lib/utils';

// ─── ModelSelect ──────────────────────────────────────────────────────────────

function ModelSelect({
  models,
  value,
  onChange,
  disabled,
  placeholder = 'Select a model',
}: {
  models: EmbeddingModelInfoDto[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = models.find((m) => m.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          disabled={disabled}
          className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 flex items-center justify-between"
        >
          <span className="truncate">
            {selected
              ? `${selected.name} (${selected.dimensions}d)`
              : placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0" align="start" sideOffset={4}>
        <Command>
          <CommandInput placeholder="Search models..." />
          <CommandList className="max-h-[280px]">
            <CommandEmpty>No models found</CommandEmpty>
            {models.map((m) => (
              <CommandItem
                key={m.id}
                value={m.name}
                onSelect={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
                className="flex items-center gap-2 px-2"
              >
                <span className="flex-1 truncate">
                  {m.name}
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    ({m.dimensions}d)
                  </span>
                </span>
                {value === m.id && <Check className="h-4 w-4 shrink-0" />}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── ConfigPanel ──────────────────────────────────────────────────────────────

function ConfigPanel({
  provider,
  config,
  onDelete,
  onSetPreferred,
  isUpdating,
}: {
  provider: EmbeddingProviderStatusDto;
  config: EmbeddingConfigResponseDto;
  onDelete: (id: string) => void;
  onSetPreferred: (id: string) => void;
  isUpdating: boolean;
}) {
  const qc = useQueryClient();
  // local state for custom model editing (save on blur)
  const [customModel, setCustomModel] = useState(config.model);
  const [apiKey, setApiKey] = useState('');

  const { mutateAsync: updateConfig, isPending: isSaving } =
    useAgentsControllerUpdateEmbeddingConfig({
      mutation: {
        onSuccess: () => {
          void qc.invalidateQueries({
            queryKey: getAgentsControllerGetEmbeddingProvidersQueryKey(),
          });
        },
      },
    });

  const isCustom = provider.id === 'custom';

  const saveModel = async (modelId: string) => {
    if (modelId === config.model) return;
    try {
      await updateConfig({
        id: config.id,
        data: { model: modelId } as UpdateEmbeddingConfigDto,
      });
      toast.success('Model updated');
    } catch {
      toast.error('Failed to update model');
    }
  };

  const saveApiKey = async () => {
    if (!apiKey) return;
    try {
      await updateConfig({
        id: config.id,
        data: { apiKey } as UpdateEmbeddingConfigDto,
      });
      toast.success('API key updated');
      setApiKey('');
    } catch {
      toast.error('Failed to update API key');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <div>
          <span className="text-xs text-muted-foreground">API Key</span>
          <p className="font-mono text-xs mt-0.5">{config.apiKeyMasked}</p>
        </div>
        {config.apiUrl && (
          <div>
            <span className="text-xs text-muted-foreground">Base URL</span>
            <p className="font-mono text-xs mt-0.5 truncate">{config.apiUrl}</p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">Model</label>
        {isCustom ? (
          <Input
            value={customModel}
            onChange={(e) => setCustomModel(e.target.value)}
            onBlur={() => void saveModel(customModel)}
            disabled={isSaving || isUpdating}
            placeholder="e.g. nomic-embed-text"
          />
        ) : (
          <ModelSelect
            models={provider.models}
            value={config.model}
            onChange={(id) => void saveModel(id)}
            disabled={isSaving || isUpdating}
          />
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">
          New API Key
          <span className="ml-1 font-normal text-muted-foreground text-xs">
            (leave blank to keep current)
          </span>
        </label>
        <div className="flex gap-2">
          <Input
            type="password"
            placeholder="••••••••"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="new-password"
            className="flex-1"
          />
          {apiKey && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void saveApiKey()}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onSetPreferred(config.id)}
          disabled={isUpdating || config.isPreferred}
          className={cn(
            'gap-2',
            config.isPreferred && 'border-yellow-500 text-yellow-600',
          )}
        >
          <Star
            size={16}
            className={
              config.isPreferred
                ? 'fill-yellow-500 text-yellow-500'
                : 'text-muted-foreground'
            }
          />
          {config.isPreferred ? 'Default' : 'Set as Default'}
        </Button>
        <ConfirmDialog
          title="Disconnect embedding provider"
          description={`Remove ${provider.name} embedding config? This cannot be undone.`}
          onConfirm={() => onDelete(config.id)}
          trigger={
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isUpdating}
              className="gap-2"
            >
              <Unplug size={16} />
              Disconnect
            </Button>
          }
        />
      </div>
    </div>
  );
}

// ─── ConnectFormWrapper ───────────────────────────────────────────────────────

function ConnectFormWrapper({
  provider,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  provider: EmbeddingProviderStatusDto;
  onSubmit: (
    provider: EmbeddingProviderStatusDto,
    data: { name: string; apiKey: string; model: string; apiUrl: string },
  ) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(provider.models[0]?.id ?? '');
  const [customModel, setCustomModel] = useState('');
  const [apiUrl, setApiUrl] = useState('');

  const isCustom = provider.id === 'custom';
  const effectiveModel = isCustom ? customModel : model;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(provider, { name, apiKey, model: effectiveModel, apiUrl });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Input
        placeholder="Label (optional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoComplete="off"
      />

      {provider.isAcceptCustomApiUrl && (
        <Input
          type="url"
          placeholder="https://api.example.com/v1"
          value={apiUrl}
          onChange={(e) => setApiUrl(e.target.value)}
          autoComplete="off"
        />
      )}

      <Input
        type="password"
        placeholder="Enter your API key"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        autoComplete="new-password"
      />

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">Model</label>
        {isCustom ? (
          <Input
            placeholder="nomic-embed-text"
            value={customModel}
            onChange={(e) => setCustomModel(e.target.value)}
          />
        ) : (
          <ModelSelect
            models={provider.models}
            value={model}
            onChange={setModel}
          />
        )}
      </div>

      <div className="flex justify-between items-center gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={isSubmitting || (!effectiveModel && !isCustom)}
        >
          {isSubmitting ? 'Connecting...' : 'Connect'}
        </Button>
      </div>
    </form>
  );
}

// ─── EmbeddingConnect ─────────────────────────────────────────────────────────

function EmbeddingConnect() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [addingProvider, setAddingProvider] =
    useState<EmbeddingProviderStatusDto | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const queryClient = useQueryClient();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();

  const { data: providersRaw, isLoading } =
    useAgentsControllerGetEmbeddingProviders({
      query: { enabled: !!selectedWorkspaceId },
    });

  const providers: EmbeddingProviderStatusDto[] =
    (providersRaw as unknown as { data?: EmbeddingProviderStatusDto[] })
      ?.data ?? (Array.isArray(providersRaw) ? providersRaw : []);

  const connectedProviders = providers.filter((p) => p.isConnected);
  const unconnectedProviders = providers.filter((p) => !p.isConnected);

  const { mutateAsync: createConfig } =
    useAgentsControllerCreateEmbeddingConfig();
  const { mutateAsync: deleteConfig } =
    useAgentsControllerDeleteEmbeddingConfig();
  const { mutateAsync: setPreferred } =
    useAgentsControllerSetPreferredEmbeddingConfig();

  const invalidate = useCallback(
    () =>
      void queryClient.invalidateQueries({
        queryKey: getAgentsControllerGetEmbeddingProvidersQueryKey(),
      }),
    [queryClient],
  );

  const handleConnect = async (
    provider: EmbeddingProviderStatusDto,
    formData: { name: string; apiKey: string; model: string; apiUrl: string },
  ) => {
    setIsSubmitting(true);
    try {
      await createConfig({
        data: {
          provider: provider.id as CreateEmbeddingConfigDto['provider'],
          name: formData.name || undefined,
          apiKey: formData.apiKey,
          model: formData.model || undefined,
          apiUrl: formData.apiUrl || undefined,
        },
      });
      invalidate();
      setShowAddPanel(false);
      toast.success(`${provider.name} connected`);
    } catch (err) {
      const msg = (err as AxiosError<{ message?: string }>).response?.data
        ?.message;
      toast.error(msg ?? 'Failed to connect');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setIsSubmitting(true);
    try {
      await deleteConfig({ id });
      invalidate();
      setExpandedId(null);
      toast.success('Disconnected successfully');
    } catch {
      toast.error('Failed to disconnect');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetPreferred = async (id: string) => {
    setIsSubmitting(true);
    try {
      await setPreferred({ id });
      invalidate();
      toast.success('Default embedding updated');
    } catch {
      toast.error('Failed to set default');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleShowAdd = () => {
    setAddingProvider(unconnectedProviders[0] ?? providers[0] ?? null);
    setShowAddPanel(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Embedding Providers</h3>
          <p className="text-sm text-muted-foreground">
            Configure embedding models for semantic search and skill retrieval.
          </p>
        </div>
        {!showAddPanel && (
          <Button
            variant="outline"
            size="sm"
            className="border-dashed"
            onClick={handleShowAdd}
            disabled={unconnectedProviders.length === 0}
          >
            <Plus className="mr-2 h-4 w-4" />
            Connect provider
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-2">
      {connectedProviders.map((provider) => {
        const config = provider.config!;
        const isExpanded = expandedId === provider.id;

        return (
          <div
            key={provider.id}
            className="rounded-lg border bg-card overflow-hidden"
          >
            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-9 h-9 rounded-md bg-white shrink-0">
                  <Image width={24} height={24} url={provider.logo} />
                </div>
                <div className="flex flex-col justify-start items-start">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-foreground">
                      {provider.name}
                    </span>
                    {config.isPreferred && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 font-medium leading-none">
                        default
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {config.name ? `${config.name} · ` : ''}
                    {config.model}
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setExpandedId(isExpanded ? null : provider.id)
                }
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
                <ConfigPanel
                  provider={provider}
                  config={config}
                  onDelete={handleDelete}
                  onSetPreferred={handleSetPreferred}
                  isUpdating={isSubmitting}
                />
              </div>
            )}
          </div>
        );
      })}

      {showAddPanel && addingProvider && (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="p-3 border-b bg-muted/30">
            <p className="text-sm font-medium mb-2">Connect provider</p>
            <div className="flex flex-wrap gap-1.5">
              {unconnectedProviders.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setAddingProvider(p)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border transition-colors',
                    addingProvider.id === p.id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border hover:bg-accent',
                  )}
                >
                  {p.logo && (
                    <span className="inline-flex size-3.5 items-center justify-center rounded bg-white/10">
                      <Image width={12} height={12} url={p.logo} />
                    </span>
                  )}
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          <div className="p-3">
            <ConnectFormWrapper
              key={addingProvider.id}
              provider={addingProvider}
              onSubmit={handleConnect}
              onCancel={() => setShowAddPanel(false)}
              isSubmitting={isSubmitting}
            />
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AgentSettingsEmbedding() {
  return (
    <EmbeddingConnect />
  );
}
