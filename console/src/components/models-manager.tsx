import { Button } from '@/components/ui/button';
import Image from '@/components/ui/image';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLLMConfigs } from '@/hooks/use-llm-configs';
import { useAgentSettingsDialog } from '@/hooks/useAgentSettingsDialog';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import {
  AgentModelRefDtoReasoningEffort,
  getAgentsControllerGetAgentConfigQueryKey,
  getAgentsControllerGetConnectedProvidersQueryKey,
  getAgentsControllerGetProviderModelsQueryOptions,
  useAgentsControllerGetAgentConfig,
  useAgentsControllerUpsertAgentConfig,
  type AgentModelRefDto,
  type AgentModelsConfigDto,
  type LLMConfigWithProviderDto,
  type ProviderModelDto,
} from '@/services/apis/gen/queries';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { defaultFilter } from 'cmdk';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

type ModelRef = AgentModelRefDto;
type Effort = AgentModelRefDto['reasoningEffort'];

/** Radix Select cannot hold an empty value, so "not set" gets a token. */
const EFFORT_UNSET = 'unset';

const EFFORT_OPTIONS: Array<{ value: NonNullable<Effort>; label: string }> = [
  { value: AgentModelRefDtoReasoningEffort.low, label: 'Low' },
  { value: AgentModelRefDtoReasoningEffort.medium, label: 'Medium' },
  { value: AgentModelRefDtoReasoningEffort.high, label: 'High' },
];

/**
 * The ref to save when the user picks `picked`. Picking the same model keeps
 * its limits; another model drops them (they were set for the old one) but
 * keeps the reasoning effort.
 */
function nextRef(
  previous: ModelRef | undefined,
  picked: { llmConfigId: string; model: string } | null,
): ModelRef | undefined {
  if (!picked) return undefined;
  if (
    previous?.llmConfigId === picked.llmConfigId &&
    previous.model === picked.model
  ) {
    return previous;
  }
  return previous?.reasoningEffort
    ? { ...picked, reasoningEffort: previous.reasoningEffort }
    : picked;
}

function connectionLabel(connection: LLMConfigWithProviderDto): string {
  return connection.name
    ? `${connection.providerName} · ${connection.name}`
    : connection.providerName;
}

/**
 * Item values carry the connection id to stay unique; search only the
 * keywords, or a query like "4" matches every UUID.
 */
const filterByKeywords = (_value: string, search: string, keywords?: string[]) =>
  defaultFilter(keywords?.join(' ') ?? '', search);

