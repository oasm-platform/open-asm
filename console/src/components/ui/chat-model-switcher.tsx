import { axiosInstance } from '@/services/apis/axios-client';
import type { LLMConfigWithProviderDto } from '@/services/apis/gen/queries';
import { useAgentsControllerGetLLMConfigs } from '@/services/apis/gen/queries';
import { useQueries } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Settings } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from './command';
import Image from './image';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

interface ProviderModel {
  id: string;
  name: string;
}

interface ChatModelSwitcherProps {
  selectedProvider: string | null;
  selectedModel: string | null;
  onSelectModel: (provider: string, model: string, configId: string) => void;
}

export function ChatModelSwitcher({
  selectedProvider,
  selectedModel,
  onSelectModel,
}: ChatModelSwitcherProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const { data: providers } =
    useAgentsControllerGetLLMConfigs<LLMConfigWithProviderDto[]>();

  const connectedProviders = useMemo(
    () => (providers ?? []).filter((p) => p.isConnected && p.configId),
    [providers],
  );

  // Fetch models for each connected provider
  const modelQueries = useQueries({
    queries: connectedProviders.map((p) => ({
      queryKey: ['/api/agents/llm-configs', p.configId, 'models'] as const,
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const response = await axiosInstance.get<ProviderModel[]>(
          `/api/agents/llm-configs/${p.configId}/models`,
          { signal },
        );
        return response.data ?? [];
      },
      enabled: !!p.configId,
      staleTime: 5 * 60 * 1000,
    })),
  });

  const providerModelsMap = useMemo(() => {
    const map = new Map<string, ProviderModel[]>();
    connectedProviders.forEach((provider, index) => {
      const query = modelQueries[index];
      if (query?.data && query.data.length > 0) {
        map.set(provider.providerId, query.data);
      } else if (provider.model) {
        // Fallback: show the configured model
        map.set(provider.providerId, [
          { id: provider.model, name: provider.model },
        ]);
      }
    });
    return map;
  }, [connectedProviders, modelQueries]);

  const isLoading = modelQueries.some((q) => q.isLoading);

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
    // Show preferred or first connected
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
    (providerId: string, modelId: string) => {
      const provider = connectedProviders.find(
        (p) => p.providerId === providerId,
      );
      if (provider?.configId) {
        onSelectModel(providerId, modelId, provider.configId);
      }
      setOpen(false);
    },
    [connectedProviders, onSelectModel],
  );

  const handleConnect = useCallback(() => {
    setOpen(false);
    void navigate('/agents/providers/connect');
  }, [navigate]);

  if (connectedProviders.length === 0) {
    return null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
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
        <Command>
          <CommandInput placeholder="Search models..." />
          <CommandList className="max-h-[320px]">
            <CommandEmpty>
              {isLoading ? 'Loading models...' : 'No models found'}
            </CommandEmpty>
            {connectedProviders.map((provider) => {
              const models = providerModelsMap.get(provider.providerId) ?? [];
              if (models.length === 0) return null;

              return (
                <CommandGroup
                  key={provider.providerId}
                  heading={provider.providerName}
                >
                  {models.map((model) => {
                    const isSelected =
                      selectedProvider === provider.providerId &&
                      selectedModel === model.id;

                    return (
                      <CommandItem
                        key={`${provider.providerId}:${model.id}`}
                        value={`${provider.providerName} ${model.name}`}
                        onSelect={() =>
                          handleSelect(provider.providerId, model.id)
                        }
                        className="flex items-center gap-2"
                      >
                        <Image
                          url={provider.logo}
                          height={16}
                          className="dark:bg-white bg-gray-500 rounded p-0.5 shrink-0"
                        />
                        <span className="truncate flex-1">{model.name}</span>
                        {isSelected && <Check className="h-4 w-4 shrink-0" />}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              );
            })}
            <CommandSeparator />
            <CommandGroup>
              <CommandItem onSelect={handleConnect}>
                <Settings className="mr-2 h-4 w-4" />
                Provider Settings
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
