import {
  ProjectTriggerEvent,
  ProjectTriggerType,
  RunOutcome,
  Severity,
  TargetType,
} from '@/common/enums/enum';
import { isValidCronSchedule } from './dto/cron-schedule.validator';
import type { EventTriggerConfig } from './entities/project-workflow-trigger.entity';

/**
 * The `on:` block of a project workflow: when the workflow runs on its own.
 *
 *   on:
 *     schedule:
 *       - cron: '0 2 * * 1'      # UTC, one scheduler each
 *     project.assets.added:      # when assets join the project
 *       windowMinutes: 10
 *       maxAssets: 200
 *       targetTypes: [DOMAIN]
 *     project.run.completed:     # after another workflow of the project
 *       workflows: [Recon]
 *       status: [success]
 *     vulnerability.detected:    # on the asset a scan found something on
 *       severity: [critical, high]
 *
 * An event key is the event bridge name the projects lane listens to. Every
 * event gathers its assets for `windowMinutes` and starts one run per
 * `maxAssets` of them.
 *
 * The file is the definition. `project_workflow_triggers` holds one row per
 * entry with what the file does not: whether it is turned on, when it last
 * fired and its BullMQ scheduler id. `planTriggerSync` says how to bring the
 * rows in line with the file; everything here is pure.
 */

export const DEFAULT_WINDOW_MINUTES = 10;
export const DEFAULT_MAX_ASSETS = 200;

/**
 * Most event hops in a chain of runs. A run started by an event that a run
 * caused is one hop further than that run; past this, the event is dropped,
 * so workflows that trigger each other stop instead of looping.
 */
export const MAX_CHAIN_DEPTH = 3;

export const TRIGGER_EVENTS = Object.values(ProjectTriggerEvent);

const COMMON_SETTINGS = ['windowMinutes', 'maxAssets', 'targetTypes'];

/** The settings each event takes besides the common ones. */
const EVENT_SETTINGS: Record<ProjectTriggerEvent, readonly string[]> = {
  [ProjectTriggerEvent.ASSETS_ADDED]: [],
  [ProjectTriggerEvent.RUN_COMPLETED]: ['workflows', 'status'],
  [ProjectTriggerEvent.VULNERABILITY_DETECTED]: ['severity'],
};

const DEFAULT_STATUS = [RunOutcome.SUCCESS];
const DEFAULT_SEVERITY = [Severity.CRITICAL, Severity.HIGH];

export const isTriggerEvent = (value: unknown): value is ProjectTriggerEvent =>
  TRIGGER_EVENTS.includes(value as ProjectTriggerEvent);

/** Applies the defaults of an event's settings, keeping only its own. */
export function normalizeEventConfig(
  event: ProjectTriggerEvent,
  config: Partial<EventTriggerConfig> | undefined,
): EventTriggerConfig {
  const common: EventTriggerConfig = {
    windowMinutes: config?.windowMinutes ?? DEFAULT_WINDOW_MINUTES,
    maxAssets: config?.maxAssets ?? DEFAULT_MAX_ASSETS,
    targetTypes: config?.targetTypes ?? [],
  };
  switch (event) {
    case ProjectTriggerEvent.RUN_COMPLETED:
      return {
        ...common,
        workflows: config?.workflows ?? [],
        status: config?.status ?? DEFAULT_STATUS,
      };
    case ProjectTriggerEvent.VULNERABILITY_DETECTED:
      return { ...common, severity: config?.severity ?? DEFAULT_SEVERITY };
    default:
      return common;
  }
}

/** A trigger as the file defines it. */
export interface DefinedTrigger {
  /** Stable identity of the entry: `cron:<expression>` or `event:<name>`. */
  key: string;
  type: ProjectTriggerType;
  cron?: string;
  event?: ProjectTriggerEvent;
  config?: EventTriggerConfig;
}

/** The canonical `on:` of a project workflow (what is stored). */
export type ProjectWorkflowOn = {
  schedule?: Array<{ cron: string }>;
} & Partial<Record<ProjectTriggerEvent, EventTriggerConfig>>;

export class WorkflowOnError extends Error {
  constructor(readonly errors: string[]) {
    super(errors.join('; '));
  }
}

/** A cron expression with single spaces, as stored and keyed. */
export const normalizeCron = (cron: string) => cron.trim().replace(/\s+/g, ' ');

export const cronKey = (cron: string) => `cron:${normalizeCron(cron)}`;
export const eventKey = (event: ProjectTriggerEvent) => `event:${event}`;

