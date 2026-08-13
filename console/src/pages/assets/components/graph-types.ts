/**
 * Framework-agnostic node shape matching the API DTO.
 *
 * `clusterColor` and `alert` are client-side presentation fields injected by
 * the graph view after layout — they are never part of the API payload.
 */
export type GraphNodeData = {
  label: string;
  metadata?: Record<string, unknown>;
  clusterColor?: string;
  alert?: boolean;
};

/** Edge data shape from the API. */
export type GraphEdgeData = {
  type?: string;
  label?: string;
};

/** All node types present in the graph. */
export type NodeType =
  | 'target'
  | 'asset'
  | 'ip'
  | 'service'
  | 'technology'
  | 'tls'
  | 'statusCode';

/** Distinct hex color for each node type (badges / fallback fill). */
export const NODE_TYPE_COLORS: Record<NodeType, string> = {
  target: '#3b82f6',
  asset: '#22c55e',
  ip: '#a855f7',
  service: '#f97316',
  technology: '#14b8a6',
  tls: '#eab308',
  statusCode: '#ef4444',
};

/**
 * Soft palette used to color connected components (one color per target
 * cluster), matching the reference graph style where communities share a hue.
 */
export const CLUSTER_COLORS = [
  '#7ea6d8', // blue
  '#8aa869', // olive green
  '#c49ad6', // plum
  '#d88e7e', // terracotta
  '#6fb6ab', // teal
  '#c9b36b', // sand
];

/** Input node extending GraphNodeData with id and type for layout. */
export type LayoutInputNode = {
  id: string;
  type: NodeType;
  data: GraphNodeData;
};

/** Input edge from the API. */
export type LayoutInputEdge = {
  source: string;
  target: string;
  data?: GraphEdgeData;
};

/** Output node positioned by the layout pass, compatible with React Flow. */
export type LayoutOutputNode = {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: GraphNodeData;
};

/** Output edge compatible with React Flow. */
export type LayoutOutputEdge = {
  id: string;
  source: string;
  target: string;
  data?: GraphEdgeData;
};

/** Result of the layout pass. */
export type LayoutResult = {
  nodes: LayoutOutputNode[];
  edges: LayoutOutputEdge[];
};

/** Approximate node bounding box used for force-based spacing. */
const NODE_BOX = 96;

/**
 * Compute an organic force-directed layout for a graph.
 *
 * A small self-contained Fruchterman–Reingold simulation (repulsion ~1/r,
 * attraction ~d²/k, displacement clamped by a cooling temperature) with a
 * deterministic golden-angle spiral seed, so the same input always yields the
 * same output. Temperature clamping keeps the pass numerically stable even
 * for dense single-component graphs.
 *
 * Nodes are deduplicated by id. Edges are deduplicated by (source, target)
 * pair and dropped when an endpoint is missing.
 *
 * Repulsion uses a uniform spatial grid (cell = 2× ideal edge length,
 * 3×3 neighborhood) instead of a full O(n²) sweep. The force range covers
 * ~2.8× the ideal edge length, which carries most of the FR repulsion, while
 * keeping the pass interactive for graphs up to a few thousand nodes. The
 * grid is rebuilt each iteration and iteration order is fully deterministic,
 * so output stays stable.
 */
