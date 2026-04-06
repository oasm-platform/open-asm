import type {
  LLMConfigWithProviderDto,
  ProviderModelDto,
} from '@/services/apis/gen/queries';
import {
  useAgentsControllerGetLLMConfigs,
  useAgentsControllerGetProviderModels,
  useAgentsControllerUpdateLLMConfig,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Loader2, Settings } from 'lucide-react';
import { memo, useCallback, useDeferredValue, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from './command';
import Image from './image';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

interface ChatModelSwitcherProps {
  selectedProvider: string | null;
  selectedModel: string | null;
  onSelectModel: (provider: string, model: string, configId: string) => void;
}

interface ModelListProps {
  models: ProviderModelDto[];
  isLoading: boolean;
  searchQuery: string;
  selectedModel: string | null;
  isSelected: boolean;
  activeProviderLogo?: string;
  onSelect: (modelId: string) => void;
  onConnect: () => void;
}

const ModelListItem = memo(
  ({
    model,
    isSelected,
    activeProviderLogo,
    onSelect,
  }: {
    model: ProviderModelDto;
    isSelected: boolean;
    activeProviderLogo?: string;
    onSelect: (id: string) => void;
  }) => (
    <CommandItem
      value={`${model.name} ${model.id}`}
      onSelect={() => onSelect(model.id)}
      className="flex items-center gap-2 px-2"
    >
      <Image
        url={activeProviderLogo}
        height={16}
        className="dark:bg-white bg-gray-500 rounded p-0.5 shrink-0"
      />
      <span className="truncate flex-1">{model.name}</span>
      {isSelected && <Check className="h-4 w-4 shrink-0" />}
    </CommandItem>
  ),
);

ModelListItem.displayName = 'ModelListItem';

const ModelListContent = memo(
  ({
    models,
    isLoading,
    searchQuery,
    selectedModel,
    isSelected,
    activeProviderLogo,
    onSelect,
    onConnect,
  }: ModelListProps) => {
    if (isLoading && models.length === 0) {
      return (
        <CommandEmpty className="py-6 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading models...
        </CommandEmpty>
      );
    }

    return (
      <CommandList className="max-h-[320px]">
        <CommandItem onSelect={onConnect} className="gap-2">
          <Settings className="h-4 w-4" />
          Provider Settings
        </CommandItem>
        {models.length > 0 ? (
          models.map((model) => (
            <ModelListItem
              key={model.id}
              model={model}
              isSelected={isSelected && selectedModel === model.id}
              activeProviderLogo={activeProviderLogo}
              onSelect={onSelect}
            />
          ))
        ) : (
          <CommandEmpty>
            {searchQuery ? 'No models found' : 'No models available'}
          </CommandEmpty>
        )}
      </CommandList>
    );
  },
);

ModelListContent.displayName = 'ModelListContent';

export function ChatModelSwitcher({
  selectedProvider,
  selectedModel,
  onSelectModel,
}: ChatModelSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: providers } =
    useAgentsControllerGetLLMConfigs<LLMConfigWithProviderDto[]>();

  const connectedProviders = useMemo(
    () => (providers ?? []).filter((p) => p.isConnected && p.configId),
    [providers],
  );

  const preferredProvider = useMemo(
    () =>
      connectedProviders.find((p) => p.isPreferred) ?? connectedProviders[0],
    [connectedProviders],
  );

  // Use the currently selected provider's config if available, otherwise fall back to preferred
  const activeProvider = useMemo(
    () =>
      (selectedProvider
        ? connectedProviders.find((p) => p.providerId === selectedProvider)
        : null) ?? preferredProvider,
    [selectedProvider, connectedProviders, preferredProvider],
  );

  const configId = activeProvider?.configId ?? '';

  const { data: models, isLoading } = useAgentsControllerGetProviderModels(
    configId,
    { query: { enabled: !!configId } },
  );

  const updateLLMConfig = useAgentsControllerUpdateLLMConfig();

  const deferredSearch = useDeferredValue(searchQuery);

  const filteredModels = useMemo((): ProviderModelDto[] => {
    const list: ProviderModelDto[] = Array.isArray(models)
      ? models
      : Array.isArray(models?.data)
        ? models.data
        : [];
    if (!deferredSearch) {
      if (!selectedModel) return list;
      return [...list].sort((a) => (a.id === selectedModel ? -1 : 1));
    }
    const query = deferredSearch.toLowerCase();
    return list
      .filter((m: ProviderModelDto) => m.name.toLowerCase().includes(query))
      .sort((a) => (a.id === selectedModel ? -1 : 1));
  }, [models, deferredSearch, selectedModel]);

  const currentDisplay = useMemo(() => {
    if (selectedProvider && selectedModel) {
      const provider = connectedProviders.find(
        (p) => p.providerId === selectedProvider,
      );
      return {
        logo: provider?.logo,
        label: selectedModel,
        providerName: provider?.providerName,
      };
    }
    const preferred = connectedProviders.find((p) => p.isPreferred);
    const fallback = preferred ?? connectedProviders[0];
    if (fallback) {
      return {
        logo: fallback.logo,
        label: fallback.model ?? fallback.providerName,
        providerName: fallback.providerName,
      };
    }
    return null;
  }, [selectedProvider, selectedModel, connectedProviders]);

  const handleSelect = useCallback(
    (modelId: string) => {
      if (!activeProvider?.configId) return;

      // Update UI immediately (optimistic local state)
      onSelectModel(
        activeProvider.providerId,
        modelId,
        activeProvider.configId,
      );
      setOpen(false);
      setSearchQuery('');

      // Send update to backend in background
      setIsUpdating(true);
      updateLLMConfig.mutate(
        {
          id: activeProvider.configId,
          data: { model: modelId },
        },
        {
          onSuccess: () => {
            void queryClient.invalidateQueries({
              queryKey: ['/api/agents/llm-configs'],
            });
            toast.success('Model updated successfully');
          },
          onError: () => {
            toast.error('Failed to sync model preference');
          },
          onSettled: () => {
            setIsUpdating(false);
          },
        },
      );
    },
    [activeProvider, onSelectModel, updateLLMConfig, queryClient],
  );

  const handleConnect = useCallback(() => {
    setOpen(false);
    void navigate('/agents/providers/connect');
  }, [navigate]);

  const handleOpenChange = useCallback((isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setSearchQuery('');
    }
  }, []);

  if (connectedProviders.length === 0) {
    return null;
  }

  const isSelected = selectedProvider === activeProvider?.providerId;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          disabled={isUpdating}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors disabled:opacity-50"
          aria-label="Select model"
        >
          {currentDisplay && (
            <Image
              url={currentDisplay.logo}
              height={16}
              className="dark:bg-white bg-gray-500 rounded p-0.5"
            />
          )}
          <span className="text-muted-foreground max-w-[140px] truncate">
            {currentDisplay?.label ?? 'Select model'}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start" sideOffset={4}>
        <Command shouldFilter={false} className="p-1">
          <CommandInput
            placeholder="Search models..."
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <ModelListContent
            models={filteredModels}
            isLoading={isLoading}
            searchQuery={deferredSearch}
            selectedModel={selectedModel}
            isSelected={isSelected}
            activeProviderLogo={activeProvider?.logo}
            onSelect={handleSelect}
            onConnect={handleConnect}
          />
        </Command>
      </PopoverContent>
    </Popover>
  );
}
