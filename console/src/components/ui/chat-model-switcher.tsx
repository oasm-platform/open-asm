import { AgentSettingsDialog } from '@/components/agent-settings-dialog';
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
  /** configId of the currently selected LLM config */
  selectedConfigId: string | null;
  selectedModel: string | null;
  onSelectModel: (provider: string, model: string, configId: string) => void;
}

interface ModelListProps {
  models: ProviderModelDto[];
  isLoading: boolean;
  searchQuery: string;
  selectedModel: string | null;
  isActiveConfig: boolean;
  activeProviderLogo?: string;
  onSelect: (modelId: string) => void;
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
        className="bg-white rounded p-0.5 shrink-0"
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
    isActiveConfig,
    activeProviderLogo,
    onSelect,
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
      <CommandList className="max-h-80">
        {models.length > 0 ? (
          models.map((model) => (
            <ModelListItem
              key={model.id}
              model={model}
              isSelected={isActiveConfig && selectedModel === model.id}
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
  selectedConfigId,
  selectedModel,
  onSelectModel,
}: ChatModelSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const queryClient = useQueryClient();

  const { data: providers } =
    useAgentsControllerGetLLMConfigs<LLMConfigWithProviderDto[]>();

  const connectedConfigs = useMemo(
    () => (providers ?? []).filter((p) => p.isConnected && p.configId),
    [providers],
  );

  const preferredConfig = useMemo(
    () => connectedConfigs.find((p) => p.isPreferred) ?? connectedConfigs[0],
    [connectedConfigs],
  );

  // Active config: the selected one by configId, or fall back to preferred
  const activeConfig = useMemo(
    () =>
      (selectedConfigId
        ? connectedConfigs.find((p) => p.configId === selectedConfigId)
        : null) ?? preferredConfig,
    [selectedConfigId, connectedConfigs, preferredConfig],
  );

  const configId = activeConfig?.configId ?? '';

  const { data: models, isLoading } = useAgentsControllerGetProviderModels(
    configId,
    { query: { enabled: !!configId } },
  );

  const updateLLMConfig = useAgentsControllerUpdateLLMConfig();
  const deferredSearch = useDeferredValue(searchQuery);

  const filteredModels = useMemo((): ProviderModelDto[] => {
    const list: ProviderModelDto[] = Array.isArray(models) ? models : [];
    if (!deferredSearch) {
      if (!selectedModel) return list;
      return [...list].sort((a) => (a.id === selectedModel ? -1 : 1));
    }
    const query = deferredSearch.toLowerCase();
    return list
      .filter((m) => m.name.toLowerCase().includes(query))
      .sort((a) => (a.id === selectedModel ? -1 : 1));
  }, [models, deferredSearch, selectedModel]);

  const currentDisplay = useMemo(() => {
    if (activeConfig) {
      const label =
        selectedModel && activeConfig.configId === selectedConfigId
          ? selectedModel
          : (activeConfig.model ?? activeConfig.providerName);
      return {
        logo: activeConfig.logo,
        label,
        providerName: activeConfig.providerName,
      };
    }
    return null;
  }, [activeConfig, selectedConfigId, selectedModel]);

  const handleSelect = useCallback(
    (modelId: string) => {
      if (!activeConfig?.configId) return;

      onSelectModel(activeConfig.providerId, modelId, activeConfig.configId);
      setOpen(false);
      setSearchQuery('');

      setIsUpdating(true);
      updateLLMConfig.mutate(
        { id: activeConfig.configId, data: { model: modelId } },
        {
          onSuccess: () => {
            void queryClient.invalidateQueries({
              queryKey: ['/api/agents/llm-configs'],
            });
            toast.success('Model updated');
          },
          onError: () => toast.error('Failed to sync model preference'),
          onSettled: () => setIsUpdating(false),
        },
      );
    },
    [activeConfig, onSelectModel, updateLLMConfig, queryClient],
  );

  const handleOpenChange = useCallback((isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) setSearchQuery('');
  }, []);

  const isActiveConfig = activeConfig?.configId === selectedConfigId;

  if (connectedConfigs.length === 0) {
    return (
      <>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors text-muted-foreground"
        >
          <Settings className="h-3.5 w-3.5" />
          Connect LLM
        </button>
        <AgentSettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <div className="hidden md:block">
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
                    className="bg-white rounded p-0.5"
                  />
                )}
                <span className="text-muted-foreground max-w-[140px] truncate">
                  {currentDisplay?.label ?? 'Select model'}
                </span>
                <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[280px] p-0"
              align="start"
              sideOffset={4}
            >
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
                  isActiveConfig={isActiveConfig}
                  activeProviderLogo={activeConfig?.logo}
                  onSelect={handleSelect}
                />
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="flex items-center gap-1.5 rounded-md p-1.5 text-sm hover:bg-accent transition-colors text-muted-foreground"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
      </div>
      <AgentSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
