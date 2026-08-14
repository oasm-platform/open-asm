/**
 * Framework-agnostic node shape matching the API DTO.
 *
 * `alert` comes from the backend payload (service nodes whose latest status
 * code is 4xx/5xx); `lastScannedAt` is the ISO timestamp of the latest
 * http response, used for the freshness chip and recency dot.
 * `clusterColor` is a client-side presentation field injected by the graph
 * view after layout.
 */
import { graphlib } from 'dagre-d3-es';
// `layout` lives in the dagre subpackage; the package root only re-exports
// graphlib/intersect/render and ships no exports map, so import the subpath.
import { layout as dagreLayout } from 'dagre-d3-es/src/dagre';

export type GraphNodeData = {
  label: string;
  metadata?: Record<string, unknown>;
  clusterColor?: string;
  alert?: boolean;
  lastScannedAt?: string;
  /** Severity derived by the view from the linked statusCode node. */
  severity?: 'warn' | 'danger';
  /** View-injected: label visible only when zoom >= 0.5 (LOD). */
  labelVisible?: boolean;
  /** View-injected: critical glow enabled when zoom >= 0.5. */
  glow?: boolean;
  /** View-injected: entrance-stagger cascade index (20ms per step). */
  staggerIndex?: number;
  /** View-injected: opens the detail sheet for a node (keyboard a11y). */
  onOpenDetail?: (nodeId: string) => void;
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
 * Soft pastel palette for target nodes — one color per target, distinct from
 * the saturated golden-angle hues used for IP nodes.
 */
export const CLUSTER_COLORS = [
  '#7ea6d8', // blue
  '#8aa869', // olive green
  '#c49ad6', // plum
  '#d88e7e', // terracotta
  '#6fb6ab', // teal
  '#c9b36b', // sand
  '#d89ab0', // rose
  '#a3a1d8', // periwinkle
  '#9ad8c0', // mint
  '#d8b09a', // apricot
  '#9ad0d8', // sky
  '#c9a0cf', // orchid
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

/** Approximate node bounding box used for layout spacing. */
const NODE_BOX = 96;

/**
 * Dedupe nodes by id and edges by (source, target) pair, dropping edges with
 * missing endpoints. Shared by both layout engines so switching modes never
 * changes the node/edge sets.
 */
function dedupeGraph(graphData: {
  nodes: LayoutInputNode[];
  edges: LayoutInputEdge[];
}): { nodes: LayoutInputNode[]; edges: LayoutInputEdge[] } {
  const nodes: LayoutInputNode[] = [];
  const seenNodeIds = new Set<string>();
  for (const node of graphData.nodes) {
    if (seenNodeIds.has(node.id)) continue;
    seenNodeIds.add(node.id);
    nodes.push(node);
  }

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
  return { nodes, edges };
}

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

  // ── Dedupe nodes / edges (shared with the dagre layout) ─────────────
  const { nodes, edges } = dedupeGraph(graphData);

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
  // belongs_to edges. Anchors sit on distinct radial rings — linear spacing
  // (`320 + 460 * index`) guarantees every target lives at its own distance
  // from the center, so families occupy separate bands instead of sharing one
  // compressed orbit. IP nodes get their own golden-angle ring inside the
  // target rings, so the resolves_to wires fan out instead of knotting at the
  // exact center.
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
    const radius = 320 + 460 * index;
    groupAnchors.push({
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    });
    return index;
  };
  // IP anchors sit at the centroid of the target families they bridge: an
  // IP used by one target stays inside that cluster, while an IP shared by
  // several targets lands between them. That is what pushes families that
  // share an address apart, instead of the old inner ring which dragged
  // every shared IP (and its assets) toward the center.
  const ipTargets = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (edge.data?.type !== 'resolves_to') continue;
    const targetId = targetByAsset.get(edge.source);
    if (!targetId) continue;
    const set = ipTargets.get(edge.target);
    if (set) set.add(targetId);
    else ipTargets.set(edge.target, new Set([targetId]));
  }
  const ipAnchorByIp = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    if (node.type === 'target') {
      groupOf.set(node.id, ensureTargetGroup(node.id));
    } else if (node.type === 'asset') {
      const targetId = targetByAsset.get(node.id);
      if (targetId) groupOf.set(node.id, ensureTargetGroup(targetId));
    }
  }
  for (const node of nodes) {
    if (node.type !== 'ip') continue;
    const targets = ipTargets.get(node.id);
    if (targets && targets.size > 0) {
      let ax = 0, ay = 0;
      for (const t of targets) {
        const gi = ensureTargetGroup(t);
        ax += groupAnchors[gi].x;
        ay += groupAnchors[gi].y;
      }
      ax /= targets.size;
      ay /= targets.size;
      ipAnchorByIp.set(node.id, { x: ax, y: ay });
    } else {
      ipAnchorByIp.set(node.id, { x: centerX, y: centerY });
    }
  }

  // Fruchterman–Reingold parameters. Ideal edge length scales with density:
  // ~4400/√n px for balanced spread, clamped so sparse graphs don't explode
  // and dense IP↔domain graphs keep readable spacing.
  const idealEdgeLength = Math.max(
    320,
    Math.min(460, 4400 / Math.sqrt(Math.max(n, 1))),
  );
  const iterations = Math.max(80, Math.min(300, Math.round(120000 / n)));
  let temperature = 100;

  for (let iter = 0; iter < iterations; iter++) {    const displacement = new Map<string, { x: number; y: number }>();
    for (const node of nodes) {
      displacement.set(node.id, { x: 0, y: 0 });
    }

    // Repulsion between nearby node pairs (force ~ k² / distance).
    // Uniform spatial grid: only pairs in the same or adjacent cells
    // (Chebyshev distance ≤ 1) interact. Deterministic because cells are
    // visited in insertion order and pairs are only visited once (i < j).
    // Targets repel less: they are the fixed landmarks that families cluster
    // around, so a full-strength push would shove them off their anchor ring.
    const repulsionScale = (type: string) => (type === 'target' ? 0.3 : 1);
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
            const force =
              ((idealEdgeLength * idealEdgeLength) / d) *
              Math.min(repulsionScale(a.type), repulsionScale(b.type));
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

    // Gravity toward the block anchor keeps each target family cohesive and
    // pushes the blocks apart onto their distinct rings. Pull strength varies
    // by role: targets grip their ring hard (they are the visual landmarks),
    // assets and IPs get a medium pull, everything else drifts by FR forces.
    for (const node of nodes) {
      const p = positions.get(node.id)!;
      const d = displacement.get(node.id)!;
      const groupIndex = groupOf.get(node.id);
      let anchor: { x: number; y: number };
      let strength: number;
      if (groupIndex !== undefined) {
        anchor = groupAnchors[groupIndex];
        strength = node.type === 'target' ? 0.02 : 0.02;
      } else if (node.type === 'ip') {
        anchor = ipAnchorByIp.get(node.id) ?? { x: centerX, y: centerY };
        strength = 0.012;
      } else {
        anchor = { x: centerX, y: centerY };
        strength = 0.0008;
      }
      const dx = anchor.x - p.x;
      const dy = anchor.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const gravity = dist * strength * idealEdgeLength;
      d.x += (dx / dist) * gravity;
      d.y += (dy / dist) * gravity;
    }

    // Apply displacement, clamped to the cooling temperature. Linear cooling
    // (multiplicative `temp *= 1 - iter/iterations` froze the pass early and
    // left dense hubs overlapping). Targets are pinned to their anchor ring —
    // they are the visual landmarks each family orbits, and pinning is what
    // keeps the bands at strictly distinct distances from the center.
    for (const node of nodes) {
      const p = positions.get(node.id)!;
      const groupIndex = groupOf.get(node.id);
      if (groupIndex !== undefined && node.type === 'target') {
        const anchor = groupAnchors[groupIndex];
        p.x = anchor.x;
        p.y = anchor.y;
        continue;
      }
      const d = displacement.get(node.id)!;
      const magnitude = Math.sqrt(d.x * d.x + d.y * d.y);
      if (magnitude > temperature) {
        d.x = (d.x / magnitude) * temperature;
        d.y = (d.y / magnitude) * temperature;
      }
      p.x += d.x;
      p.y += d.y;
    }

    temperature = 100 * (1 - (iter + 1) / iterations);
  }

  // ── Collision-resolution post-pass: enforce a minimum pairwise spacing ──
  // Nodes closer than MIN_GAP are pushed apart along their connecting line
  // (each moves half the deficit). Uses the same uniform spatial grid as
  // repulsion (cell = MIN_GAP, 3×3 neighborhood) so each pass is O(n) and
  // scales to thousands of nodes. Deterministic: fixed passes, pairs visited
  // once per pass in insertion order. This is what guarantees the graph
  // reads clearly at any zoom — FR alone leaves spokes of a shared hub
  // (e.g. many services on one IP) overlapping.
  const MIN_GAP = 110;
  if (n > 1) {
    const gapCellSize = MIN_GAP;
    const gapCellKey = (x: number, y: number) =>
      `${Math.floor(x / gapCellSize)},${Math.floor(y / gapCellSize)}`;
    for (let pass = 0; pass < 50; pass++) {
      let moved = 0;
      const gapGrid = new Map<string, number[]>();
      for (let i = 0; i < n; i++) {
        const p = positions.get(nodes[i].id)!;
        const key = gapCellKey(p.x, p.y);
        const bucket = gapGrid.get(key);
        if (bucket) bucket.push(i);
        else gapGrid.set(key, [i]);
      }
      for (let i = 0; i < n; i++) {
        const pa = positions.get(nodes[i].id)!;
        if (nodes[i].type === 'target') continue; // pinned landmarks
        const cx = Math.floor(pa.x / gapCellSize);
        const cy = Math.floor(pa.y / gapCellSize);
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const bucket = gapGrid.get(`${cx + dx},${cy + dy}`);
            if (!bucket) continue;
            for (const j of bucket) {
              if (j <= i) continue;
              const pb = positions.get(nodes[j].id)!;
              const ddx = pb.x - pa.x;
              const ddy = pb.y - pa.y;
              const d = Math.hypot(ddx, ddy);
              if (d >= MIN_GAP) continue;
              // Exactly-coincident pair (d ≈ 0): no direction to push along,
              // so separate along a deterministic axis instead of skipping.
              let ux: number;
              let uy: number;
              let distance: number;
              if (d < 1e-6) {
                ux = (i - j) % 2 === 0 ? 1 : 0;
                uy = (i - j) % 2 === 0 ? 0 : 1;
                distance = MIN_GAP;
              } else {
                ux = ddx / d;
                uy = ddy / d;
                distance = d;
              }
              const deficit = (MIN_GAP - distance) / 2;
              // Non-target node takes the full deficit so pinned targets stay.
              if (nodes[j].type === 'target') {
                pa.x -= ux * deficit * 2;
                pa.y -= uy * deficit * 2;
              } else {
                pa.x -= ux * deficit;
                pa.y -= uy * deficit;
                pb.x += ux * deficit;
                pb.y += uy * deficit;
              }
              moved++;
            }
          }
        }
      }
      if (moved === 0) break;
    }
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

