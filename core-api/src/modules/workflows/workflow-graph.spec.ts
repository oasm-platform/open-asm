import type { ToolCategory } from '@/common/enums/enum';
import {
  buildWorkflowGraph,
  filterGraphByAssetsDiscovery,
  jobEntries,
  planAdvance,
  reconcileStepStates,
  validateWorkflowGraph,
  withStepDispatched,
  withStepFailed,
  withStepSkipped,
  WorkflowGraphError,
  type RunStepState,
  type StepJobSummary,
  type WorkflowJobsInput,
  type WorkflowRunStepStates,
} from './workflow-graph';

/** Convenience: wrap job definitions in the shape buildWorkflowGraph accepts. */
function content(jobs: WorkflowJobsInput) {
  return { jobs };
}

function stateOf(
  entries: Record<string, Partial<RunStepState>>,
): WorkflowRunStepStates {
  const states: WorkflowRunStepStates = {};
  for (const [id, entry] of Object.entries(entries)) {
    states[id] = { status: 'pending', jobs: 0, ...entry };
  }
  return states;
}

function summary(
  tool: string,
  counts: Partial<Omit<StepJobSummary, 'tool'>>,
): StepJobSummary {
  return {
    tool,
    total: 0,
    pending: 0,
    inProgress: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    ...counts,
  };
}

/** The canonical chain: a → b → c, referenced by job id. */
const chainJobs: WorkflowJobsInput = {
  a: { name: 'Subfinder', run: 'subfinder' },
  b: { name: 'Naabu', run: 'naabu', needs: ['a'] },
  c: { name: 'HTTPX', run: 'httpx', needs: ['b'] },
};

describe('jobEntries', () => {
  it('keeps insertion order of the jobs map', () => {
    expect(jobEntries({ first: { run: 'a' }, second: { run: 'b' } })).toEqual([
      ['first', { run: 'a' }],
      ['second', { run: 'b' }],
    ]);
  });

  it('derives ids for the legacy array form from the name, then the tool', () => {
    expect(
      jobEntries([{ name: 'Port Scan', run: 'naabu' }, { run: 'httpx' }]),
    ).toEqual([
      ['Port Scan', { name: 'Port Scan', run: 'naabu' }],
      ['httpx', { run: 'httpx' }],
    ]);
  });

  it('handles missing jobs', () => {
    expect(jobEntries(undefined)).toEqual([]);
    expect(jobEntries(null)).toEqual([]);
  });
});

