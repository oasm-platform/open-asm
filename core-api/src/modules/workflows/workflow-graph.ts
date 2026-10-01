import { ToolCategory } from '@/common/enums/enum';

/**
 * Workflow graph domain logic.
 *
 * A workflow is a DAG of jobs: `content.jobs` is a map keyed by a unique job id
 * (the same id `needs` references — like GitHub Actions' `jobs.<job_id>`). A job
 * without `needs` is a root and may run in parallel with every other ready job;
 * a job whose dependency failed is skipped, and the skip cascades down the chain.
 *
 * Everything in this file is pure: no DB, no DI, no clock. The orchestrator
 * (`WorkflowRunnerService`) owns persistence and job creation and calls these
 * functions to decide *what* to do.
 */

/** A single job as authored in workflow content (the `jobs` map value). */
export interface WorkflowStepDefinition {
  /** Display label; defaults to the job id. */
  name?: string;
  run: string;
  needs?: string | string[];
  config?: Record<string, unknown>;
  configProfileId?: string;
}

/**
 * `content.jobs` as authored. The map form is canonical; the array form is the
 * legacy shape and is still accepted so workflows created before the switch
 * (e.g. asset-group pipelines already in the database) keep running.
 */
export type WorkflowJobsInput =
  | Record<string, WorkflowStepDefinition>
  | WorkflowStepDefinition[];

/** A job with its `needs` resolved to sibling job ids. */
export interface WorkflowStep {
  /** Unique id inside the workflow — the `jobs` map key. */
  id: string;
  /** Display label: the definition's `name`, else the id. */
  name: string;
  run: string;
  needs: string[];
  /** Original position — fallback ordering only. */
  order: number;
  config?: Record<string, unknown>;
  configProfileId?: string;
}

export interface WorkflowGraph {
  steps: WorkflowStep[];
  byId: Map<string, WorkflowStep>;
  /** job id → ids of the jobs that depend on it. */
  dependents: Map<string, string[]>;
}

export type RunStepStatus =
  | 'pending'
  | 'dispatched'
  | 'done'
  | 'failed'
  | 'skipped';

export type RunStepSkipReason =
  /** The job resolved to zero jobs (no assets or services in scope). */
  | 'no-inputs'
  /** A dependency failed or was itself blocked — skip cascades. */
  | 'blocked-by-failure'
  /** Dropped by the workspace "assets discovery" switch. */
  | 'assets-discovery-off'
  /** The whole run was cancelled by the user. */
  | 'run-cancelled';

export interface RunStepState {
  status: RunStepStatus;
  /** Job rows created for this step in this run. */
  jobs: number;
  reason?: RunStepSkipReason;
  dispatchedAt?: string;
  finishedAt?: string;
}

/** Per-run step state, keyed by job id. Persisted on `job_histories.steps`. */
export type WorkflowRunStepStates = Record<string, RunStepState>;

/** Scope captured when a run starts, persisted on `job_histories.scope`. */
export interface WorkflowRunScope {
  targetIds?: string[];
  assetIds?: string[];
}

/** Per-step job rollup the orchestrator computes from the `jobs` table. */
export interface StepJobSummary {
  tool: string;
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  failed: number;
  cancelled: number;
}

export interface AdvancePlan {
  /** Jobs whose dependencies are satisfied and that have not run yet. */
  dispatch: WorkflowStep[];
  /** Jobs to persist as skipped before dispatching (cascade). */
  skip: { id: string; reason: RunStepSkipReason }[];
  /** Every job of the graph is terminal — nothing else will run. */
  isComplete: boolean;
}

/** Thrown when workflow content is not a valid graph. */
export class WorkflowGraphError extends Error {
  constructor(
    message: string,
    readonly errors: string[] = [message],
  ) {
    super(message);
    this.name = 'WorkflowGraphError';
  }
}

const TERMINAL_STATUSES: RunStepStatus[] = ['done', 'failed', 'skipped'];