function ModelPicker({
  label,
  value,
  connections,
  unsetLabel,
  placeholder = 'Select model',
  onChange,
}: {
  label: string;
  value: ModelRef | undefined;
  connections: LLMConfigWithProviderDto[];
  /** Offers a "not set" choice with this label; omit to require a model. */
  unsetLabel?: string;
  /** Shown when no model is set and there is no "not set" choice. */
  placeholder?: string;
  onChange: (picked: { llmConfigId: string; model: string } | null) => void;
}) {
  const [open, setOpen] = useState(false);

  // Model lists load only once the picker opens
  const results = useQueries({
    queries: connections.map((c) =>
      getAgentsControllerGetProviderModelsQueryOptions(c.configId ?? '', {
        query: { enabled: open && !!c.configId },
      }),
    ),
  });
  const loading = results.some((r) => r.isLoading);

  const current = connections.find((c) => c.configId === value?.llmConfigId);

  const pick = (picked: { llmConfigId: string; model: string } | null) => {
    setOpen(false);
    onChange(picked);
  };

  return (
    // Modal: inside the settings dialog, a non-modal popover cannot scroll
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          className="max-w-[18rem] gap-2 font-normal"
        >
          {current?.logo && (
            <Image
              url={current.logo}
              width={16}
              height={16}
              className="shrink-0 rounded bg-white p-0.5"
            />
          )}
          <span className="truncate">
            {value?.model ?? unsetLabel ?? placeholder}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <Command filter={filterByKeywords}>
          <CommandInput placeholder="Search models..." />
          <CommandList>
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading models...
              </div>
            ) : (
              <CommandEmpty>No models found</CommandEmpty>
            )}
            {unsetLabel && (
              <CommandGroup>
                <CommandItem
                  value={unsetLabel}
                  keywords={[unsetLabel]}
                  onSelect={() => pick(null)}
                >
                  <span className="flex-1 truncate">{unsetLabel}</span>
                  {!value && <Check className="size-4" />}
                </CommandItem>
              </CommandGroup>
            )}
            {connections.map((connection, i) => {
              const models: ProviderModelDto[] = Array.isArray(results[i]?.data)
                ? results[i].data
                : [];
              const configId = connection.configId ?? '';
              return (
                <CommandGroup
                  key={configId}
                  heading={connectionLabel(connection)}
                >
                  {models.map((model) => (
                    <CommandItem
                      key={model.id}
                      value={`${configId} ${model.id}`}
                      keywords={[model.id, model.name]}
                      onSelect={() =>
                        pick({ llmConfigId: configId, model: model.id })
                      }
                    >
                      <span className="flex-1 truncate">{model.name}</span>
                      {value?.llmConfigId === configId &&
                        value.model === model.id && (
                          <Check className="size-4" />
                        )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
        {children}
      </div>
    </div>
  );
}

export function ModelsManager() {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const queryClient = useQueryClient();
  const { open: openSettings } = useAgentSettingsDialog();

  const { connectedProviders, isLoading: connectionsLoading } = useLLMConfigs();
  const connections = useMemo(
    () => connectedProviders.filter((c) => c.configId),
    [connectedProviders],
  );

  const {
    data: config,
    isLoading: configLoading,
    isError: configError,
    refetch,
  } = useAgentsControllerGetAgentConfig({
    query: { enabled: !!selectedWorkspaceId },
  });
  const upsert = useAgentsControllerUpsertAgentConfig();
  // Set synchronously, unlike isPending, so a second pick cannot slip in
  const saving = useRef(false);

  const models: AgentModelsConfigDto = config?.modelsConfig ?? {};
  const subagent = models.subagents?.[0];

  // PUT replaces modelsConfig, so every save sends all of it. A save built
  // while another is in flight would overwrite it from stale data: skip it.
  const save = useCallback(
    (next: AgentModelsConfigDto) => {
      if (!config || saving.current) return;
      saving.current = true;
      upsert.mutate(
        { data: { modelsConfig: next } },
        {
          onSuccess: (saved) => {
            queryClient.setQueryData(
              getAgentsControllerGetAgentConfigQueryKey(),
              saved,
            );
            // The default model is also its connection's chat model
            void queryClient.invalidateQueries({
              queryKey: getAgentsControllerGetConnectedProvidersQueryKey(),
            });
            toast.success('Models updated');
          },
          onError: () => toast.error('Failed to update models'),
          onSettled: () => {
            saving.current = false;
          },
        },
      );
    },
    [config, upsert, queryClient],
  );

  // The row stands for all subagent models: unset clears them all
  const setSubagent = (ref: ModelRef | undefined) => {
    const rest = models.subagents?.slice(1) ?? [];
    save({ ...models, subagents: ref ? [ref, ...rest] : [] });
  };

  if (!selectedWorkspaceId) return null;

  if (configLoading || connectionsLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-16 rounded-lg border animate-pulse bg-muted/30"
          />
        ))}
      </div>
    );
  }

  // Never edit from an empty fallback: the next save would wipe the config
  if (configError || !config) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t load the model settings.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={() => void refetch()}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (connections.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Connect an LLM provider to choose the models the agent uses.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={() => openSettings('provider')}
        >
          Connect a provider
        </Button>
      </div>
    );
  }

  return (
    <div className="divide-y rounded-xl border bg-card/50 px-4">
      <SettingRow
        title="Default Model"
        description="Primary model for new conversations"
      >
        <ModelPicker
          label="Default model"
          value={models.default}
          connections={connections}
          // Runs then use the oldest connection, listed first
          placeholder="Not set (uses the first connection)"
          onChange={(picked) =>
            save({ ...models, default: nextRef(models.default, picked) })
          }
        />
      </SettingRow>
      <SettingRow
        title="Small Model"
        description="Lightweight model for title generation, conversation summaries and reports"
      >
        <ModelPicker
          label="Small model"
          value={models.small}
          connections={connections}
          unsetLabel="Use default model"
          onChange={(picked) =>
            save({ ...models, small: nextRef(models.small, picked) })
          }
        />
      </SettingRow>
      <SettingRow
        title="Subagent Model"
        description="Default model and reasoning effort for subagents. Leave unset to inherit the calling agent's model."
      >
        <ModelPicker
          label="Subagent model"
          value={subagent}
          connections={connections}
          unsetLabel="Inherit from agent"
          onChange={(picked) => setSubagent(nextRef(subagent, picked))}
        />
        <Select
          value={subagent?.reasoningEffort ?? EFFORT_UNSET}
          disabled={!subagent}
          onValueChange={(effort) => {
            if (!subagent) return;
            const { reasoningEffort: _old, ...ref } = subagent;
            setSubagent(
              effort === EFFORT_UNSET
                ? ref
                : { ...ref, reasoningEffort: effort as NonNullable<Effort> },
            );
          }}
        >
          <SelectTrigger
            size="sm"
            aria-label="Subagent reasoning effort"
            className="border-0 bg-transparent shadow-none"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value={EFFORT_UNSET}>
              Not Set (Use Provider Default)
            </SelectItem>
            {EFFORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>
    </div>
  );
}
