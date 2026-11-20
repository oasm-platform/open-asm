import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  CronScheduleBuilder,
  type CronScheduleChange,
} from '@/components/ui/cron-schedule-builder';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { t, useT } from '@/lib/i18n-dictionary';
import {
  ProjectTriggerEvent,
  ProjectTriggerType,
  RunOutcome,
  Severity,
  TargetType,
  type EventTriggerInputDto,
  type ProjectWorkflowOnDto,
  type ProjectWorkflowTrigger,
} from '@/services/apis/gen/queries';
import { Plus, Trash2 } from 'lucide-react';
import {
  memo,
  useCallback,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

/**
 * When a project workflow runs on its own, as the workflow editor and the
 * create wizard edit it. It is saved as the workflow's `on:` block
 * (docs/workflows.md): schedules, and runs on events (assets joined the
 * project, another workflow finished, a vulnerability was found). Each entry
 * has an "Active" switch: off keeps it without running it.
 */

export interface ScheduleDraft {
  /** Row id of a saved schedule; a local id for a new one. */
  id: string;
  cron?: string;
  enabled: boolean;
}

/** One event trigger; the filters of the other events are kept but unused. */
export interface EventDraft {
  on: boolean;
  enabled: boolean;
  windowMinutes: number;
  maxAssets: number;
  targetTypes: TargetType[];
  /** `project.run.completed`: workflows to follow (none = any other). */
  workflows: string[];
  status: RunOutcome[];
  /** `vulnerability.detected`. */
  severity: Severity[];
}

export interface TriggersDraft {
  schedules: ScheduleDraft[];
  events: Record<ProjectTriggerEvent, EventDraft>;
}

const ADDED = ProjectTriggerEvent.projectassetsadded;
const COMPLETED = ProjectTriggerEvent.projectruncompleted;
const DETECTED = ProjectTriggerEvent.vulnerabilitydetected;
const EVENTS = [ADDED, COMPLETED, DETECTED] as const;

// Labels are getters, so they follow the language at render.
const TARGET_TYPES: Array<{ value: TargetType; label: string }> = [
  {
    value: TargetType.DOMAIN,
    get label() {
      return t('projects.triggers.targetType.domains');
    },
  },
  {
    value: TargetType.IP,
    get label() {
      return t('projects.triggers.targetType.ips');
    },
  },
  {
    value: TargetType.CIDR,
    get label() {
      return t('projects.triggers.targetType.cidrRanges');
    },
  },
  {
    value: TargetType.GIT_ORG,
    get label() {
      return t('projects.triggers.targetType.repositories');
    },
  },
];

const OUTCOMES: Array<{ value: RunOutcome; label: string }> = [
  {
    value: RunOutcome.success,
    get label() {
      return t('projects.triggers.outcome.succeeded');
    },
  },
  {
    value: RunOutcome.failure,
    get label() {
      return t('projects.triggers.outcome.failed');
    },
  },
];

const SEVERITIES: Array<{ value: Severity; label: string }> = [
  {
    value: Severity.critical,
    get label() {
      return t('projects.severity.critical');
    },
  },
  {
    value: Severity.high,
    get label() {
      return t('projects.severity.high');
    },
  },
  {
    value: Severity.medium,
    get label() {
      return t('projects.severity.medium');
    },
  },
  {
    value: Severity.low,
    get label() {
      return t('projects.severity.low');
    },
  },
  {
    value: Severity.info,
    get label() {
      return t('projects.severity.info');
    },
  },
];

let nextLocalId = 0;
const localId = () => `new-${++nextLocalId}`;

/** An event's draft from its trigger row, or the defaults when it has none. */
function eventDraft(row: ProjectWorkflowTrigger | undefined): EventDraft {
  const config = row?.config;
  return {
    on: !!row,
    enabled: row?.enabled ?? true,
    windowMinutes: config?.windowMinutes ?? 10,
    maxAssets: config?.maxAssets ?? 200,
    targetTypes: (config?.targetTypes ?? []) as TargetType[],
    workflows: config?.workflows ?? [],
    status: (config?.status ?? [RunOutcome.success]) as RunOutcome[],
    severity: (config?.severity ?? [Severity.critical, Severity.high]) as Severity[],
  };
}

/** A draft from a workflow's trigger rows (none: runs only when started). */
export function draftFromTriggers(
  triggers: ProjectWorkflowTrigger[] | undefined,
): TriggersDraft {
  const rows = triggers ?? [];
  return {
    schedules: rows
      .filter((t) => t.type === ProjectTriggerType.cron && t.cron)
      .map((t) => ({ id: t.id, cron: t.cron ?? undefined, enabled: t.enabled })),
    events: Object.fromEntries(
      EVENTS.map((event) => [
        event,
        eventDraft(
          rows.find((t) => t.type === ProjectTriggerType.event && t.event === event),
        ),
      ]),
    ) as TriggersDraft['events'],
  };
}

/** A draft for a new workflow: one schedule to pick, and new assets on. */
export function newTriggersDraft(): TriggersDraft {
  const draft = draftFromTriggers(undefined);
  return {
    schedules: [{ id: localId(), enabled: true }],
    events: { ...draft.events, [ADDED]: { ...draft.events[ADDED], on: true } },
  };
}

const normalizeCron = (cron: string) => cron.trim().replace(/\s+/g, ' ');

/**
 * For each schedule, the index of an earlier one at the same time (the API
 * keeps one of them only), or -1.
 */
export function duplicateSchedules(schedules: ScheduleDraft[]): number[] {
  const first = new Map<string, number>();
  return schedules.map((s, index) => {
    if (!s.cron) return -1;
    const cron = normalizeCron(s.cron);
    const earlier = first.get(cron);
    if (earlier !== undefined) return earlier;
    first.set(cron, index);
    return -1;
  });
}

/**
 * Every schedule has its own time, and each event that is on has its
 * numbers in range and something to run on.
 */
export function isTriggersDraftValid(draft: TriggersDraft): boolean {
  return (
    draft.schedules.every((s) => !!s.cron) &&
    duplicateSchedules(draft.schedules).every((earlier) => earlier < 0) &&
    EVENTS.every((event) => {
      const e = draft.events[event];
      return (
        !e.on ||
        (e.windowMinutes >= 0 &&
          e.windowMinutes <= 1440 &&
          e.maxAssets >= 1 &&
          e.maxAssets <= 5000 &&
          (event !== COMPLETED || e.status.length > 0) &&
          (event !== DETECTED || e.severity.length > 0))
      );
    })
  );
}

/** The API's `on` for a draft: each event that is on, with its own filters. */
export function onInputOf(draft: TriggersDraft): ProjectWorkflowOnDto {
  return {
    schedule: draft.schedules
      .filter((s) => s.cron)
      .map((s) => ({ cron: s.cron!, enabled: s.enabled })),
    events: EVENTS.filter((event) => draft.events[event].on).map((event) => {
      const e = draft.events[event];
      const input: EventTriggerInputDto = {
        event,
        enabled: e.enabled,
        windowMinutes: e.windowMinutes,
        maxAssets: e.maxAssets,
        targetTypes: e.targetTypes,
      };
      if (event === COMPLETED) Object.assign(input, { workflows: e.workflows, status: e.status });
      if (event === DETECTED) Object.assign(input, { severity: e.severity });
      return input;
    }),
  };
}

const ScheduleRow = memo(function ScheduleRow({
  schedule,
  index,
  duplicateOf,
  disabled,
  onCron,
  onEnabled,
  onRemove,
}: {
  schedule: ScheduleDraft;
  index: number;
  /** Index of an earlier schedule at the same time, or -1. */
  duplicateOf: number;
  disabled?: boolean;
  onCron: (id: string, cron: string) => void;
  onEnabled: (id: string, enabled: boolean) => void;
  onRemove: (id: string) => void;
}) {
  const t = useT();
  // Stable per row: the builder reports its cron whenever this changes.
  const handleChange = useCallback(
    (change: CronScheduleChange) => onCron(schedule.id, change.cron),
    [onCron, schedule.id],
  );
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">
          {t('projects.triggers.scheduleN', { n: index + 1 })}
        </span>
        <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          {t('projects.triggers.active')}
          <Switch
            checked={schedule.enabled}
            disabled={disabled}
            onCheckedChange={(value) => onEnabled(schedule.id, value)}
            aria-label={t('projects.triggers.scheduleActiveAria', { n: index + 1 })}
          />
        </label>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          onClick={() => onRemove(schedule.id)}
          aria-label={t('projects.triggers.removeScheduleAria', { n: index + 1 })}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      <CronScheduleBuilder
        key={schedule.id}
        defaultValue={schedule.cron}
        onChange={handleChange}
      />
      {duplicateOf >= 0 && (
        <p className="text-sm text-destructive">
          {t('projects.triggers.duplicate', { n: duplicateOf + 1 })}
        </p>
      )}
    </div>
  );
});