/** Normalizes a `needs` value (string or array) into a clean list of job ids. */
export function normalizeNeeds(needs: string | string[] | undefined): string[] {
  if (!needs) return [];
  const list = Array.isArray(needs) ? needs : [needs];
  return list
    .map((need) => String(need).trim())
    .filter((need) => need.length > 0);
}

/**
 * Normalizes `content.jobs` into `[jobId, definition]` pairs, preserving order.
 *
 * The legacy array form has no ids, so a job's id is its `name` (that is what
 * `needs` used to reference) falling back to its tool.
 */
export function jobEntries(
  jobs: WorkflowJobsInput | undefined | null,
): [string, WorkflowStepDefinition][] {
  if (!jobs) return [];
  if (Array.isArray(jobs)) {
    return jobs.map((job, index) => {
      const id =
        String(job?.name ?? '').trim() ||
        String(job?.run ?? '').trim() ||
        `job-${index + 1}`;
      return [id, job];
    });
  }
  return Object.entries(jobs).map(([id, job]) => [
    String(id).trim(),
    job,
  ]);
}

/** Indexes steps into the lookup maps the rest of the engine uses. */
function indexGraph(steps: WorkflowStep[]): WorkflowGraph {
  const byId = new Map<string, WorkflowStep>();
  const dependents = new Map<string, string[]>();

  for (const step of steps) {
    byId.set(step.id, step);
  }

  for (const step of steps) {
    for (const need of step.needs) {
      const list = dependents.get(need) ?? [];
      list.push(step.id);
      dependents.set(need, list);
    }
  }

  return { steps, byId, dependents };
}

/** Kahn's algorithm — returns the ids still stuck in a cycle, if any. */
function findCycleNodes(steps: WorkflowStep[]): string[] {
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const step of steps) {
    indegree.set(step.id, step.needs.length);
    for (const need of step.needs) {
      const list = dependents.get(need) ?? [];
      list.push(step.id);
      dependents.set(need, list);
    }
  }

  const queue = steps
    .filter((step) => (indegree.get(step.id) ?? 0) === 0)
    .map((step) => step.id);

  let visited = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
    visited++;
    for (const dependent of dependents.get(current) ?? []) {
      const remaining = (indegree.get(dependent) ?? 1) - 1;
      indegree.set(dependent, remaining);
      if (remaining === 0) queue.push(dependent);
    }
  }

  if (visited === steps.length) return [];
  return steps
    .filter((step) => (indegree.get(step.id) ?? 0) > 0)
    .map((step) => step.id);
}

/**
 * Parses workflow content into a validated graph.
 *
 * `needs` entries are job ids (`content.jobs` keys); an unknown id is a
 * validation error listing the known ones, so a typo fails at save time rather
 * than leaving a run waiting forever.
 *
 * @throws WorkflowGraphError listing every structural problem found.
 */
export function buildWorkflowGraph(content: {
  jobs?: WorkflowJobsInput;
} | null | undefined): WorkflowGraph {
  const entries = jobEntries(content?.jobs);
  const errors: string[] = [];
  const steps: WorkflowStep[] = [];
  const byId = new Map<string, WorkflowStep>();
  const byRun = new Map<string, WorkflowStep>();

  entries.forEach(([rawId, job], order) => {
    const id = rawId;
    const run = String(job?.run ?? '').trim();
    if (!id) {
      errors.push(`Job #${order + 1} has an empty id`);
      return;
    }
    if (!run) {
      errors.push(`Job "${id}" is missing its "run" tool`);
      return;
    }
    if (byId.has(id)) {
      errors.push(`Duplicate job id "${id}"`);
      return;
    }
    if (byRun.has(run)) {
      errors.push(`Duplicate tool "${run}" — a tool may run once per workflow`);
      return;
    }

    const step: WorkflowStep = {
      id,
      name: String(job.name ?? '').trim() || id,
      run,
      needs: normalizeNeeds(job.needs),
      order,
      config: job.config,
      configProfileId: job.configProfileId,
    };
    steps.push(step);
    byId.set(id, step);
    byRun.set(run, step);
  });

  const knownIds = steps.map((step) => step.id).join(', ');
  for (const step of steps) {
    const resolved: string[] = [];
    for (const need of step.needs) {
      if (need === step.id) {
        errors.push(`Job "${step.id}" cannot need itself`);
        continue;
      }
      if (!byId.has(need)) {
        errors.push(
          `Job "${step.id}" needs unknown job "${need}" (known jobs: ${knownIds || 'none'})`,
        );
        continue;
      }
      if (!resolved.includes(need)) resolved.push(need);
    }
    step.needs = resolved;
  }

  const cyclic = findCycleNodes(steps);
  if (cyclic.length > 0) {
    errors.push(`Dependency cycle between jobs: ${cyclic.join(', ')}`);
  }

  if (errors.length > 0) {
    throw new WorkflowGraphError(errors[0], errors);
  }

  return indexGraph(steps);
}

