import { ModelPicker } from '@/components/models-manager';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useLLMConfigs } from '@/hooks/use-llm-configs';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import {
  CreateAgentDefinitionDtoMode,
  CreateAgentDefinitionDtoScope,
  getAgentsControllerGetAgentDefinitionsQueryKey,
  useAgentsControllerCreateAgentDefinition,
  useAgentsControllerDeleteAgentDefinition,
  useAgentsControllerGetAgentDefinitions,
  useAgentsControllerUpdateAgentDefinition,
  type AgentDefinitionMetadataDto,
  type AgentDefinitionResponseDto,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { Bot, Info, Loader2, Minus, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

type Mode = CreateAgentDefinitionDtoMode;
type Scope = CreateAgentDefinitionDtoScope;

/** Same rule as the API: lowercase words joined by single dashes. */
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const MODES: Array<{ value: Mode; label: string }> = [
  { value: CreateAgentDefinitionDtoMode.primary, label: 'primary' },
  { value: CreateAgentDefinitionDtoMode.subagent, label: 'subagent' },
  { value: CreateAgentDefinitionDtoMode.all, label: 'all' },
];

const SCOPE_LABELS: Record<AgentDefinitionResponseDto['scope'], string> = {
  builtin: 'Built in',
  user: 'Personal',
  workspace: 'Workspace',
};

interface FormState {
  name: string;
  title: string;
  scope: Scope;
  description: string;
  mode: Mode;
  systemPrompt: string;
  metadata: AgentDefinitionMetadataDto;
}

const emptyForm = (): FormState => ({
  name: 'new-agent',
  title: '',
  scope: CreateAgentDefinitionDtoScope.user,
  description: '',
  mode: CreateAgentDefinitionDtoMode.primary,
  systemPrompt: '',
  metadata: {},
});

const toForm = (agent: AgentDefinitionResponseDto): FormState => ({
  name: agent.name,
  title: agent.title ?? '',
  scope:
    agent.scope === 'workspace'
      ? CreateAgentDefinitionDtoScope.workspace
      : CreateAgentDefinitionDtoScope.user,
  description: agent.description,
  mode: agent.mode,
  systemPrompt: agent.systemPrompt,
  metadata: agent.metadata ?? {},
});

const errorMessage = (error: unknown, fallback: string): string => {
  if (isAxiosError<{ message?: string | string[] }>(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (message) return message;
  }
  return fallback;
};

function HelpTip({ children }: { children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Info className="size-3.5 text-muted-foreground" />
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{children}</TooltipContent>
    </Tooltip>
  );
}

function FieldRow({
  label,
  help,
  children,
}: {
  label: string;
  help?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_minmax(0,14rem)] sm:gap-4">
      <Label className="flex items-center gap-1.5">
        {label}
        {help && <HelpTip>{help}</HelpTip>}
      </Label>
      <div>{children}</div>
    </div>
  );
}

/** Number input with -/+ buttons; empty means "not set". */
function NumberStepper({
  label,
  value,
  onChange,
  step,
  min,
  max,
  integer,
  disabled,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  step: number;
  min: number;
  max: number;
  integer?: boolean;
  disabled?: boolean;
}) {
  const clamp = (n: number) => {
    const bounded = Math.min(max, Math.max(min, n));
    return integer ? Math.round(bounded) : Math.round(bounded * 100) / 100;
  };
  const bump = (delta: number) => onChange(clamp((value ?? min) + delta));
  return (
    <div className="flex h-8 w-full items-center rounded-md border">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="rounded-none"
        aria-label={`Decrease ${label}`}
        disabled={disabled || value === undefined || value <= min}
        onClick={() => bump(-step)}
      >
        <Minus className="size-3.5" />
      </Button>
      <input
        aria-label={label}
        inputMode="decimal"
        placeholder="—"
        disabled={disabled}
        value={value ?? ''}
        onChange={(e) => {
          const raw = e.target.value.trim();
          if (raw === '') return onChange(undefined);
          const n = Number(raw);
          if (!Number.isNaN(n)) onChange(clamp(n));
        }}
        className="h-full min-w-0 flex-1 border-x bg-transparent text-center text-sm outline-none placeholder:text-muted-foreground"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="rounded-none"
        aria-label={`Increase ${label}`}
        disabled={disabled || (value !== undefined && value >= max)}
        onClick={() => bump(step)}
      >
        <Plus className="size-3.5" />
      </Button>
    </div>
  );
}

function AgentFormSheet({
  open,
  onOpenChange,
  agent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Unset: create a new agent */
  agent: AgentDefinitionResponseDto | null;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);
  const readOnly = !!agent && !agent.canEdit;

  const { connectedProviders } = useLLMConfigs();
  const connections = useMemo(
    () => connectedProviders.filter((c) => c.configId),
    [connectedProviders],
  );

  useEffect(() => {
    if (open) setForm(agent ? toForm(agent) : emptyForm());
  }, [open, agent]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));
  const setMeta = <K extends keyof AgentDefinitionMetadataDto>(
    key: K,
    value: AgentDefinitionMetadataDto[K],
  ) =>
    setForm((prev) => ({
      ...prev,
      metadata: { ...prev.metadata, [key]: value },
    }));

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: getAgentsControllerGetAgentDefinitionsQueryKey(),
    });
  const done = (message: string) => {
    void invalidate();
    toast.success(message);
    onOpenChange(false);
  };

  const create = useAgentsControllerCreateAgentDefinition({
    mutation: {
      onSuccess: () => done('Agent created'),
      onError: (e) => toast.error(errorMessage(e, 'Failed to create agent')),
    },
  });
  const update = useAgentsControllerUpdateAgentDefinition({
    mutation: {
      onSuccess: () => done('Agent updated'),
      onError: (e) => toast.error(errorMessage(e, 'Failed to update agent')),
    },
  });
  const remove = useAgentsControllerDeleteAgentDefinition({
    mutation: {
      onSuccess: () => done('Agent deleted'),
      onError: (e) => toast.error(errorMessage(e, 'Failed to delete agent')),
    },
  });

  const nameError =
    form.name && !NAME_PATTERN.test(form.name)
      ? 'Lowercase letters, numbers and single dashes only'
      : undefined;
  const isPending = create.isPending || update.isPending;

  const submit = () => {
    if (!form.name || nameError || readOnly) return;
    // Drop unset keys so they are not saved as nulls
    const metadata = Object.fromEntries(
      Object.entries(form.metadata).filter(
        ([, v]) => v !== undefined && v !== null && v !== '',
      ),
    ) as AgentDefinitionMetadataDto;
    const data = {
      name: form.name,
      title: form.title.trim() || undefined,
      scope: form.scope,
      description: form.description,
      mode: form.mode,
      systemPrompt: form.systemPrompt,
      metadata,
    };
    if (agent) {
      update.mutate({
        id: agent.id,
        data: { ...data, title: form.title.trim() || null },
      });
    } else {
      create.mutate({ data });
    }
  };

  const heading = agent ? (agent.title ?? `@${agent.name}`) : 'New Agent';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-xl">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>{heading}</SheetTitle>
          <SheetDescription>
            {readOnly
              ? agent?.isBuiltin
                ? 'Built-in agent (read only)'
                : 'Shared by another workspace member (read only)'
              : agent
                ? 'Edit the agent persona'
                : 'Configure a new assistant persona'}
          </SheetDescription>
        </SheetHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <fieldset
            disabled={readOnly}
            className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-5"
          >
            <section className="space-y-4">
              <h3 className="text-sm font-semibold">Identity &amp; Role</h3>
              <FieldRow
                label="Agent Name"
                help="Slug used to mention the agent as @name. Personal agents are only visible to you; workspace agents are shared with every member."
              >
                <div className="flex items-start gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-1">
                    <span className="text-sm text-muted-foreground">@</span>
                    <Input
                      aria-label="Agent name"
                      value={form.name}
                      maxLength={64}
                      onChange={(e) =>
                        set('name', e.target.value.toLowerCase().replace(/\s+/g, '-'))
                      }
                      className="h-8"
                    />
                  </div>
                  <Select
                    value={form.scope}
                    onValueChange={(v) => set('scope', v as Scope)}
                    disabled={readOnly}
                  >
                    <SelectTrigger className="h-8 w-28" aria-label="Scope">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={CreateAgentDefinitionDtoScope.user}>
                        user
                      </SelectItem>
                      <SelectItem value={CreateAgentDefinitionDtoScope.workspace}>
                        workspace
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {nameError && (
                  <p className="mt-1 text-xs text-destructive">{nameError}</p>
                )}
              </FieldRow>
              <FieldRow label="Display Name">
                <Input
                  aria-label="Display name"
                  value={form.title}
                  maxLength={100}
                  placeholder="Optional"
                  onChange={(e) => set('title', e.target.value)}
                  className="h-8"
                />
              </FieldRow>
              <div className="space-y-1.5">
                <Label htmlFor="agent-description">Description</Label>
                <Textarea
                  id="agent-description"
                  value={form.description}
                  maxLength={2000}
                  placeholder="What does this agent do?"
                  onChange={(e) => set('description', e.target.value)}
                  className="min-h-20"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  Mode
                  <HelpTip>
                    primary: runs as the main agent. subagent: only delegated
                    to by another agent. all: both.
                  </HelpTip>
                </Label>
                <div className="flex gap-1.5" role="radiogroup" aria-label="Mode">
                  {MODES.map((m) => (
                    <Button
                      key={m.value}
                      type="button"
                      size="sm"
                      role="radio"
                      aria-checked={form.mode === m.value}
                      variant={form.mode === m.value ? 'secondary' : 'outline'}
                      className="h-7 px-2.5"
                      onClick={() => set('mode', m.value)}
                    >
                      {m.label}
                    </Button>
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-4 border-t pt-5">
              <h3 className="text-sm font-semibold">Model &amp; Parameters</h3>
              <FieldRow label="Override Model">
                {readOnly ? (
                  <span className="text-sm text-muted-foreground">
                    {form.metadata.model?.model ?? 'Default'}
                  </span>
                ) : (
                  <ModelPicker
                    label="Override model"
                    value={form.metadata.model}
                    connections={connections}
                    unsetLabel="Not selected"
                    onChange={(picked) => setMeta('model', picked ?? undefined)}
                  />
                )}
              </FieldRow>
              <FieldRow
                label="Thinking Variant"
                help="Provider reasoning variant, e.g. low / medium / high. Empty uses the default."
              >
                <Input
                  aria-label="Thinking variant"
                  value={form.metadata.variant ?? ''}
                  maxLength={50}
                  placeholder="default"
                  onChange={(e) => setMeta('variant', e.target.value || undefined)}
                  className="h-8"
                />
              </FieldRow>
              <FieldRow
                label="Temperature"
                help="Randomness of the answers (0-2). Empty uses the model default."
              >
                <NumberStepper
                  label="Temperature"
                  value={form.metadata.temperature}
                  onChange={(v) => setMeta('temperature', v)}
                  step={0.1}
                  min={0}
                  max={2}
                  disabled={readOnly}
                />
              </FieldRow>
              <FieldRow
                label="Top P"
                help="Nucleus sampling (0-1). Empty uses the model default."
              >
                <NumberStepper
                  label="Top P"
                  value={form.metadata.topP}
                  onChange={(v) => setMeta('topP', v)}
                  step={0.05}
                  min={0}
                  max={1}
                  disabled={readOnly}
                />
              </FieldRow>
              <FieldRow
                label="Max steps"
                help="Max tool call steps per run. Empty uses your agent settings."
              >
                <NumberStepper
                  label="Max steps"
                  value={form.metadata.maxSteps}
                  onChange={(v) => setMeta('maxSteps', v)}
                  step={1}
                  min={1}
                  max={1000}
                  integer
                  disabled={readOnly}
                />
              </FieldRow>
            </section>

            <section className="space-y-3 border-t pt-5">
              <h3 className="text-sm font-semibold">System Prompt</h3>
              <Textarea
                aria-label="System prompt"
                value={form.systemPrompt}
                maxLength={20000}
                placeholder="You are an expert coding assistant..."
                onChange={(e) => set('systemPrompt', e.target.value)}
                className="min-h-48 font-mono text-sm"
              />
            </section>
          </fieldset>

          <div className="flex items-center justify-between gap-2 border-t px-6 py-3">
            <div>
              {agent?.canEdit && (
                <ConfirmDialog
                  title="Delete Agent"
                  description={`Delete "@${agent.name}"? This action cannot be undone.`}
                  onConfirm={() => remove.mutate({ id: agent.id })}
                  confirmText="Delete"
                  trigger={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={remove.isPending}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  }
                />
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                {readOnly ? 'Close' : 'Cancel'}
              </Button>
              {!readOnly && (
                <Button
                  type="submit"
                  size="sm"
                  disabled={isPending || !form.name || !!nameError}
                >
                  {isPending && <Loader2 className="size-3 animate-spin" />}
                  {agent ? 'Save Changes' : 'Create Agent'}
                </Button>
              )}
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function CountChip({ label, count }: { label: string; count: number }) {
  return (
    <span className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground">
      {label} {count}
    </span>
  );
}

function AgentCard({
  agent,
  onOpen,
}: {
  agent: AgentDefinitionResponseDto;
  onOpen: () => void;
}) {
  const { metadata } = agent;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col gap-2 rounded-lg border bg-card p-4 text-left transition-colors hover:border-foreground/30"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Bot className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-semibold">
          {agent.title ?? agent.name}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          @{agent.name}
        </span>
        <Badge
          variant={agent.isBuiltin ? 'secondary' : 'outline'}
          className="shrink-0 text-[10px]"
        >
          {SCOPE_LABELS[agent.scope]}
        </Badge>
      </div>
      <p className="line-clamp-2 min-h-8 text-xs text-muted-foreground">
        {agent.description || 'No description'}
      </p>
      <div className="flex gap-1.5">
        <CountChip label="Skill" count={metadata.skills?.length ?? 0} />
        <CountChip label="Tool" count={metadata.tools?.length ?? 0} />
      </div>
    </button>
  );
}

export function AgentsManager() {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<AgentDefinitionResponseDto | null>(
    null,
  );

  const { data, isLoading, isError, refetch } =
    useAgentsControllerGetAgentDefinitions({
      query: { enabled: !!selectedWorkspaceId },
    });
  const agents = data ?? [];

  const show = (agent: AgentDefinitionResponseDto | null) => {
    setSelected(agent);
    setOpen(true);
  };

  if (!selectedWorkspaceId) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isLoading ? 'Loading agents...' : `Total ${agents.length} items`}
        </p>
        <Button size="sm" onClick={() => show(null)} className="gap-1.5">
          <Plus className="size-3.5" />
          New Agent
        </Button>
      </div>

      <AgentFormSheet open={open} onOpenChange={setOpen} agent={selected} />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-lg border bg-muted/30"
            />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Failed to load agents.{' '}
          <Button variant="link" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <div
          className="grid grid-cols-1 gap-3 md:grid-cols-2"
        >
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onOpen={() => show(agent)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
