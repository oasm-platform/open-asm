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
import {
  EFFORT_LABELS,
  effortLabel,
  type ReasoningEffort,
} from '@/components/ui/reasoning-effort-select';
import { setDefaultApprovalMode } from '@/hooks/use-approval-mode';
import { useLLMConfigs } from '@/hooks/use-llm-configs';
import { useAgentSettingsDialog } from '@/hooks/useAgentSettingsDialog';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import {
  AgentModelRefDtoReasoningEffort,
  type UpsertAgentConfigDto,
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
import { useT } from '@/lib/i18n-dictionary';

type ModelRef = AgentModelRefDto;
type Effort = AgentModelRefDto['reasoningEffort'];

/** Radix Select cannot hold an empty value, so "not set" gets a token. */
const UNSET = 'unset';

const EFFORT_OPTIONS: Array<{ value: NonNullable<Effort>; labelKey: string }> = [
  {
    value: AgentModelRefDtoReasoningEffort.low,
    labelKey: 'agents.models.effort.low',
  },
  {
    value: AgentModelRefDtoReasoningEffort.medium,
    labelKey: 'agents.models.effort.medium',
  },
  {
    value: AgentModelRefDtoReasoningEffort.high,
    labelKey: 'agents.models.effort.high',
  },
];

const DEFAULT_EFFORTS = Object.keys(EFFORT_LABELS) as ReasoningEffort[];

const APPROVAL_OPTIONS = [
  { value: 'manual', labelKey: 'agents.models.approval.manual' },
  { value: 'auto', labelKey: 'agents.models.approval.auto' },
] as const;

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

export function ModelPicker({
  label,
  value,
  connections,
  unsetLabel,
  placeholder,
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
  const t = useT();
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
            {value?.model ??
              unsetLabel ??
              placeholder ??
              t('agents.models.selectModel')}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <Command filter={filterByKeywords}>
          <CommandInput placeholder={t('agents.llm.searchModels')} />
          <CommandList>
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {t('agents.models.loadingModels')}
              </div>
            ) : (
              <CommandEmpty>{t('agents.models.noModels')}</CommandEmpty>
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
  const t = useT();
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
            toast.success(t('agents.models.updated'));
          },
          onError: () => toast.error(t('agents.models.updateFailed')),
          onSettled: () => {
            saving.current = false;
          },
        },
      );
    },
    [config, upsert, queryClient, t],
  );

  // New chat defaults: a partial upsert, so it never touches modelsConfig
  const saveDefaults = (
    patch: Pick<
      UpsertAgentConfigDto,
      'defaultReasoningEffort' | 'defaultApprovalMode'
    >,
  ) => {
    upsert.mutate(
      { data: patch },
      {
        onSuccess: (saved) => {
          queryClient.setQueryData(
            getAgentsControllerGetAgentConfigQueryKey(),
            saved,
          );
          setDefaultApprovalMode(saved.defaultApprovalMode);
          toast.success(t('agents.models.defaultsUpdated'));
        },
        onError: () => toast.error(t('agents.models.defaultsFailed')),
      },
    );
  };

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
          {t('agents.models.loadFailed')}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={() => void refetch()}
        >
          {t('agents.settings.retry')}
        </Button>
      </div>
    );
  }

  if (connections.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center">
        <p className="text-sm text-muted-foreground">
          {t('agents.models.noProvider')}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={() => openSettings('provider')}
        >
          {t('agents.models.connectProvider')}
        </Button>
      </div>
    );
  }

  return (
    <div className="divide-y rounded-xl border bg-card/50 px-4">
      <SettingRow
        title={t('agents.models.default.title')}
        description={t('agents.models.default.description')}
      >
        <ModelPicker
          label={t('agents.models.default.label')}
          value={models.default}
          connections={connections}
          // Runs then use the oldest connection, listed first
          placeholder={t('agents.models.default.placeholder')}
          onChange={(picked) =>
            save({ ...models, default: nextRef(models.default, picked) })
          }
        />
      </SettingRow>
      <SettingRow
        title={t('agents.models.small.title')}
        description={t('agents.models.small.description')}
      >
        <ModelPicker
          label={t('agents.models.small.label')}
          value={models.small}
          connections={connections}
          unsetLabel={t('agents.models.small.unset')}
          onChange={(picked) =>
            save({ ...models, small: nextRef(models.small, picked) })
          }
        />
      </SettingRow>
      <SettingRow
        title={t('agents.models.subagent.title')}
        description={t('agents.models.subagent.description')}
      >
        <ModelPicker
          label={t('agents.models.subagent.label')}
          value={subagent}
          connections={connections}
          unsetLabel={t('agents.models.subagent.unset')}
          onChange={(picked) => setSubagent(nextRef(subagent, picked))}
        />
        <Select
          value={subagent?.reasoningEffort ?? UNSET}
          disabled={!subagent}
          onValueChange={(effort) => {
            if (!subagent) return;
            const { reasoningEffort: _old, ...ref } = subagent;
            setSubagent(
              effort === UNSET
                ? ref
                : { ...ref, reasoningEffort: effort as NonNullable<Effort> },
            );
          }}
        >
          <SelectTrigger
            size="sm"
            aria-label={t('agents.models.subagent.effortLabel')}
            className="border-0 bg-transparent shadow-none"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value={UNSET}>
              {t('agents.models.notSetProvider')}
            </SelectItem>
            {EFFORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(option.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>
      <SettingRow
        title={t('agents.models.effortDefault.title')}
        description={t('agents.models.effortDefault.description')}
      >
        <Select
          value={config.defaultReasoningEffort ?? UNSET}
          onValueChange={(effort) =>
            saveDefaults({
              defaultReasoningEffort:
                effort === UNSET ? null : (effort as ReasoningEffort),
            })
          }
        >
          <SelectTrigger
            size="sm"
            aria-label={t('agents.models.effortDefault.label')}
            className="border-0 bg-transparent shadow-none"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value={UNSET}>
              {t('agents.models.notSetProvider')}
            </SelectItem>
            {DEFAULT_EFFORTS.map((effort) => (
              <SelectItem key={effort} value={effort}>
                {effortLabel(effort)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>
      <SettingRow
        title={t('agents.models.approvalDefault.title')}
        description={t('agents.models.approvalDefault.description')}
      >
        <Select
          value={config.defaultApprovalMode ?? UNSET}
          onValueChange={(mode) =>
            saveDefaults({
              defaultApprovalMode:
                mode === UNSET
                  ? null
                  : (mode as (typeof APPROVAL_OPTIONS)[number]['value']),
            })
          }
        >
          <SelectTrigger
            size="sm"
            aria-label={t('agents.models.approvalDefault.label')}
            className="border-0 bg-transparent shadow-none"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value={UNSET}>
              {t('agents.models.notSetLast')}
            </SelectItem>
            {APPROVAL_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(option.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>
    </div>
  );
}