/** The key of a stored trigger row, to match it with the file. */
export function keyOfRow(row: {
  type: ProjectTriggerType;
  cron: string | null;
  event: ProjectTriggerEvent | null;
}): string {
  return row.type === ProjectTriggerType.CRON
    ? cronKey(row.cron ?? '')
    : eventKey(row.event!);
}

/**
 * Reads the triggers of an `on:` block. `schedule` may be one cron, a list of
 * crons or a list of `{ cron }` (the stored form); duplicates collapse. An
 * event key takes its settings, or `true` for the defaults. `target` belongs
 * to workspace workflows and is ignored here.
 *
 * @throws WorkflowOnError listing every invalid entry.
 */
export function triggersOfOn(on: unknown): DefinedTrigger[] {
  if (!on || typeof on !== 'object') return [];
  const block = on as Record<string, unknown>;
  const errors: string[] = [];
  const triggers: DefinedTrigger[] = [];

  const schedules: unknown[] =
    block.schedule === undefined
      ? []
      : Array.isArray(block.schedule)
        ? block.schedule
        : [block.schedule];
  schedules.forEach((entry, i) => {
    const raw =
      typeof entry === 'object' && entry !== null
        ? (entry as { cron?: unknown }).cron
        : entry;
    const cron = typeof raw === 'string' ? normalizeCron(raw) : '';
    // "disabled" is how an asset group said "no schedule"; it is no cron.
    if (cron === 'disabled' || !isValidCronSchedule(cron)) {
      errors.push(
        `on.schedule[${i}]: ${JSON.stringify(raw ?? null)} is not a 5-field cron expression`,
      );
      return;
    }
    if (!triggers.some((t) => t.key === cronKey(cron))) {
      triggers.push({
        key: cronKey(cron),
        type: ProjectTriggerType.CRON,
        cron,
      });
    }
  });

  for (const event of TRIGGER_EVENTS) {
    const value = block[event];
    if (value === undefined || value === false) continue;
    const raw = value === true ? {} : value;
    const problems = eventProblems(event, raw);
    if (problems.length > 0) {
      errors.push(...problems.map((p) => `on.${event}: ${p}`));
      continue;
    }
    triggers.push({
      key: eventKey(event),
      type: ProjectTriggerType.EVENT,
      event,
      config: normalizeEventConfig(event, raw as Partial<EventTriggerConfig>),
    });
  }

  const unknown = Object.keys(block).filter(
    (key) =>
      key !== 'schedule' && key !== 'target' && !isTriggerEvent(key),
  );
  for (const key of unknown) {
    errors.push(
      `on.${key}: unknown trigger (schedule, ${TRIGGER_EVENTS.join(', ')})`,
    );
  }

  if (errors.length > 0) throw new WorkflowOnError(errors);
  return triggers;
}

function eventProblems(event: ProjectTriggerEvent, raw: unknown): string[] {
  const allowed = [...COMMON_SETTINGS, ...EVENT_SETTINGS[event]];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return [`must be a mapping (${allowed.join(', ')})`];
  }
  const config = raw as Record<string, unknown>;
  const problems: string[] = [];
  const intIn = (key: string, min: number, max: number) => {
    const value = config[key];
    if (value === undefined) return;
    if (
      !Number.isInteger(value) ||
      (value as number) < min ||
      (value as number) > max
    ) {
      problems.push(`${key} must be a whole number from ${min} to ${max}`);
    }
  };
  /** A list of `values`; `nonEmpty` when an empty one would never run. */
  const listOf = (
    key: string,
    what: string,
    values: readonly string[],
    nonEmpty: boolean,
  ) => {
    const value = config[key];
    if (value === undefined) return;
    if (
      !Array.isArray(value) ||
      (nonEmpty && value.length === 0) ||
      value.some((v) => !values.includes(v as string))
    ) {
      problems.push(`${key} must list ${what} (${values.join(', ')})`);
    }
  };

  intIn('windowMinutes', 0, 1440);
  intIn('maxAssets', 1, 5000);
  listOf('targetTypes', 'target types', Object.values(TargetType), false);
  if (allowed.includes('workflows')) {
    const workflows = config.workflows;
    if (
      workflows !== undefined &&
      (!Array.isArray(workflows) ||
        workflows.length > 20 ||
        workflows.some((w) => typeof w !== 'string' || w.trim() === ''))
    ) {
      problems.push('workflows must list up to 20 workflow names');
    }
  }
  if (allowed.includes('status')) {
    listOf('status', 'one or more run outcomes', Object.values(RunOutcome), true);
  }
  if (allowed.includes('severity')) {
    listOf('severity', 'one or more severities', Object.values(Severity), true);
  }

  const unknown = Object.keys(config).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    problems.push(`unknown setting ${unknown.join(', ')}`);
  }
  return problems;
}

