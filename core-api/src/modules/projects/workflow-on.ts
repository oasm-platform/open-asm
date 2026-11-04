import { ProjectTriggerType, TargetType } from '@/common/enums/enum';
import { isValidCronSchedule } from './dto/cron-schedule.validator';
import type { AssetsAddedTriggerConfig } from './entities/project-workflow-trigger.entity';

/**
 * The `on:` block of a project workflow: when the workflow runs on its own.
 *
 *   on:
 *     schedule:
 *       - cron: '0 2 * * 1'      # UTC, one scheduler each
 *     assetsAdded:               # when assets join the project
 *       windowMinutes: 10
 *       maxAssets: 200
 *       targetTypes: [DOMAIN]
 *
 * The file is the definition. `project_workflow_triggers` holds one row per
 * entry with what the file does not: whether it is turned on, when it last
 * fired and its BullMQ scheduler id. `planTriggerSync` says how to bring the
 * rows in line with the file; everything here is pure.
 */

export const DEFAULT_WINDOW_MINUTES = 10;
export const DEFAULT_MAX_ASSETS = 200;

/** Applies the defaults and bounds of an `assetsAdded` config. */
export function normalizeAssetsAddedConfig(
  config: Partial<AssetsAddedTriggerConfig> | undefined,
): AssetsAddedTriggerConfig {
  return {
    windowMinutes: config?.windowMinutes ?? DEFAULT_WINDOW_MINUTES,
    maxAssets: config?.maxAssets ?? DEFAULT_MAX_ASSETS,
    targetTypes: config?.targetTypes ?? [],
  };
}

/** A trigger as the file defines it. */
export interface DefinedTrigger {
  /** Stable identity of the entry: `cron:<expression>` or `assets_added`. */
  key: string;
  type: ProjectTriggerType;
  cron?: string;
  config?: AssetsAddedTriggerConfig;
}

/** The canonical `on:` of a project workflow (what is stored). */
export interface ProjectWorkflowOn {
  schedule?: Array<{ cron: string }>;
  assetsAdded?: AssetsAddedTriggerConfig;
}

export class WorkflowOnError extends Error {
  constructor(readonly errors: string[]) {
    super(errors.join('; '));
  }
}

/** A cron expression with single spaces, as stored and keyed. */
export const normalizeCron = (cron: string) => cron.trim().replace(/\s+/g, ' ');

export const cronKey = (cron: string) => `cron:${normalizeCron(cron)}`;
export const ASSETS_ADDED_KEY = 'assets_added';

/** The key of a stored trigger row, to match it with the file. */
export function keyOfRow(row: {
  type: ProjectTriggerType;
  cron: string | null;
}): string {
  return row.type === ProjectTriggerType.CRON
    ? cronKey(row.cron ?? '')
    : ASSETS_ADDED_KEY;
}

/**
 * Reads the triggers of an `on:` block. `schedule` may be one cron, a list of
 * crons or a list of `{ cron }` (the stored form); duplicates collapse.
 * `target` belongs to workspace workflows and is ignored here.
 *
 * @throws WorkflowOnError listing every invalid entry.
 */
export function triggersOfOn(on: unknown): DefinedTrigger[] {
  if (!on || typeof on !== 'object') return [];
  const block = on as { schedule?: unknown; assetsAdded?: unknown };
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

  if (block.assetsAdded !== undefined && block.assetsAdded !== false) {
    const raw = block.assetsAdded === true ? {} : block.assetsAdded;
    const problems = assetsAddedProblems(raw);
    if (problems.length > 0) {
      errors.push(...problems.map((p) => `on.assetsAdded: ${p}`));
    } else {
      triggers.push({
        key: ASSETS_ADDED_KEY,
        type: ProjectTriggerType.ASSETS_ADDED,
        config: normalizeAssetsAddedConfig(
          raw as Partial<AssetsAddedTriggerConfig>,
        ),
      });
    }
  }

  if (errors.length > 0) throw new WorkflowOnError(errors);
  return triggers;
}