describe('buildWorkflowGraph', () => {
  it('keeps a needs-free workflow as parallel roots', () => {
    const graph = buildWorkflowGraph(
      content({
        port_scan: { run: 'naabu' },
        http_probe: { run: 'httpx' },
        vuln_scan: { run: 'nuclei' },
      }),
    );

    expect(graph.steps.map((step) => step.needs)).toEqual([[], [], []]);
    expect(graph.steps.map((step) => step.id)).toEqual([
      'port_scan',
      'http_probe',
      'vuln_scan',
    ]);
    expect(graph.steps.map((step) => step.order)).toEqual([0, 1, 2]);
  });

  it('resolves a needs chain by job id', () => {
    const graph = buildWorkflowGraph(content(chainJobs));

    expect(graph.byId.get('c')?.needs).toEqual(['b']);
    expect(graph.dependents.get('a')).toEqual(['b']);
    expect(graph.dependents.get('c')).toBeUndefined();
  });

  it('falls back to the id when a job has no display name', () => {
    const graph = buildWorkflowGraph(
      content({ port_scan: { run: 'naabu' } }),
    );

    expect(graph.byId.get('port_scan')?.name).toBe('port_scan');
  });

  it('accepts a bare string for needs', () => {
    const graph = buildWorkflowGraph(
      content({ a: { run: 'naabu' }, b: { run: 'httpx', needs: 'a' } }),
    );

    expect(graph.byId.get('b')?.needs).toEqual(['a']);
  });

  it('deduplicates repeated needs', () => {
    const graph = buildWorkflowGraph(
      content({
        a: { run: 'naabu' },
        b: { run: 'httpx', needs: ['a', 'a'] },
      }),
    );

    expect(graph.byId.get('b')?.needs).toEqual(['a']);
  });

  it('supports a diamond dependency', () => {
    const graph = buildWorkflowGraph(
      content({
        a: { run: 'subfinder' },
        b: { run: 'naabu', needs: ['a'] },
        c: { run: 'httpx', needs: ['a'] },
        d: { run: 'screenshot', needs: ['b', 'c'] },
      }),
    );

    expect(graph.dependents.get('a')).toEqual(['b', 'c']);
    expect(graph.byId.get('d')?.needs).toEqual(['b', 'c']);
  });

  it('normalizes the legacy array form and resolves its needs', () => {
    const graph = buildWorkflowGraph(
      content([
        { name: 'Scan Subdomain', run: 'subfinder' },
        { name: 'Port Scan', run: 'naabu', needs: ['Scan Subdomain'] },
      ]),
    );

    expect(graph.steps.map((step) => step.id)).toEqual([
      'Scan Subdomain',
      'Port Scan',
    ]);
    expect(graph.byId.get('Port Scan')?.needs).toEqual(['Scan Subdomain']);
  });

  it('throws on a duplicate job id', () => {
    expect(() =>
      buildWorkflowGraph(
        content([
          { name: 'Same', run: 'naabu' },
          { name: 'Same', run: 'httpx' },
        ]),
      ),
    ).toThrow(/duplicate job id/i);
  });

  it('throws on a duplicate tool', () => {
    expect(() =>
      buildWorkflowGraph(
        content({ first: { run: 'naabu' }, second: { run: 'naabu' } }),
      ),
    ).toThrow(/duplicate/i);
  });

  it('throws on an unknown need and lists the known job ids', () => {
    expect(() =>
      buildWorkflowGraph(
        content({ a: { run: 'naabu', needs: ['ghost'] } }),
      ),
    ).toThrow(/unknown job "ghost".*known jobs: a/i);
  });

  it('rejects a tool name used where a job id is required', () => {
    // The reference is the map key, never the display name or the tool.
    expect(() =>
      buildWorkflowGraph(
        content({
          port_scan: { name: 'Port Scan', run: 'naabu' },
          http_probe: { run: 'httpx', needs: ['Port Scan'] },
        }),
      ),
    ).toThrow(/unknown job "Port Scan"/);
  });

  it('throws on a self reference', () => {
    expect(() =>
      buildWorkflowGraph(content({ a: { run: 'naabu', needs: ['a'] } })),
    ).toThrow(/itself/i);
  });

  it('throws on a cycle', () => {
    expect(() =>
      buildWorkflowGraph(
        content({ a: { run: 'naabu', needs: ['b'] }, b: { run: 'httpx', needs: ['a'] } }),
      ),
    ).toThrow(/cycl/i);
  });

  it('throws when a job has no run tool', () => {
    expect(() =>
      buildWorkflowGraph(content({ a: { run: '' } })),
    ).toThrow(/run/i);
  });

  it('treats an empty workflow as an empty graph', () => {
    expect(buildWorkflowGraph(content({})).steps).toEqual([]);
    expect(buildWorkflowGraph(undefined).steps).toEqual([]);
  });
});

describe('validateWorkflowGraph', () => {
  it('returns no errors for a valid graph', () => {
    expect(
      validateWorkflowGraph(content({ a: { run: 'naabu' } })),
    ).toEqual([]);
  });

  it('returns every structural error instead of throwing', () => {
    const errors = validateWorkflowGraph(
      content({
        a: { run: 'naabu', needs: ['ghost'] },
      }),
    );

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join(' ')).toMatch(/unknown job/i);
  });
});