/** A row of checkboxes over a list, adding and removing values. */
function CheckboxList<T extends string>({
  label,
  options,
  value,
  disabled,
  onChange,
  hint,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T[];
  disabled?: boolean;
  onChange: (value: T[]) => void;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm">{label}</span>
      <div className="flex flex-wrap gap-4">
        {options.map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={value.includes(option.value)}
              disabled={disabled}
              onCheckedChange={(checked) =>
                onChange(
                  checked
                    ? [...value, option.value]
                    : value.filter((v) => v !== option.value),
                )
              }
            />
            {option.label}
          </label>
        ))}
      </div>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

/** One event: whether the workflow runs on it, and its settings when it does. */
function EventCard({
  title,
  summary,
  draft,
  disabled,
  unavailable,
  onChange,
  children,
}: {
  title: string;
  /** What a run scans; shown while the event is off. */
  summary: string;
  draft: EventDraft;
  disabled?: boolean;
  /** Why the event cannot be picked yet; it can still be turned off. */
  unavailable?: string;
  onChange: (patch: Partial<EventDraft>) => void;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Checkbox
            checked={draft.on}
            disabled={disabled || (!!unavailable && !draft.on)}
            onCheckedChange={(checked) => onChange({ on: checked === true })}
          />
          {title}
        </label>
        {draft.on && (
          <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
            {t('projects.triggers.active')}
            <Switch
              checked={draft.enabled}
              disabled={disabled}
              onCheckedChange={(enabled) => onChange({ enabled })}
              aria-label={t('projects.triggers.eventActiveAria', { title })}
            />
          </label>
        )}
      </div>
      {draft.on ? (
        children
      ) : (
        <p className="text-sm text-muted-foreground">{unavailable ?? summary}</p>
      )}
    </div>
  );
}