function assetsAddedProblems(raw: unknown): string[] {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return ['must be a mapping (windowMinutes, maxAssets, targetTypes)'];
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
  intIn('windowMinutes', 0, 1440);
  intIn('maxAssets', 1, 5000);
  const types = config.targetTypes;
  if (
    types !== undefined &&
    (!Array.isArray(types) ||
      types.some((t) => !Object.values(TargetType).includes(t as TargetType)))
  ) {
    problems.push(
      `targetTypes must list target types (${Object.values(TargetType).join(', ')})`,
    );
  }
  const unknown = Object.keys(config).filter(
    (key) => !['windowMinutes', 'maxAssets', 'targetTypes'].includes(key),
  );
  if (unknown.length > 0)
    problems.push(`unknown setting ${unknown.join(', ')}`);
  return problems;
}

/** `on` as the workflow editor sends it: each entry may say whether it is on. */
export interface WorkflowOnInput {
  schedule?: Array<{ cron: string; enabled?: boolean }>;
  assetsAdded?:
    | (Partial<AssetsAddedTriggerConfig> & { enabled?: boolean })
    | null;
}

/**
 * The triggers of an editor's `on` input. Whether an entry is on is state,
 * not definition, so it is left to the caller.
 *
 * @throws WorkflowOnError listing every invalid entry.
 */
export function triggersOfInput(input: WorkflowOnInput): DefinedTrigger[] {
  const added = input.assetsAdded;
  return triggersOfOn({
    schedule: (input.schedule ?? []).map(({ cron }) => ({ cron })),
    ...(added
      ? {
          assetsAdded: {
            ...(added.windowMinutes !== undefined ? { windowMinutes: added.windowMinutes } : {}),
            ...(added.maxAssets !== undefined ? { maxAssets: added.maxAssets } : {}),
            ...(added.targetTypes !== undefined ? { targetTypes: added.targetTypes } : {}),
          },
        }
      : {}),
  });
}

/** Whether each entry of an editor's input should be on, by trigger key. */
export function enabledByKey(input: WorkflowOnInput): Map<string, boolean> {
  const wanted = new Map<string, boolean>();
  for (const entry of input.schedule ?? []) {
    const key = cronKey(entry.cron);
    // Duplicates collapse to the first entry, so its state wins.
    if (entry.enabled !== undefined && !wanted.has(key)) wanted.set(key, entry.enabled);
  }
  if (input.assetsAdded?.enabled !== undefined) {
    wanted.set(ASSETS_ADDED_KEY, input.assetsAdded.enabled);
  }
  return wanted;
}

/** Writes triggers back as the canonical `on:` block (undefined when none). */
export function onOfTriggers(
  triggers: readonly DefinedTrigger[],
): ProjectWorkflowOn | undefined {
  const schedule = triggers
    .filter((t) => t.type === ProjectTriggerType.CRON)
    .map((t) => ({ cron: t.cron! }));
  const assetsAdded = triggers.find(
    (t) => t.type === ProjectTriggerType.ASSETS_ADDED,
  )?.config;
  if (schedule.length === 0 && !assetsAdded) return undefined;
  return {
    ...(schedule.length > 0 ? { schedule } : {}),
    ...(assetsAdded ? { assetsAdded } : {}),
  };
}

/** How to bring a workflow's trigger rows in line with its file. */
export interface TriggerSyncPlan<Row> {
  /** In the file, not in the table. */
  create: DefinedTrigger[];
  /** In both, with settings the file changed. */
  update: Array<{ row: Row; config: AssetsAddedTriggerConfig }>;
  /** In the table, gone from the file. */
  remove: Row[];
}

export function planTriggerSync<
  Row extends {
    type: ProjectTriggerType;
    cron: string | null;
    config: AssetsAddedTriggerConfig;
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
        t.config &&
        JSON.stringify(normalizeAssetsAddedConfig(row.config)) !==
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
