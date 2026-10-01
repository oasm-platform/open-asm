import type { WorkflowStepStatusDto } from '@/services/apis/gen/queries';
import { describe, expect, it } from 'vitest';
import {
  buildWorkflowGraphLayout,
  computeStepWaves,
  stepDuration,
} from './run-workflow-graph-layout';

function step(
  id: string,
  overrides: Partial<WorkflowStepStatusDto> = {},
): WorkflowStepStatusDto {
  return {
    id,
    name: id,
    run: id,
    needs: [],
    status: 'pending',
    jobs: 0,
    ...overrides,
  } as WorkflowStepStatusDto;
}

/** The shipped domain_discovery chain, as the API returns it. */
const chain: WorkflowStepStatusDto[] = [
  step('scan_subdomain', { name: 'Scan Subdomain', run: 'subfinder', status: 'done', jobs: 1 }),
  step('port_scan', {
    name: 'Port Scan',
    run: 'naabu',
    needs: ['scan_subdomain'],
    status: 'done',
    jobs: 13,
  }),
  step('http_probe', {
    name: 'HTTP Probe',
    run: 'httpx',
    needs: ['port_scan'],
    status: 'dispatched',
    jobs: 42,
    dispatchedAt: '2026-01-01T00:00:00.000Z',
  }),
  step('take_screenshot', {
    name: 'Take Screenshot',
    run: 'screenshot',
    needs: ['http_probe'],
    status: 'pending',
  }),
];

describe('computeStepWaves', () => {
  it('puts a needs chain in one wave per link', () => {
    expect([...computeStepWaves(chain).entries()]).toEqual([
      ['scan_subdomain', 0],
      ['port_scan', 1],
      ['http_probe', 2],
      ['take_screenshot', 3],
    ]);
  });

  it('puts every needs-free step in the first wave', () => {
    const waves = computeStepWaves([
      step('naabu'),
      step('httpx'),
      step('nuclei'),
    ]);

    expect([...waves.values()]).toEqual([0, 0, 0]);
  });

  it('places a diamond on its deepest dependency', () => {
    const waves = computeStepWaves([
      step('a'),
      step('b', { needs: ['a'] }),
      step('c', { needs: ['a'] }),
      step('d', { needs: ['b', 'c'] }),
    ]);

    expect(waves.get('a')).toBe(0);
    expect(waves.get('b')).toBe(1);
    expect(waves.get('c')).toBe(1);
    expect(waves.get('d')).toBe(2);
  });

  it('does not hang on a cycle the backend should have rejected', () => {
    const waves = computeStepWaves([
      step('a', { needs: ['b'] }),
      step('b', { needs: ['a'] }),
    ]);

    expect(waves.size).toBe(2);
    expect([...waves.values()].every((wave) => Number.isFinite(wave))).toBe(true);
  });
});