/** One event trigger as the workflow editor sends it. */
export type EventTriggerInput = Partial<EventTriggerConfig> & {
  event: ProjectTriggerEvent;
  enabled?: boolean;
};

/** `on` as the workflow editor sends it: each entry may say whether it is on. */
export interface WorkflowOnInput {
  schedule?: Array<{ cron: string; enabled?: boolean }>;
  events?: EventTriggerInput[];
}

const CONFIG_KEYS = [
  'windowMinutes',
  'maxAssets',
  'targetTypes',
  'workflows',
  'status',
  'severity',
] as const satisfies ReadonlyArray<keyof EventTriggerConfig>;

/**
 * The triggers of an editor's `on` input. Whether an entry is on is state,
 * not definition, so it is left to the caller. An event listed twice keeps
 * its first entry.
 *
 * @throws WorkflowOnError listing every invalid entry.
 */
export function triggersOfInput(input: WorkflowOnInput): DefinedTrigger[] {
  const on: Record<string, unknown> = {
    schedule: (input.schedule ?? []).map(({ cron }) => ({ cron })),
  };
  for (const entry of input.events ?? []) {
    if (entry.event in on) continue;
    const config: Record<string, unknown> = {};
    for (const key of CONFIG_KEYS) {
      if (entry[key] !== undefined) config[key] = entry[key];
    }
    on[entry.event] = config;
  }
  return triggersOfOn(on);
}

/** Whether each entry of an editor's input should be on, by trigger key. */
export function enabledByKey(input: WorkflowOnInput): Map<string, boolean> {
  const wanted = new Map<string, boolean>();
  const want = (key: string, enabled: boolean | undefined) => {
    // Duplicates collapse to the first entry, so its state wins.
    if (enabled !== undefined && !wanted.has(key)) wanted.set(key, enabled);
  };
  for (const entry of input.schedule ?? []) want(cronKey(entry.cron), entry.enabled);
  for (const entry of input.events ?? []) want(eventKey(entry.event), entry.enabled);
  return wanted;
}

/** Writes triggers back as the canonical `on:` block (undefined when none). */
export function onOfTriggers(
  triggers: readonly DefinedTrigger[],
): ProjectWorkflowOn | undefined {
  const on: ProjectWorkflowOn = {};
  const schedule = triggers
    .filter((t) => t.type === ProjectTriggerType.CRON)
    .map((t) => ({ cron: t.cron! }));
  if (schedule.length > 0) on.schedule = schedule;
  for (const event of TRIGGER_EVENTS) {
    const trigger = triggers.find((t) => t.event === event);
    if (trigger) on[event] = trigger.config ?? normalizeEventConfig(event, {});
  }
  return Object.keys(on).length > 0 ? on : undefined;
}

/** How to bring a workflow's trigger rows in line with its file. */
export interface TriggerSyncPlan<Row> {
  /** In the file, not in the table. */
  create: DefinedTrigger[];
  /** In both, with settings the file changed. */
  update: Array<{ row: Row; config: EventTriggerConfig }>;
  /** In the table, gone from the file. */
  remove: Row[];
}

export function planTriggerSync<
  Row extends {
    type: ProjectTriggerType;
    cron: string | null;
    event: ProjectTriggerEvent | null;
    config: EventTriggerConfig;
  },
>(
  rows: readonly Row[],
  defined: readonly DefinedTrigger[],
): TriggerSyncPlan<Row> {
  const byKey = new Map(rows.map((row) => [keyOfRow(row), row]));
  const definedKeys = new Set(defined.map((t) => t.key));
  return {
    create: defined.filter((t) => !byKey.has(t.key)),
    update: defined.flatMap((t) => {
      const row = byKey.get(t.key);
      return row &&
        t.event &&
        t.config &&
        JSON.stringify(normalizeEventConfig(t.event, row.config)) !==
          JSON.stringify(t.config)
        ? [{ row, config: t.config }]
        : [];
    }),
    // A duplicate row of one key (should not exist) goes too.
    remove: rows.filter(
      (row) =>
        !definedKeys.has(keyOfRow(row)) || byKey.get(keyOfRow(row)) !== row,
    ),
  };
}
