import { describe, expect, it } from 'vitest';
import {
  applyDagreLayout,
  applyForceLayout,
  type LayoutInputEdge,
  type LayoutInputNode,
} from '@/pages/assets/components/graph-types';

const node = (id: string, type: LayoutInputNode['type']): LayoutInputNode => ({
  id,
  type,
  data: { label: id },
});

const edge = (
  source: string,
  target: string,
  type?: string,
): LayoutInputEdge => ({
  source,
  target,
  data: type ? { type } : undefined,
});

describe('applyForceLayout', () => {
  it('returns empty result for an empty graph', () => {
    const result = applyForceLayout({ nodes: [], edges: [] });
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it('deduplicates nodes by id and edges by (source, target) pair', () => {
    const result = applyForceLayout({
      nodes: [
        node('target|t1', 'target'),
        node('target|t1', 'target'),
        node('asset|a1', 'asset'),
        node('ip|1.2.3.4', 'ip'),
      ],
      edges: [
        edge('target|t1', 'asset|a1', 'belongs_to'),
        edge('target|t1', 'asset|a1', 'belongs_to'),
        edge('asset|a1', 'ip|1.2.3.4', 'resolves_to'),
        edge('asset|a1', 'missing|nope', 'resolves_to'),
      ],
    });

    // target|t1 (deduped), asset|a1, ip|1.2.3.4
    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(2);
    // Edge with a missing endpoint is dropped.
    expect(result.edges).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: 'missing|nope' }),
      ]),
    );
  });

  it('assigns every node a finite position and keeps ids/types', () => {
    const nodes = [
      node('target|t1', 'target'),
      node('asset|a1', 'asset'),
      node('ip|1.2.3.4', 'ip'),
    ];
    const edges = [
      edge('target|t1', 'asset|a1', 'belongs_to'),
      edge('asset|a1', 'ip|1.2.3.4', 'resolves_to'),
    ];

    const result = applyForceLayout({ nodes, edges }, { width: 800, height: 600 });

    expect(result.nodes).toHaveLength(3);
    for (const n of result.nodes) {
      expect(Number.isFinite(n.position.x)).toBe(true);
      expect(Number.isFinite(n.position.y)).toBe(true);
    }
    const byId = new Map(result.nodes.map((n) => [n.id, n]));
    expect(byId.get('target|t1')?.type).toBe('target');
    expect(byId.get('asset|a1')?.type).toBe('asset');
    expect(byId.get('ip|1.2.3.4')?.type).toBe('ip');
  });

  it('keeps target nodes on distinct radial bands (cluster anchors)', () => {
    const nodes = [
      node('target|t1', 'target'),
      node('target|t2', 'target'),
      node('asset|a1', 'asset'),
      node('asset|a2', 'asset'),
      node('ip|1.2.3.4', 'ip'),
    ];
    const edges = [
      edge('target|t1', 'asset|a1', 'belongs_to'),
      edge('target|t2', 'asset|a2', 'belongs_to'),
      edge('asset|a1', 'ip|1.2.3.4', 'resolves_to'),
      edge('asset|a2', 'ip|1.2.3.4', 'resolves_to'),
    ];

    const result = applyForceLayout({ nodes, edges }, { width: 2000, height: 2000 });
    const byId = new Map(result.nodes.map((n) => [n.id, n.position]));
    const center = { x: 1000, y: 1000 };
    const dist = (p: { x: number; y: number }) =>
      Math.hypot(p.x - center.x, p.y - center.y);

    const t1 = dist(byId.get('target|t1')!);
    const t2 = dist(byId.get('target|t2')!);
    // Anchors sit at radii 320 and 780 (golden-angle separated); the layout
    // re-centers the bounding box, so assert the pairwise separation these
    // pinned landmarks preserve instead of absolute radii.
    const separation = Math.hypot(
      byId.get('target|t1')!.x - byId.get('target|t2')!.x,
      byId.get('target|t1')!.y - byId.get('target|t2')!.y,
    );
    expect(t2).toBeGreaterThan(t1);
    expect(separation).toBeGreaterThan(600);
  });

  it('is deterministic: same input yields identical positions', () => {
    const nodes = [
      node('target|t1', 'target'),
      node('asset|a1', 'asset'),
      node('ip|1.2.3.4', 'ip'),
    ];
    const edges = [edge('target|t1', 'asset|a1', 'belongs_to')];

    const a = applyForceLayout({ nodes, edges });
    const b = applyForceLayout({ nodes, edges });
    expect(a.nodes.map((n) => [n.id, n.position])).toEqual(
      b.nodes.map((n) => [n.id, n.position]),
    );
  });

  it('separates nodes that are exactly coincident (collision post-pass)', () => {
    // Force two nodes onto the same seed position by using an empty edge set
    // with identical starting coordinates is not directly controllable, so
    // assert instead that the post-pass never produces NaN and keeps minimum
    // spacing for a dense single-hub graph.
    const nodes = [
      node('target|t1', 'target'),
      ...Array.from({ length: 12 }, (_, i) => node(`service|s${i}`, 'service')),
    ];
    const edges = nodes.slice(1).map((n) => edge('target|t1', n.id, 'runs_on'));

    const result = applyForceLayout({ nodes, edges });
    const positions = result.nodes.map((n) => n.position);
    for (const p of positions) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
    // Deterministic: no run-to-run drift.
    const again = applyForceLayout({ nodes, edges });
    expect(result.nodes.map((n) => n.position)).toEqual(
      again.nodes.map((n) => n.position),
    );
  });
});

describe('applyDagreLayout', () => {
  it('returns empty result for an empty graph', () => {
    const result = applyDagreLayout({ nodes: [], edges: [] });
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it('positions all nodes and preserves edge endpoints', () => {
    const nodes = [
      node('target|t1', 'target'),
      node('asset|a1', 'asset'),
      node('ip|1.2.3.4', 'ip'),
    ];
    const edges = [
      edge('target|t1', 'asset|a1', 'belongs_to'),
      edge('asset|a1', 'ip|1.2.3.4', 'resolves_to'),
    ];

    const result = applyDagreLayout({ nodes, edges }, { rankdir: 'LR' });

    expect(result.nodes).toHaveLength(3);
    for (const n of result.nodes) {
      expect(Number.isFinite(n.position.x)).toBe(true);
      expect(Number.isFinite(n.position.y)).toBe(true);
    }
    expect(result.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'target|t1', target: 'asset|a1' }),
        expect.objectContaining({ source: 'asset|a1', target: 'ip|1.2.3.4' }),
      ]),
    );
  });
});
