import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type {
  LLMConfigWithProviderDto,
  ProviderModelDto,
} from '@/services/apis/gen/queries';
import { useAgentsControllerGetProviderModels } from '@/services/apis/gen/queries';
import { Check, ChevronsUpDown, Star, Unplug } from 'lucide-react';
import { useCallback, useState } from 'react';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export function ModelSelectForm({
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