export function applyForceLayout(
  graphData: { nodes: LayoutInputNode[]; edges: LayoutInputEdge[] },
  options: { width?: number; height?: number } = {},
): LayoutResult {
  const width = options.width ?? 1100;
  const height = options.height ?? 700;

  // ── Dedupe nodes ────────────────────────────────────────────────────
  const nodes: LayoutInputNode[] = [];
  const seenNodeIds = new Set<string>();
  for (const node of graphData.nodes) {
    if (seenNodeIds.has(node.id)) continue;
    seenNodeIds.add(node.id);
    nodes.push(node);
  }

  // ── Dedupe edges, keep only edges with both endpoints ──────────────
  const edges: LayoutInputEdge[] = [];
  const seenEdgeKeys = new Set<string>();
  const nodeIdSet = new Set(nodes.map((n) => n.id));
  for (const edge of graphData.edges) {
    const key = `${edge.source}->${edge.target}`;
    if (seenEdgeKeys.has(key)) continue;
    seenEdgeKeys.add(key);
    if (nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target)) {
      edges.push(edge);
    }
  }

  const n = nodes.length;
  if (n === 0) return { nodes: [], edges: [] };

  const centerX = width / 2;
  const centerY = height / 2;

  // Deterministic seed: golden-angle spiral so isolated nodes still spread.
  const positions = new Map<string, { x: number; y: number }>();
  const goldenAngle = 2.399963229728653;
  nodes.forEach((node, i) => {
    const angle = i * goldenAngle;
    const radius = 80 + 55 * Math.sqrt(i);
    positions.set(node.id, {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    });
  });

  // ── Group anchors ─────────────────────────────────────────────────────
  // Blocks are target families: each asset inherits its target's anchor via
  // belongs_to edges, so every domain cluster keeps its own corner of the
  // canvas. IP nodes anchor at the center — they sit between the blocks as
  // the wires that connect them.
  const groupOf = new Map<string, number>();
  const groupAnchors: Array<{ x: number; y: number }> = [];
  const groupIndexByTarget = new Map<string, number>();
  const targetByAsset = new Map<string, string>();
  for (const edge of edges) {
    if (edge.data?.type === 'belongs_to') {
      targetByAsset.set(edge.target, edge.source);
    }
  }
  const ensureTargetGroup = (targetId: string): number => {
    const existing = groupIndexByTarget.get(targetId);
    if (existing !== undefined) return existing;
    const index = groupAnchors.length;
    groupIndexByTarget.set(targetId, index);
    const angle = index * goldenAngle;
    const radius = 180 + 140 * Math.sqrt(index);
    groupAnchors.push({
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    });
    return index;
  };
  for (const node of nodes) {
    if (node.type === 'target') {
      groupOf.set(node.id, ensureTargetGroup(node.id));
    } else if (node.type === 'asset') {
      const targetId = targetByAsset.get(node.id);
      if (targetId) groupOf.set(node.id, ensureTargetGroup(targetId));
    }
    // ip (and anything else) keeps no anchor → pulls toward the center.
  }

  // Fruchterman–Reingold parameters. Ideal edge length scales with density:
  // ~3200/√n px for balanced spread, clamped so sparse graphs don't explode
  // and dense IP↔domain graphs keep readable spacing.
  const idealEdgeLength = Math.max(
    220,
    Math.min(320, 3200 / Math.sqrt(Math.max(n, 1))),
  );
  const iterations = Math.max(80, Math.min(300, Math.round(120000 / n)));
  let temperature = 100;

  for (let iter = 0; iter < iterations; iter++) {
    const displacement = new Map<string, { x: number; y: number }>();
    for (const node of nodes) {
      displacement.set(node.id, { x: 0, y: 0 });
    }

    // Repulsion between nearby node pairs (force ~ k² / distance).
    // Uniform spatial grid: only pairs in the same or adjacent cells
    // (Chebyshev distance ≤ 1) interact. Deterministic because cells are
    // visited in insertion order and pairs are only visited once (i < j).
    const cellSize = idealEdgeLength * 2;
    const cellKey = (x: number, y: number) =>
      `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
    const grid = new Map<string, number[]>();
    for (let i = 0; i < n; i++) {
      const p = positions.get(nodes[i].id)!;
      const key = cellKey(p.x, p.y);
      const bucket = grid.get(key);
      if (bucket) bucket.push(i);
      else grid.set(key, [i]);
    }
    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      const pa = positions.get(a.id)!;
      const da = displacement.get(a.id)!;
      const cx = Math.floor(pa.x / cellSize);
      const cy = Math.floor(pa.y / cellSize);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const bucket = grid.get(`${cx + dx},${cy + dy}`);
          if (!bucket) continue;
          for (const j of bucket) {
            if (j <= i) continue;
            const b = nodes[j];
            const pb = positions.get(b.id)!;
            const db = displacement.get(b.id)!;
            let px = pa.x - pb.x;
            let py = pa.y - pb.y;
            let d2 = px * px + py * py;
            if (d2 < 1) {
              // Prevent exact overlap (deterministic nudge apart).
              px = (i - j) * 0.5;
              py = (j - i) * 0.5;
              d2 = 0.5;
            }
            const d = Math.sqrt(d2);
            const force = (idealEdgeLength * idealEdgeLength) / d;
            const ux = px / d;
            const uy = py / d;
            da.x += ux * force;
            da.y += uy * force;
            db.x -= ux * force;
            db.y -= uy * force;
          }
        }
      }
    }

    // Attraction along edges (force ~ distance² / k).
    for (const edge of edges) {
      const ps = positions.get(edge.source)!;
      const pt = positions.get(edge.target)!;
      const ds = displacement.get(edge.source)!;
      const dt = displacement.get(edge.target)!;
      const dx = pt.x - ps.x;
      const dy = pt.y - ps.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const force = (d * d) / idealEdgeLength;
      const ux = dx / d;
      const uy = dy / d;
      ds.x += ux * force;
      ds.y += uy * force;
      dt.x -= ux * force;
      dt.y -= uy * force;
    }

    // Gentle gravity toward the block anchor keeps each target family
    // cohesive while pushing the blocks apart. IP nodes (no anchor) drift
    // toward the center between the blocks.
    for (const node of nodes) {
      const p = positions.get(node.id)!;
      const d = displacement.get(node.id)!;
      const groupIndex = groupOf.get(node.id);
      const anchor =
        groupIndex !== undefined
          ? groupAnchors[groupIndex]
          : { x: centerX, y: centerY };
      const dx = anchor.x - p.x;
      const dy = anchor.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const gravity = dist * 0.02 * idealEdgeLength;
      d.x += (dx / dist) * gravity;
      d.y += (dy / dist) * gravity;
    }

    // Apply displacement, clamped to the cooling temperature.
    for (const node of nodes) {
      const p = positions.get(node.id)!;
      const d = displacement.get(node.id)!;
      const magnitude = Math.sqrt(d.x * d.x + d.y * d.y);
      if (magnitude > temperature) {
        d.x = (d.x / magnitude) * temperature;
        d.y = (d.y / magnitude) * temperature;
      }
      p.x += d.x;
      p.y += d.y;
    }

    temperature *= 1 - iter / iterations;
  }

  // Normalize: re-center the bounding box around the canvas center.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    const p = positions.get(node.id)!;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const offsetX = centerX - (minX + maxX) / 2;
  const offsetY = centerY - (minY + maxY) / 2;

  const positionedNodes: LayoutOutputNode[] = nodes.map((node) => {
    const p = positions.get(node.id)!;
    return {
      id: node.id,
      type: node.type,
      // React Flow positions by top-left corner; NODE_BOX approximates size.
      position: {
        x: p.x + offsetX - NODE_BOX / 2,
        y: p.y + offsetY - NODE_BOX / 2,
      },
      data: node.data,
    };
  });

  const positionedEdges: LayoutOutputEdge[] = edges.map((edge) => ({
    id: `e-${edge.source}-${edge.target}`,
    source: edge.source,
    target: edge.target,
    data: edge.data,
  }));

  return { nodes: positionedNodes, edges: positionedEdges };
}