describe('filterGraphByAssetsDiscovery', () => {
  const categories = new Map<string, ToolCategory>([
    ['subfinder', 'subdomains' as ToolCategory],
    ['naabu', 'ports_scanner' as ToolCategory],
  ]);

  it('returns the graph untouched when assets discovery is enabled', () => {
    const graph = buildWorkflowGraph(content(chainJobs));

    expect(filterGraphByAssetsDiscovery(graph, true, categories).steps).toHaveLength(3);
  });

  it('drops SUBDOMAINS jobs and rewires their dependents when disabled', () => {
    const graph = buildWorkflowGraph(content(chainJobs));

    const filtered = filterGraphByAssetsDiscovery(graph, false, categories);

    expect(filtered.steps.map((step) => step.id)).toEqual(['b', 'c']);
    expect(filtered.byId.get('b')?.needs).toEqual([]);
    expect(filtered.byId.get('c')?.needs).toEqual(['b']);
  });

  it('keeps jobs whose tool category is unknown', () => {
    const graph = buildWorkflowGraph(content({ a: { run: 'mystery-tool' } }));

    expect(
      filterGraphByAssetsDiscovery(graph, false, categories).steps,
    ).toHaveLength(1);
  });
});

describe('planAdvance', () => {
  const chain = buildWorkflowGraph(content(chainJobs));

  it('dispatches every root of a needs-free graph', () => {
    const parallel = buildWorkflowGraph(
      content({
        a: { run: 'naabu' },
        b: { run: 'httpx' },
        c: { run: 'nuclei' },
      }),
    );

    const plan = planAdvance(parallel, stateOf({}));

    expect(plan.dispatch.map((step) => step.id)).toEqual(['a', 'b', 'c']);
    expect(plan.skip).toEqual([]);
    expect(plan.isComplete).toBe(false);
  });

  it('only dispatches the roots of a chain', () => {
    const plan = planAdvance(chain, stateOf({}));

    expect(plan.dispatch.map((step) => step.id)).toEqual(['a']);
  });

  it('does not dispatch while a dependency is still running', () => {
    const plan = planAdvance(
      chain,
      stateOf({ a: { status: 'dispatched', jobs: 1, dispatchedAt: 'now' } }),
    );

    expect(plan.dispatch).toEqual([]);
    expect(plan.isComplete).toBe(false);
  });

  it('dispatches the next job once the dependency is done', () => {
    const plan = planAdvance(
      chain,
      stateOf({ a: { status: 'done', jobs: 2, finishedAt: 'now' } }),
    );

    expect(plan.dispatch.map((step) => step.id)).toEqual(['b']);
  });

  it('unblocks dependents when a dependency was skipped with no inputs', () => {
    const plan = planAdvance(
      chain,
      stateOf({ a: { status: 'skipped', jobs: 0, reason: 'no-inputs' } }),
    );

    expect(plan.dispatch.map((step) => step.id)).toEqual(['b']);
  });

  it('skips dependents when a dependency failed', () => {
    const plan = planAdvance(
      chain,
      stateOf({ a: { status: 'failed', jobs: 1 } }),
    );

    expect(plan.dispatch).toEqual([]);
    expect(plan.skip).toEqual([
      { id: 'b', reason: 'blocked-by-failure' },
      { id: 'c', reason: 'blocked-by-failure' },
    ]);
    expect(plan.isComplete).toBe(true);
  });

  it('skips a job blocked by a run-cancelled dependency', () => {
    const plan = planAdvance(
      chain,
      stateOf({ a: { status: 'skipped', jobs: 1, reason: 'run-cancelled' } }),
    );

    expect(plan.skip).toEqual([
      { id: 'b', reason: 'blocked-by-failure' },
      { id: 'c', reason: 'blocked-by-failure' },
    ]);
  });

  it('reports completion once every job is terminal', () => {
    const plan = planAdvance(
      chain,
      stateOf({
        a: { status: 'done', jobs: 1 },
        b: { status: 'done', jobs: 1 },
        c: { status: 'done', jobs: 1 },
      }),
    );

    expect(plan.dispatch).toEqual([]);
    expect(plan.isComplete).toBe(true);
  });

  it('does not mutate the state it is given', () => {
    const state = stateOf({ a: { status: 'failed', jobs: 1 } });

    planAdvance(chain, state);

    expect(state.b).toBeUndefined();
    expect(state.a.status).toBe('failed');
  });
});