/** @returns the structural problems of a workflow definition, `[]` when valid. */
export function validateWorkflowGraph(content: {
  jobs?: WorkflowJobsInput;
} | null | undefined): string[] {
  try {
    buildWorkflowGraph(content);
    return [];
  } catch (error) {
    if (error instanceof WorkflowGraphError) return error.errors;
    return [error instanceof Error ? error.message : String(error)];
  }
}

/**
 * Drops every job whose tool is in the SUBDOMAINS category when the workspace
 * has assets discovery disabled, and removes the edges pointing at them so
 * their dependents become roots instead of waiting forever.
 *
 * A tool with an unknown category is kept — better to run it than to silently
 * drop a job.
 */
export function filterGraphByAssetsDiscovery(
  graph: WorkflowGraph,
  isAssetsDiscovery: boolean,
  toolCategoryByName: ReadonlyMap<string, ToolCategory>,
): WorkflowGraph {
  if (isAssetsDiscovery) return graph;

  const dropped = new Set(
    graph.steps
      .filter(
        (step) => toolCategoryByName.get(step.run) === ToolCategory.SUBDOMAINS,
      )
      .map((step) => step.id),
  );
  if (dropped.size === 0) return graph;

  const steps = graph.steps
    .filter((step) => !dropped.has(step.id))
    .map((step) => ({
      ...step,
      needs: step.needs.filter((need) => !dropped.has(need)),
    }));

  return indexGraph(steps);
}

function isSatisfied(state: RunStepState | undefined): boolean {
  if (!state) return false;
  if (state.status === 'done') return true;
  // A job that produced no jobs is "done" as far as its dependents care:
  // there is simply nothing to scan, and the chain must keep going.
  return (
    state.status === 'skipped' &&
    (state.reason === 'no-inputs' || state.reason === 'assets-discovery-off')
  );
}

function isBlocking(state: RunStepState | undefined): boolean {
  if (!state) return false;
  if (state.status === 'failed') return true;
  return (
    state.status === 'skipped' &&
    (state.reason === 'blocked-by-failure' ||
      state.reason === 'run-cancelled')
  );
}

/**
 * Decides what the engine should do next for one run: which jobs to dispatch,
 * which to skip because a dependency failed (cascaded to a fixpoint), and
 * whether the run is finished.
 *
 * Pure — the state passed in is never mutated.
 */
export function planAdvance(
  graph: WorkflowGraph,
  state: WorkflowRunStepStates,
): AdvancePlan {
  const local: WorkflowRunStepStates = {};
  for (const step of graph.steps) {
    local[step.id] = state[step.id]
      ? { ...state[step.id] }
      : { status: 'pending', jobs: 0 };
  }

  const skip: { id: string; reason: RunStepSkipReason }[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const step of graph.steps) {
      if (local[step.id].status !== 'pending') continue;
      if (step.needs.some((need) => isBlocking(local[need]))) {
        local[step.id] = {
          status: 'skipped',
          jobs: 0,
          reason: 'blocked-by-failure',
        };
        skip.push({ id: step.id, reason: 'blocked-by-failure' });
        changed = true;
      }
    }
  }

  const dispatch = graph.steps.filter(
    (step) =>
      local[step.id].status === 'pending' &&
      step.needs.every((need) => isSatisfied(local[need])),
  );

  const isComplete = graph.steps.every((step) =>
    TERMINAL_STATUSES.includes(local[step.id].status),
  );

  return { dispatch, skip, isComplete };
}