/**
 * Hierarchical (layered) layout via dagre, the default graph arrangement.
 *
 * Edges are added without labels and only for layering purposes; the actual
 * edge visuals are applied later by the graph view. Positions are computed
 * for the ~96px NODE_BOX and converted from dagre's center-anchored
 * coordinates to React Flow's top-left anchored ones.
 */
export function applyDagreLayout(
  graphData: { nodes: LayoutInputNode[]; edges: LayoutInputEdge[] },
  options: { rankdir?: 'TB' | 'LR' | 'BT' | 'RL' } = {},
): LayoutResult {
  const rankdir = options.rankdir ?? 'TB';

  // ── Dedupe nodes / edges (shared with the force layout) ─────────────
  const { nodes, edges } = dedupeGraph(graphData);
  if (nodes.length === 0) return { nodes: [], edges: [] };

  const g = new graphlib.Graph();
  g.setGraph({
    rankdir,
    nodesep: 60,
    ranksep: 140,
    marginx: 40,
    marginy: 40,
  });
  g.setDefaultEdgeLabel(() => ({}));
  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_BOX, height: NODE_BOX });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }
  dagreLayout(g, {});

  const positionedNodes: LayoutOutputNode[] = nodes.map((node) => {
    const pos = g.node(node.id) as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    return {
      id: node.id,
      type: node.type,
      position: {
        x: pos.x - pos.width / 2,
        y: pos.y - pos.height / 2,
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
