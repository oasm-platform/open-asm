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
import { Check, ChevronsUpDown, Settings } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

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

  const debouncedSearch = useDebounce(searchQuery, 300);

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

  const configId = preferredProvider?.configId ?? '';

  const { data: models, isLoading } = useAgentsControllerGetProviderModels(
    configId,
    { query: { enabled: !!configId } },
  );

  const updateLLMConfig = useAgentsControllerUpdateLLMConfig();

  const filteredModels = useMemo((): ProviderModelDto[] => {
    const list: ProviderModelDto[] = Array.isArray(models)
      ? models
      : Array.isArray(models?.data)
        ? models.data
        : [];
    if (!debouncedSearch) {
      if (!selectedModel) return list;
      return [...list].sort((a) => (a.id === selectedModel ? -1 : 1));
    }
    const query = debouncedSearch.toLowerCase();
    return list
      .filter((m: ProviderModelDto) => m.name.toLowerCase().includes(query))
      .sort((a) => (a.id === selectedModel ? -1 : 1));
  }, [models, debouncedSearch, selectedModel]);

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
    async (modelId: string) => {
      if (!preferredProvider?.configId) return;

      setIsUpdating(true);
      try {
        await updateLLMConfig.mutateAsync({
          id: preferredProvider.configId,
          data: { model: modelId },
        });

        void queryClient.invalidateQueries({
          queryKey: ['/api/agents/llm-configs'],
        });

        onSelectModel(
          preferredProvider.providerId,
          modelId,
          preferredProvider.configId,
        );

        toast.success('Model updated successfully');
      } catch {
        toast.error('Failed to update model');
      } finally {
        setIsUpdating(false);
        setOpen(false);
        setSearchQuery('');
      }
    },
    [preferredProvider, onSelectModel, updateLLMConfig, queryClient],
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

  const isSelected = selectedProvider === preferredProvider?.providerId;

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
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search models..."
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList className="max-h-[320px]">
            {preferredProvider && filteredModels.length > 0 ? (
              <>
                {filteredModels.map((model) => {
                  const isModelSelected =
                    isSelected && selectedModel === model.id;

                  return (
                    <CommandItem
                      key={model.id}
                      value={`${model.name} ${model.id}`}
                      onSelect={() => handleSelect(model.id)}
                      className="flex items-center gap-2 px-2"
                    >
                      <Image
                        url={preferredProvider.logo}
                        height={16}
                        className="dark:bg-white bg-gray-500 rounded p-0.5 shrink-0"
                      />
                      <span className="truncate flex-1">{model.name}</span>
                      {isModelSelected && (
                        <Check className="h-4 w-4 shrink-0" />
                      )}
                    </CommandItem>
                  );
                })}
                <CommandItem onSelect={handleConnect}>
                  <Settings className="h-4 w-4" />
                  Provider Settings
                </CommandItem>
              </>
            ) : (
              <CommandEmpty>
                {isLoading
                  ? 'Loading models...'
                  : debouncedSearch
                    ? 'No models found'
                    : 'No models available'}
              </CommandEmpty>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