describe('buildWorkflowGraphLayout', () => {
  it('renders one wave label per wave and one node per step', () => {
    const { nodes, waves } = buildWorkflowGraphLayout(chain);

    expect(waves).toBe(4);
    expect(nodes.filter((node) => node.type === 'waveLabel')).toHaveLength(4);
    expect(nodes.filter((node) => node.type === 'workflowStep')).toHaveLength(4);
  });

  it('left-to-right columns follow the waves, one step per column for a chain', () => {
    const { nodes } = buildWorkflowGraphLayout(chain);
    const xs = ['scan_subdomain', 'port_scan', 'http_probe', 'take_screenshot'].map(
      (id) => nodes.find((node) => node.id === id)!.position.x,
    );

    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(new Set(xs).size).toBe(4);
  });

  it('stacks parallel steps in the same column', () => {
    const { nodes } = buildWorkflowGraphLayout([
      step('naabu'),
      step('httpx'),
      step('nuclei'),
    ]);

    const positions = ['naabu', 'httpx', 'nuclei'].map(
      (id) => nodes.find((node) => node.id === id)!.position,
    );

    expect(new Set(positions.map((p) => p.x)).size).toBe(1);
    expect(new Set(positions.map((p) => p.y)).size).toBe(3);
  });

  it('counts the finished steps of each wave in its label', () => {
    const { nodes } = buildWorkflowGraphLayout(chain);

    expect(nodes.find((node) => node.id === 'wave-0')?.data).toMatchObject({
      wave: 1,
      total: 1,
      done: 1,
      jobs: 1,
    });
    expect(nodes.find((node) => node.id === 'wave-2')?.data).toMatchObject({
      wave: 3,
      total: 1,
      done: 0,
      jobs: 42,
    });
  });

  it('draws one custom edge per need, marking the running step’s dependency as active', () => {
    const { edges } = buildWorkflowGraphLayout(chain);

    expect(edges.map((edge) => edge.id)).toEqual([
      'scan_subdomain->port_scan',
      'port_scan->http_probe',
      'http_probe->take_screenshot',
    ]);
    expect(edges.every((edge) => edge.type === 'step')).toBe(true);

    // Only the handover into the executing step animates: http_probe is the
    // step running, so the edge that feeds it carries the travelling arrows.
    const live = edges.find((edge) => edge.id === 'port_scan->http_probe');
    expect(live?.data).toEqual({ active: true });
    expect(live?.animated).toBe(true);
    expect(live?.style?.stroke).toBe('var(--primary)');
    expect(live?.style?.strokeWidth).toBe(2);
    // The active edge is solid (`undefined`) — the motion comes from the arrows,
    // not from a marching-ants dash.
    expect(live?.style?.strokeDasharray).toBeUndefined();

    const idle = edges.find((edge) => edge.id === 'scan_subdomain->port_scan');
    expect(idle?.data).toEqual({ active: false });
    expect(idle?.animated).toBe(false);
    expect(idle?.style?.strokeDasharray).toBe('4 4');
  });

  it('keeps an edge idle until the step it feeds is the one running', () => {
    const pendingOnly = buildWorkflowGraphLayout([
      step('a', { status: 'done' }),
      step('b', { needs: ['a'], status: 'pending' }),
    ]);

    expect(pendingOnly.edges[0].data).toEqual({ active: false });
  });

  it('marks a failed edge and a skipped one differently', () => {
    const { edges } = buildWorkflowGraphLayout([
      step('a', { status: 'done' }),
      step('b', { needs: ['a'], status: 'failed' }),
      step('c', { needs: ['b'], status: 'skipped', reason: 'blocked-by-failure' }),
    ]);

    expect(edges[0].style?.stroke).toBe('var(--destructive)');
    expect(edges[1].style?.stroke).toBe('var(--border)');
  });

  it('carries the step detail the node renders', () => {
    const { nodes } = buildWorkflowGraphLayout(chain);
    const screenshot = nodes.find((node) => node.id === 'take_screenshot');

    expect(screenshot?.data).toMatchObject({
      id: 'take_screenshot',
      label: 'Take Screenshot',
      run: 'screenshot',
      status: 'pending',
      needs: ['http_probe'],
      jobs: 0,
    });
  });

  it('returns nothing for a run without steps', () => {
    const { nodes, edges, waves } = buildWorkflowGraphLayout([]);

    expect(nodes).toEqual([]);
    expect(edges).toEqual([]);
    expect(waves).toBe(0);
  });
});

describe('stepDuration', () => {
  it('is undefined until the step has both timestamps', () => {
    expect(stepDuration(step('a'))).toBeUndefined();
    expect(
      stepDuration(step('a', { dispatchedAt: '2026-01-01T00:00:00.000Z' })),
    ).toBeUndefined();
  });

  it('formats seconds and minutes', () => {
    expect(
      stepDuration(
        step('a', {
          dispatchedAt: '2026-01-01T00:00:00.000Z',
          finishedAt: '2026-01-01T00:00:12.000Z',
        }),
      ),
    ).toBe('12s');
    expect(
      stepDuration(
        step('a', {
          dispatchedAt: '2026-01-01T00:00:00.000Z',
          finishedAt: '2026-01-01T00:01:30.000Z',
        }),
      ),
    ).toBe('1m 30s');
  });
});
