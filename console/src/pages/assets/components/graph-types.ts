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
  /** View-injected: target family key (cluster layout hulls). */
  familyId?: string;
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

/**
 * Result of the layout pass. Positions are node CENTERS: the view renders
 * with `nodeOrigin={[0.5, 0.5]}`, so differently sized badges line up.
 * `groupOf` (cluster layout only) maps a node id to its target family key.
 */
export type LayoutResult = {
  nodes: LayoutOutputNode[];
  edges: LayoutOutputEdge[];
  groupOf?: Record<string, string>;
};

/**
 * On-canvas footprint of a node around its center: badge plus the label
 * rendered below it. `up`/`down` are distances from the center to the top
 * and bottom edge (the label hangs below, so the box is not symmetric).
 */
export type Footprint = { w: number; up: number; down: number };

export function nodeFootprint(type: NodeType, label: string): Footprint {
  const labelW = Math.min(label.length, 24) * 6 + 8;
  switch (type) {
    case 'target':
    case 'technology':
      // Pill with the label inside, nothing below.
      return { w: Math.min(124, labelW + 30), up: 16, down: 16 };
    case 'asset':
      return { w: Math.min(128, Math.max(44, labelW)), up: 16, down: 30 };
    case 'statusCode':
      return { w: Math.max(28, labelW), up: 14, down: 30 };
    default:
      // ip / service / tls circles (56px) with a label below.
      return { w: Math.min(128, Math.max(60, labelW)), up: 30, down: 46 };
  }
}

/**
 * Place each movable node on the free spot nearest to where it wants to be,
 * searching outwards on a spiral. Unlike push-apart, this cannot oscillate
 * between fixed neighbours, so new nodes (expanded services, nodes from a
 * poll) never land on top of what is already on canvas. Movable nodes are
 * placed in input order and become obstacles for the ones after them.
 * Mutates `positions`.
 */
export function placeInFreeSpots(
  items: Array<{ id: string; fp: Footprint }>,
  positions: Map<string, { x: number; y: number }>,
  isFixed: (id: string) => boolean,
  gap = 14,
): void {
  const CELL = 160;
  const grid = new Map<string, Array<{ x: number; y: number; fp: Footprint }>>();
  const keyOf = (x: number, y: number) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
  const occupy = (p: { x: number; y: number }, fp: Footprint) => {
    const key = keyOf(p.x, p.y);
    grid.set(key, [...(grid.get(key) ?? []), { ...p, fp }]);
  };
  const collides = (p: { x: number; y: number }, fp: Footprint) => {
    const cx = Math.floor(p.x / CELL);
    const cy = Math.floor(p.y / CELL);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const o of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (
            Math.abs(o.x - p.x) < (o.fp.w + fp.w) / 2 + gap &&
            p.y - fp.up < o.y + o.fp.down + gap &&
            o.y - o.fp.up < p.y + fp.down + gap
          ) {
            return true;
          }
        }
      }
    }
    return false;
  };
  for (const it of items) {
    if (isFixed(it.id)) occupy(positions.get(it.id)!, it.fp);
  }
  for (const it of items) {
    if (isFixed(it.id)) continue;
    const want = positions.get(it.id)!;
    let spot = want;
    search: for (let r = 0; r <= 3000; r += 20) {
      const steps = r === 0 ? 1 : Math.max(8, Math.round((2 * Math.PI * r) / 20));
      for (let k = 0; k < steps; k++) {
        const angle = (2 * Math.PI * k) / steps;
        const candidate = { x: want.x + Math.cos(angle) * r, y: want.y + Math.sin(angle) * r };
        if (!collides(candidate, it.fp)) {
          spot = candidate;
          break search;
        }
      }
    }
    positions.set(it.id, spot);
    occupy(spot, it.fp);
  }
}

