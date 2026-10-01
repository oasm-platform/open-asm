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

  it('draws one dashed edge per need, animated only on the running step', () => {
    const { edges } = buildWorkflowGraphLayout(chain);

    expect(edges.map((edge) => edge.id)).toEqual([
      'scan_subdomain->port_scan',
      'port_scan->http_probe',
      'http_probe->take_screenshot',
    ]);
    expect(edges.find((edge) => edge.id === 'port_scan->http_probe')?.animated).toBe(true);
    expect(edges.find((edge) => edge.id === 'scan_subdomain->port_scan')?.animated).toBe(false);
    expect(edges[0].style?.strokeDasharray).toBe('4 4');
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
