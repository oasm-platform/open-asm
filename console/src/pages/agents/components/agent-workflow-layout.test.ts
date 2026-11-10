import type { WorkflowNodeDto } from '@/services/apis/gen/queries';
import { describe, expect, it } from 'vitest';
import { buildWorkflowLayout, workflowDepths } from './agent-workflow-layout';

const node = (
  id: string,
  overrides: Partial<WorkflowNodeDto> = {},
): WorkflowNodeDto => ({
  id,
  name: 'recon',
  status: 'completed',
  objective: `Job ${id}`,
  stepId: 't1',
  after: [],
  waitingOn: [],
  derivedFrom: [],
  continuesFrom: null,
  outcome: null,
  summary: null,
  findings: [],
  error: null,
  createdAt: '2026-11-10T00:00:00.000Z',
  startedAt: null,
  completedAt: null,
  ...overrides,
});

const steps = [
  { id: 't3', content: 'Report', status: 'pending', sortOrder: 2 },
  { id: 't2', content: 'Validate', status: 'in_progress', sortOrder: 1 },
  { id: 't1', content: 'Map', status: 'completed', sortOrder: 0 },
] as const;

const layoutOf = (
  nodes: WorkflowNodeDto[],
  planSteps: Array<(typeof steps)[number]> = [...steps],
  selectedId?: string,
) => {
  const layout = buildWorkflowLayout({ goal: 'Assess', steps: planSteps, nodes }, selectedId);
  const at = (id: string) => layout.nodes.find((n) => n.id === id)!.position;
  const links = layout.edges.map((e) => `${e.data!.kind}:${e.source}->${e.target}`);
  return { ...layout, at, links };
};

describe('workflowDepths', () => {
  it('puts each node one right of its deepest parent and ignores unknown links', () => {
    const depths = workflowDepths([
      node('a'),
      node('b', { after: ['a'] }),
      node('c', { derivedFrom: ['b'] }),
      node('d', { continuesFrom: 'c', after: ['gone'] }),
    ]);
    expect(Object.fromEntries(depths)).toEqual({ a: 0, b: 1, c: 2, d: 3 });
  });
});

describe('buildWorkflowLayout', () => {
  it('chains the steps left to right, each followed by its agents', () => {
    const { at } = layoutOf([
      node('a'),
      node('a2', { continuesFrom: 'a' }),
      node('v', { stepId: 't2' }),
    ]);
    const xs = ['root', 'step:t1', 'a', 'a2', 'step:t2', 'v', 'step:t3'].map(
      (id) => at(id).x,
    );
    expect(xs).toEqual([...xs].sort((p, q) => p - q));
    expect(new Set(xs).size).toBe(xs.length);
  });

  it("feeds a step's last results into the next step", () => {
    const { links } = layoutOf([
      node('a'),
      node('b'),
      node('a2', { continuesFrom: 'a' }),
      node('v', { stepId: 't2' }),
    ]);
    expect(links).toEqual([
      'plan:root->step:t1',
      // a was followed up by a2, so a2 and b are what step 1 handed on
      'handoff:b->step:t2',
      'handoff:a2->step:t2',
      'handoff:v->step:t3',
      'dispatch:step:t1->a',
      'dispatch:step:t1->b',
      'continue:a->a2',
      'dispatch:step:t2->v',
    ]);
  });

  it('passes a step without agents straight on to the next', () => {
    const { links } = layoutOf([node('v', { stepId: 't3' })]);
    expect(links.slice(0, 3)).toEqual([
      'plan:root->step:t1',
      'plan:step:t1->step:t2',
      'plan:step:t2->step:t3',
    ]);
  });

  it('links agents by how they relate, `after` winning over the same source', () => {
    const { links, edges } = layoutOf(
      [
        node('a', { status: 'in_progress' }),
        node('b', { status: 'pending', after: ['a'], waitingOn: ['a'], derivedFrom: ['a'] }),
        node('c', { stepId: 't2', derivedFrom: ['a'] }),
      ],
      [steps[2], steps[1]],
    );
    expect(links).toEqual(
      expect.arrayContaining(['after:a->b', 'derived:a->c']),
    );
    expect(links).not.toContain('derived:a->b');
    expect(edges.find((e) => e.id === 'after:a->b')?.data?.live).toBe(true);
  });

  it('stacks siblings of one step without overlap', () => {
    const { at } = layoutOf([node('a'), node('b'), node('c')], [steps[2]]);
    expect(at('b').y).toBeGreaterThanOrEqual(at('a').y + 84);
    expect(at('c').y).toBeGreaterThanOrEqual(at('b').y + 84);
    expect(at('a').x).toBe(at('c').x);
  });

  it('hangs agents off the goal without a plan, and below the plan outside it', () => {
    const bare = layoutOf([node('a', { stepId: null })], []);
    expect(bare.links).toEqual(['dispatch:root->a']);
    expect(bare.at('a').x).toBeGreaterThan(0);

    const mixed = layoutOf([node('a'), node('x', { stepId: null })], [steps[2]]);
    expect(mixed.links).toContain('dispatch:root->x');
    expect(mixed.at('x').y).toBeGreaterThan(mixed.at('a').y);
  });

  it('highlights the links of the selected agent and dims the rest', () => {
    const { edges, nodes } = layoutOf(
      [node('a'), node('b', { after: ['a'] }), node('c')],
      [steps[2]],
      'b',
    );
    const byTarget = (id: string) => edges.find((e) => e.target === id)!.data!;
    expect(byTarget('b')).toMatchObject({ highlighted: true, dimmed: false });
    expect(byTarget('c')).toMatchObject({ highlighted: false, dimmed: true });
    expect(nodes.find((n) => n.id === 'b')?.data).toMatchObject({ selected: true });
  });
});