/**
 * Cluster ("attack-surface map") layout, the default arrangement.
 *
 * Each target is the hub of its own family: its domains sit on staggered
 * concentric ellipses around it (inner rings first, so a family is compact),
 * ordered by their primary IP so domains sharing an address are adjacent.
 * IPs used by one family sit on an outer ring at the circular mean angle of
 * their domains, which keeps resolves_to wires short and mostly radial. IPs
 * shared by several families are placed between those families afterwards.
 * Families are packed greedily (largest first), each one next to the
 * families it shares IPs with. A final footprint-aware pass guarantees no
 * badge or label overlaps. Deterministic for a given input order.
 */
export function applyClusterLayout(graphData: {
  nodes: LayoutInputNode[];
  edges: LayoutInputEdge[];
}): LayoutResult {
  const { nodes, edges } = dedupeGraph(graphData);
  if (nodes.length === 0) return { nodes: [], edges: [], groupOf: {} };

  const ORPHAN = '__ungrouped__';
  const SLOT = 136; // tangential spacing between neighbours on one ring
  const RING_GAP = 62;
  const ELLIPSE_X = 1.3; // labels are wide: give rings more horizontal room
  const IP_GAP = 120;
  const IP_SLOT = 96;
  const FAMILY_GAP = 90;

  const byId = new Map(nodes.map((nd) => [nd.id, nd]));
  const order = new Map(nodes.map((nd, i) => [nd.id, i]));
  const targetOf = new Map<string, string>();
  const ipsOf = new Map<string, string[]>();
  const assetsOfIp = new Map<string, string[]>();
  for (const e of edges) {
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    if (!s || !t) continue;
    if (s.type === 'target' && t.type === 'asset' && !targetOf.has(t.id)) {
      targetOf.set(t.id, s.id);
    } else if (t.type === 'ip' && s.type !== 'ip') {
      ipsOf.set(s.id, [...(ipsOf.get(s.id) ?? []), t.id]);
      assetsOfIp.set(t.id, [...(assetsOfIp.get(t.id) ?? []), s.id]);
    }
  }

  // ── Families: one per target, plus one for ungrouped members ──────────
  type Family = {
    key: string;
    members: string[]; // ring members (domains, or loose nodes)
    ownIps: string[];
    local: Map<string, { x: number; y: number }>;
    radius: number;
    center: { x: number; y: number };
  };
  const families = new Map<string, Family>();
  const familyOf = new Map<string, string>();
  const ensureFamily = (key: string) => {
    let f = families.get(key);
    if (!f) {
      f = { key, members: [], ownIps: [], local: new Map(), radius: 0, center: { x: 0, y: 0 } };
      families.set(key, f);
    }
    return f;
  };
  for (const nd of nodes) {
    if (nd.type === 'target') {
      ensureFamily(nd.id);
      familyOf.set(nd.id, nd.id);
    }
  }
  for (const nd of nodes) {
    if (nd.type === 'target') continue;
    if (nd.type === 'ip' && assetsOfIp.has(nd.id)) continue; // placed below
    const key = targetOf.get(nd.id) ?? ORPHAN;
    ensureFamily(key).members.push(nd.id);
    familyOf.set(nd.id, key);
  }

  // IPs: owned by a family when every domain resolving to them is in it.
  const sharedIps: string[] = [];
  for (const nd of nodes) {
    if (nd.type !== 'ip' || !assetsOfIp.has(nd.id)) continue;
    const keys = new Set(assetsOfIp.get(nd.id)!.map((a) => familyOf.get(a) ?? ORPHAN));
    if (keys.size === 1) {
      const key = [...keys][0];
      ensureFamily(key).ownIps.push(nd.id);
      familyOf.set(nd.id, key);
    } else {
      sharedIps.push(nd.id);
    }
  }

  const ellipse = (angle: number, r: number) => ({
    x: Math.cos(angle) * r * ELLIPSE_X,
    y: Math.sin(angle) * r,
  });

  // ── Local layout of each family around its hub at (0, 0) ──────────────
  const angleOf = new Map<string, number>();
  for (const f of families.values()) {
    const primaryIp = (id: string) =>
      Math.min(...(ipsOf.get(id) ?? []).map((ip) => order.get(ip) ?? 0), Infinity);
    const labelOf = (id: string) => byId.get(id)?.data.label ?? id;
    f.members.sort(
      (a, b) =>
        primaryIp(a) - primaryIp(b) || labelOf(a).localeCompare(labelOf(b)),
    );
    const count = f.members.length;
    const rings = count <= 10 ? 1 : Math.min(4, Math.ceil(count / 18));
    const r0 = Math.max(140, (count * SLOT) / (2 * Math.PI * rings * ELLIPSE_X));
    f.members.forEach((id, i) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(count, 1);
      angleOf.set(id, angle);
      f.local.set(id, ellipse(angle, r0 + (i % rings) * RING_GAP));
    });
    let outer = count > 0 ? r0 + (rings - 1) * RING_GAP : 40;

    if (f.ownIps.length > 0) {
      const ipR = outer + IP_GAP;
      const withAngles = f.ownIps.map((ip) => {
        const assets = assetsOfIp.get(ip)!;
        let sx = 0;
        let sy = 0;
        for (const a of assets) {
          const ang = angleOf.get(a) ?? 0;
          sx += Math.cos(ang);
          sy += Math.sin(ang);
        }
        // Resultant length: ~1 when the domains sit together on the ring,
        // ~0 when they are spread all around it. Spread-out or very widely
        // shared IPs (CDN / shared hosting) are family hubs.
        const spread = Math.hypot(sx, sy) / assets.length;
        const hub =
          assets.length > 2 && (spread < 0.6 || assets.length >= count * 0.25);
        return { ip, angle: Math.atan2(sy, sx), hub };
      });
      // Hub IPs go on an inner ring next to the target: their wires stay
      // radial instead of cutting across the whole family.
      const hubs = withAngles.filter((p) => p.hub);
      const innerR = Math.max(70, r0 * 0.5);
      hubs.forEach(({ ip }, k) => {
        const angle = -Math.PI / 2 + (2 * Math.PI * (k + 0.5)) / hubs.length;
        f.local.set(ip, ellipse(angle, hubs.length === 1 ? innerR * 0.8 : innerR));
      });
      const placed = withAngles
        .filter((p) => !p.hub)
        .sort((a, b) => a.angle - b.angle);
      const minStep = IP_SLOT / (ipR * ELLIPSE_X);
      for (let k = 1; k < placed.length; k++) {
        placed[k].angle = Math.max(placed[k].angle, placed[k - 1].angle + minStep);
      }
      // Too many IPs for one ring: alternate between two radii.
      const crowded = placed.length * minStep > 2 * Math.PI;
      placed.forEach(({ ip, angle }, k) => {
        f.local.set(ip, ellipse(angle, ipR + (crowded && k % 2 ? 80 : 0)));
      });
      if (placed.length > 0) outer = ipR + (crowded ? 80 : 0);
    }
    f.radius = outer * ELLIPSE_X + 70;
  }

  // ── Pack families: largest first, next to the ones they share IPs with ─
  const affinity = new Map<string, Map<string, number>>();
  for (const ip of sharedIps) {
    const keys = [...new Set(assetsOfIp.get(ip)!.map((a) => familyOf.get(a) ?? ORPHAN))];
    for (const a of keys) {
      for (const b of keys) {
        if (a === b) continue;
        const m = affinity.get(a) ?? new Map<string, number>();
        m.set(b, (m.get(b) ?? 0) + 1);
        affinity.set(a, m);
      }
    }
  }
  const familyList = [...families.values()].sort(
    (a, b) => b.radius - a.radius || a.key.localeCompare(b.key),
  );
  const placedFamilies: Family[] = [];
  for (const f of familyList) {
    if (placedFamilies.length === 0) {
      placedFamilies.push(f);
      continue;
    }
    // Where this family wants to be: weighted centroid of related families.
    let wx = 0;
    let wy = 0;
    let wt = 0;
    for (const p of placedFamilies) {
      const w = affinity.get(f.key)?.get(p.key) ?? 0;
      wx += p.center.x * w;
      wy += p.center.y * w;
      wt += w;
    }
    const goal = wt > 0 ? { x: wx / wt, y: wy / wt } : { x: 0, y: 0 };
    let best: { x: number; y: number } | null = null;
    let bestScore = Infinity;
    // Bound the candidate search for very large target counts.
    const anchors = placedFamilies.length > 60 ? placedFamilies.slice(-60) : placedFamilies;
    for (const p of anchors) {
      for (let s = 0; s < 16; s++) {
        const ang = (2 * Math.PI * s) / 16;
        const dist = p.radius + f.radius + FAMILY_GAP;
        const c = { x: p.center.x + Math.cos(ang) * dist, y: p.center.y + Math.sin(ang) * dist * 0.8 };
        const clear = placedFamilies.every(
          (q) => Math.hypot(q.center.x - c.x, q.center.y - c.y) >= q.radius + f.radius + FAMILY_GAP - 1,
        );
        if (!clear) continue;
        const score = Math.hypot(c.x - goal.x, c.y - goal.y);
        if (score < bestScore) {
          bestScore = score;
          best = c;
        }
      }
    }
    f.center = best ?? { x: 0, y: placedFamilies.length * (f.radius * 2 + FAMILY_GAP) };
    placedFamilies.push(f);
  }

  // ── Absolute positions ───────────────────────────────────────────────
  const positions = new Map<string, { x: number; y: number }>();
  for (const f of families.values()) {
    if (byId.has(f.key)) positions.set(f.key, { ...f.center });
    for (const [id, p] of f.local) {
      positions.set(id, { x: f.center.x + p.x, y: f.center.y + p.y });
    }
  }
  for (const ip of sharedIps) {
    let sx = 0;
    let sy = 0;
    const assets = assetsOfIp.get(ip)!;
    for (const a of assets) {
      const p = positions.get(a) ?? { x: 0, y: 0 };
      sx += p.x;
      sy += p.y;
    }
    positions.set(ip, { x: sx / assets.length, y: sy / assets.length });
    familyOf.set(ip, `shared:${ip}`);
  }

  placeInFreeSpots(
    nodes.map((nd) => ({ id: nd.id, fp: nodeFootprint(nd.type, nd.data.label) })),
    positions,
    (id) => byId.get(id)?.type === 'target',
  );

  const groupOf: Record<string, string> = {};
  for (const [id, key] of familyOf) {
    if (key !== ORPHAN && !key.startsWith('shared:')) groupOf[id] = key;
  }

  return {
    nodes: nodes.map((nd) => ({
      id: nd.id,
      type: nd.type,
      position: positions.get(nd.id)!,
      data: nd.data,
    })),
    edges: edges.map((e) => ({
      id: `e-${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      data: e.data,
    })),
    groupOf,
  };
}

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
    // Rings are spaced generously (460 + 680*index) so target families that
    // share no IP stay clearly separated; overlapping clouds were caused by
    // the old 460px step being smaller than a family's own spread.
    const radius = 460 + 680 * index;
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
    260,
    Math.min(400, 3800 / Math.sqrt(Math.max(n, 1))),
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
        strength = node.type === 'target' ? 0.02 : 0.03;
      } else if (node.type === 'ip') {
        anchor = ipAnchorByIp.get(node.id) ?? { x: centerX, y: centerY };
        strength = 0.016;
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
      position: { x: p.x + offsetX, y: p.y + offsetY },
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
 * Hierarchical (layered) layout via dagre: Target → Domain → IP lanes.
 *
 * Edges are added without labels and only for layering purposes; the actual
 * edge visuals are applied later by the graph view. Each node is sized by its
 * real footprint (badge + label), so lanes never overlap.
 */
export function applyDagreLayout(
  graphData: { nodes: LayoutInputNode[]; edges: LayoutInputEdge[] },
  options: { rankdir?: 'TB' | 'LR' | 'BT' | 'RL' } = {},
): LayoutResult {
  const rankdir = options.rankdir ?? 'LR';

  // ── Dedupe nodes / edges (shared with the force layout) ─────────────
  const { nodes, edges } = dedupeGraph(graphData);
  if (nodes.length === 0) return { nodes: [], edges: [] };

  const g = new graphlib.Graph();
  g.setGraph({
    rankdir,
    nodesep: 18,
    ranksep: 220,
    marginx: 40,
    marginy: 40,
  });
  g.setDefaultEdgeLabel(() => ({}));
  for (const node of nodes) {
    const fp = nodeFootprint(node.type, node.data.label);
    g.setNode(node.id, { width: fp.w, height: fp.up + fp.down });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }
  dagreLayout(g, {});

  const fpById = new Map(
    nodes.map((nd) => [nd.id, nodeFootprint(nd.type, nd.data.label)]),
  );
  // dagre centers the whole box; the badge sits above the label.
  const centers = new Map(
    nodes.map((nd) => {
      const pos = g.node(nd.id) as { x: number; y: number };
      const fp = fpById.get(nd.id)!;
      return [nd.id, { x: pos.x, y: pos.y - (fp.down - fp.up) / 2 }];
    }),
  );
  if (rankdir === 'LR') wrapLongRanks(nodes, fpById, centers);

  const positionedNodes: LayoutOutputNode[] = nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: centers.get(node.id)!,
    data: node.data,
  }));

  const positionedEdges: LayoutOutputEdge[] = edges.map((edge) => ({
    id: `e-${edge.source}-${edge.target}`,
    source: edge.source,
    target: edge.target,
    data: edge.data,
  }));

  return { nodes: positionedNodes, edges: positionedEdges };
}

/**
 * A left-to-right rank with dozens of domains becomes one lane thousands of
 * pixels tall. Wrap each long rank into sub-columns (column-major, keeping
 * dagre's crossing-minimised order) so the diagram stays roughly as wide as
 * it is tall, and re-center every rank vertically. Mutates `centers`.
 */
function wrapLongRanks(
  nodes: LayoutInputNode[],
  fpById: Map<string, Footprint>,
  centers: Map<string, { x: number; y: number }>,
): void {
  const ROW_GAP = 14;
  const COL_GAP = 28;
  const RANK_GAP = 200;
  // Ranks: dagre does not give every node of a rank the exact same x
  // (widths differ), so bucket by proximity along the x axis.
  const byX = nodes
    .map((nd) => nd.id)
    .sort((a, b) => centers.get(a)!.x - centers.get(b)!.x);
  const ranks: string[][] = [];
  let rankStart = -Infinity;
  for (const id of byX) {
    const x = centers.get(id)!.x;
    if (x - rankStart > 100) {
      ranks.push([]);
      rankStart = x;
    }
    ranks[ranks.length - 1].push(id);
  }
  let cursor = 0;
  for (const rank of ranks) {
    const ids = rank.sort((a, b) => centers.get(a)!.y - centers.get(b)!.y);
    const rows = Math.max(14, Math.ceil(Math.sqrt(ids.length * 2)));
    const colW = Math.max(...ids.map((id) => fpById.get(id)!.w)) + COL_GAP;
    const cols = Math.ceil(ids.length / rows);
    for (let c = 0; c < cols; c++) {
      const column = ids.slice(c * rows, (c + 1) * rows);
      const heights = column.map((id) => fpById.get(id)!.up + fpById.get(id)!.down + ROW_GAP);
      let y = -heights.reduce((sum, h) => sum + h, 0) / 2;
      column.forEach((id, k) => {
        centers.set(id, { x: cursor + c * colW + colW / 2, y: y + fpById.get(id)!.up });
        y += heights[k];
      });
    }
    cursor += cols * colW + RANK_GAP;
  }
}