/** How long an event gathers its assets, and how many one run takes. */
function GatherFields({
  id,
  draft,
  disabled,
  onChange,
}: {
  id: string;
  draft: EventDraft;
  disabled?: boolean;
  onChange: (patch: Partial<EventDraft>) => void;
}) {
  const t = useT();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-window`}>{t('projects.triggers.gatherFor')}</Label>
        <Input
          id={`${id}-window`}
          type="number"
          min={0}
          max={1440}
          disabled={disabled}
          value={draft.windowMinutes}
          onChange={(e) => onChange({ windowMinutes: Number(e.target.value) })}
        />
        <span className="text-xs text-muted-foreground">
          {t('projects.triggers.gatherHint')}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-max`}>{t('projects.triggers.maxAssets')}</Label>
        <Input
          id={`${id}-max`}
          type="number"
          min={1}
          max={5000}
          disabled={disabled}
          value={draft.maxAssets}
          onChange={(e) => onChange({ maxAssets: Number(e.target.value) })}
        />
        <span className="text-xs text-muted-foreground">
          {t('projects.triggers.maxAssetsHint')}
        </span>
      </div>
    </div>
  );
}

export function WorkflowTriggersForm({
  value,
  onChange,
  disabled,
  otherWorkflows = [],
}: {
  value: TriggersDraft;
  /** A state setter: updates are functional, so callbacks stay stable. */
  onChange: Dispatch<SetStateAction<TriggersDraft>>;
  disabled?: boolean;
  /** Names of the project's other workflows, which this one can follow. */
  otherWorkflows?: string[];
}) {
  const t = useT();
  const patchSchedule = useCallback(
    (id: string, patch: Partial<ScheduleDraft>) =>
      onChange((prev) => {
        const current = prev.schedules.find((s) => s.id === id);
        if (
          !current ||
          Object.entries(patch).every(
            ([key, v]) => current[key as keyof ScheduleDraft] === v,
          )
        ) {
          return prev;
        }
        return {
          ...prev,
          schedules: prev.schedules.map((s) => (s.id === id ? { ...s, ...patch } : s)),
        };
      }),
    [onChange],
  );
  const onCron = useCallback(
    (id: string, cron: string) => patchSchedule(id, { cron }),
    [patchSchedule],
  );
  const onEnabled = useCallback(
    (id: string, enabled: boolean) => patchSchedule(id, { enabled }),
    [patchSchedule],
  );
  const onRemove = useCallback(
    (id: string) =>
      onChange((prev) => ({
        ...prev,
        schedules: prev.schedules.filter((s) => s.id !== id),
      })),
    [onChange],
  );
  const patchEvent = (event: ProjectTriggerEvent) => (patch: Partial<EventDraft>) =>
    onChange((prev) => ({
      ...prev,
      events: { ...prev.events, [event]: { ...prev.events[event], ...patch } },
    }));
  const duplicates = duplicateSchedules(value.schedules);

  const added = value.events[ADDED];
  const completed = value.events[COMPLETED];
  const detected = value.events[DETECTED];
  // A followed workflow renamed or removed since stays listed, so it can be
  // unchecked.
  const followable = [...new Set([...otherWorkflows, ...completed.workflows])];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label>{t('projects.triggers.title')}</Label>
        <p className="text-sm text-muted-foreground">
          {t('projects.triggers.description')}
        </p>
      </div>

      {value.schedules.map((schedule, index) => (
        <ScheduleRow
          key={schedule.id}
          schedule={schedule}
          index={index}
          duplicateOf={duplicates[index]}
          disabled={disabled}
          onCron={onCron}
          onEnabled={onEnabled}
          onRemove={onRemove}
        />
      ))}
      <div>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() =>
            onChange((prev) => ({
              ...prev,
              schedules: [...prev.schedules, { id: localId(), enabled: true }],
            }))
          }
        >
          <Plus className="size-4" />
          {t('projects.triggers.addSchedule')}
        </Button>
      </div>

      <EventCard
        title={t('projects.condition.assetsJoin')}
        summary={t('projects.triggers.addedSummary')}
        draft={added}
        disabled={disabled}
        onChange={patchEvent(ADDED)}
      >
        <GatherFields id="assets" draft={added} disabled={disabled} onChange={patchEvent(ADDED)} />
        <CheckboxList
          label={t('projects.triggers.onlyAssetsOf')}
          options={TARGET_TYPES}
          value={added.targetTypes}
          disabled={disabled}
          onChange={(targetTypes) => patchEvent(ADDED)({ targetTypes })}
          hint={t('projects.triggers.noneEveryAsset')}
        />
      </EventCard>

      <EventCard
        title={t('projects.triggers.afterTitle')}
        summary={t('projects.triggers.afterSummary')}
        unavailable={
          followable.length === 0
            ? t('projects.triggers.afterUnavailable')
            : undefined
        }
        draft={completed}
        disabled={disabled}
        onChange={patchEvent(COMPLETED)}
      >
        <CheckboxList
          label={t('projects.triggers.after')}
          options={followable.map((name) => ({ value: name, label: name }))}
          value={completed.workflows}
          disabled={disabled}
          onChange={(workflows) => patchEvent(COMPLETED)({ workflows })}
          hint={t('projects.triggers.noneAnyWorkflow')}
        />
        <CheckboxList
          label={t('projects.triggers.whenTheRun')}
          options={OUTCOMES}
          value={completed.status}
          disabled={disabled}
          onChange={(status) => patchEvent(COMPLETED)({ status })}
          hint={completed.status.length === 0 ? t('projects.triggers.pickOne') : undefined}
        />
        <GatherFields
          id="completed"
          draft={completed}
          disabled={disabled}
          onChange={patchEvent(COMPLETED)}
        />
      </EventCard>

      <EventCard
        title={t('projects.triggers.detectedTitle')}
        summary={t('projects.triggers.detectedSummary')}
        draft={detected}
        disabled={disabled}
        onChange={patchEvent(DETECTED)}
      >
        <CheckboxList
          label={t('projects.triggers.severity')}
          options={SEVERITIES}
          value={detected.severity}
          disabled={disabled}
          onChange={(severity) => patchEvent(DETECTED)({ severity })}
          hint={
            detected.severity.length === 0
              ? t('projects.triggers.pickOne')
              : t('projects.triggers.ownFindings')
          }
        />
        <GatherFields
          id="detected"
          draft={detected}
          disabled={disabled}
          onChange={patchEvent(DETECTED)}
        />
      </EventCard>
    </div>
  );
}