/**
 * Rebuilds the step state of an in-flight run from its job rows. Used to seed
 * states for runs created outside the engine, and to roll a step forward once
 * its jobs are all terminal.
 *
 * A step with no jobs keeps whatever the stored state says (it may have been
 * dispatched and skipped for lack of inputs, or its jobs may have been pruned).
 */
export function reconcileStepStates(
  graph: WorkflowGraph,
  state: WorkflowRunStepStates,
  summaries: readonly StepJobSummary[],
  now: () => string = () => new Date().toISOString(),
): WorkflowRunStepStates {
  const byTool = new Map(summaries.map((entry) => [entry.tool, entry]));
  // Start from the stored state so entries that are not part of the current
  // graph survive — jobs dropped by the assets-discovery switch, and jobs of a
  // run whose workflow was edited after it started.
  const next: WorkflowRunStepStates = {};
  for (const [id, entry] of Object.entries(state ?? {})) {
    next[id] = { ...entry };
  }

  for (const step of graph.steps) {
    const existing = state?.[step.id];
    const current: RunStepState = existing
      ? { ...existing }
      : { status: 'pending', jobs: 0 };

    const jobs = byTool.get(step.run);
    if (!jobs || jobs.total === 0) {
      next[step.id] = current;
      continue;
    }

    const running = jobs.pending + jobs.inProgress;
    const timestamp = now();

    if (running > 0) {
      next[step.id] = {
        ...current,
        status: 'dispatched',
        jobs: jobs.total,
        dispatchedAt: current.dispatchedAt ?? timestamp,
        reason: undefined,
        finishedAt: undefined,
      };
      continue;
    }

    let status: RunStepStatus = 'done';
    let reason: RunStepSkipReason | undefined;
    if (jobs.failed > 0) {
      status = 'failed';
    } else if (jobs.cancelled > 0) {
      status = 'skipped';
      reason = 'run-cancelled';
    }

    next[step.id] = {
      status,
      jobs: jobs.total,
      reason,
      dispatchedAt: current.dispatchedAt ?? timestamp,
      finishedAt: current.finishedAt ?? timestamp,
    };
  }

  return next;
}

/** Marks a job as dispatched with the number of jobs its fan-out produced. */
export function withStepDispatched(
  state: WorkflowRunStepStates,
  stepId: string,
  jobs: number,
  now: () => string = () => new Date().toISOString(),
): WorkflowRunStepStates {
  const current = state[stepId] ?? { status: 'pending' as const, jobs: 0 };
  return {
    ...state,
    [stepId]: {
      ...current,
      status: 'dispatched',
      jobs,
      dispatchedAt: current.dispatchedAt ?? now(),
      reason: undefined,
      finishedAt: undefined,
    },
  };
}

/** Marks a job as skipped with an explicit reason. */
export function withStepSkipped(
  state: WorkflowRunStepStates,
  stepId: string,
  reason: RunStepSkipReason,
  jobs = 0,
  now: () => string = () => new Date().toISOString(),
): WorkflowRunStepStates {
  const current = state[stepId] ?? { status: 'pending' as const, jobs: 0 };
  return {
    ...state,
    [stepId]: {
      status: 'skipped',
      jobs: jobs || current.jobs,
      reason,
      dispatchedAt: current.dispatchedAt,
      finishedAt: current.finishedAt ?? now(),
    },
  };
}

/** Marks a job as failed (dispatch blew up before any job row was created). */
export function withStepFailed(
  state: WorkflowRunStepStates,
  stepId: string,
  now: () => string = () => new Date().toISOString(),
): WorkflowRunStepStates {
  const current = state[stepId] ?? { status: 'pending' as const, jobs: 0 };
  return {
    ...state,
    [stepId]: {
      ...current,
      status: 'failed',
      dispatchedAt: current.dispatchedAt ?? now(),
      finishedAt: current.finishedAt ?? now(),
    },
  };
}