describe('reconcileStepStates', () => {
  const chain = buildWorkflowGraph(content(chainJobs));

  it('marks a job dispatched while its jobs are still running', () => {
    const state = reconcileStepStates(chain, stateOf({}), [
      summary('subfinder', { total: 2, pending: 1, inProgress: 1 }),
    ]);

    expect(state.a).toMatchObject({ status: 'dispatched', jobs: 2 });
  });

  it('marks a job done when every job row completed', () => {
    const state = reconcileStepStates(chain, stateOf({}), [
      summary('subfinder', { total: 3, completed: 3 }),
    ]);

    expect(state.a).toMatchObject({ status: 'done', jobs: 3 });
  });

  it('marks a job failed when any job failed and none is left', () => {
    const state = reconcileStepStates(chain, stateOf({}), [
      summary('subfinder', { total: 2, completed: 1, failed: 1 }),
    ]);

    expect(state.a.status).toBe('failed');
  });

  it('keeps a job dispatched when a sibling row is still running', () => {
    const state = reconcileStepStates(chain, stateOf({}), [
      summary('subfinder', { total: 2, inProgress: 1, failed: 1 }),
    ]);

    expect(state.a.status).toBe('dispatched');
  });

  it('marks a cancelled job skipped with the run-cancelled reason', () => {
    const state = reconcileStepStates(chain, stateOf({}), [
      summary('subfinder', { total: 1, cancelled: 1 }),
    ]);

    expect(state.a).toMatchObject({
      status: 'skipped',
      reason: 'run-cancelled',
    });
  });

  it('leaves jobs with no rows alone', () => {
    const state = reconcileStepStates(chain, stateOf({}), []);
    expect(state.a.status).toBe('pending');
    expect(state.b.status).toBe('pending');
  });

  it('preserves dispatchedAt across reconciliations', () => {
    const first = reconcileStepStates(chain, stateOf({}), [
      summary('subfinder', { total: 1, inProgress: 1 }),
    ]);
    const second = reconcileStepStates(chain, first, [
      summary('subfinder', { total: 1, completed: 1 }),
    ]);

    expect(second.a.dispatchedAt).toBe(first.a.dispatchedAt);
    expect(second.a.status).toBe('done');
  });

  it('keeps state entries that are not part of the graph', () => {
    const state = reconcileStepStates(
      chain,
      stateOf({
        dropped_job: { status: 'skipped', reason: 'assets-discovery-off' },
      }),
      [],
    );

    expect(state['dropped_job']).toMatchObject({
      status: 'skipped',
      reason: 'assets-discovery-off',
    });
    expect(state.a.status).toBe('pending');
  });
});

describe('step state helpers', () => {
  it('withStepDispatched records the fan-out size and keeps the first dispatch time', () => {
    const first = withStepDispatched(stateOf({}), 'a', 3, () => 't1');
    const second = withStepDispatched(first, 'a', 0, () => 't2');

    expect(first.a).toMatchObject({
      status: 'dispatched',
      jobs: 3,
      dispatchedAt: 't1',
    });
    expect(second.a).toMatchObject({
      status: 'dispatched',
      jobs: 0,
      dispatchedAt: 't1',
    });
  });

  it('withStepSkipped marks the job terminal and keeps existing job counts', () => {
    const dispatched = withStepDispatched(stateOf({}), 'a', 2, () => 't1');
    const skipped = withStepSkipped(
      dispatched,
      'a',
      'no-inputs',
      0,
      () => 't2',
    );

    expect(skipped.a).toMatchObject({
      status: 'skipped',
      jobs: 2,
      reason: 'no-inputs',
      finishedAt: 't2',
    });
  });

  it('withStepFailed is terminal and idempotent about the timestamps', () => {
    const failed = withStepFailed(stateOf({}), 'a', () => 't1');
    const again = withStepFailed(failed, 'a', () => 't2');

    expect(failed.a.status).toBe('failed');
    expect(again.a.finishedAt).toBe('t1');
  });

  it('exposes WorkflowGraphError for callers that need the full list', () => {
    try {
      buildWorkflowGraph(content({ a: { run: '' }, b: { run: 'naabu' } }));
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(WorkflowGraphError);
      expect((error as WorkflowGraphError).errors.length).toBeGreaterThan(0);
    }
  });
});
