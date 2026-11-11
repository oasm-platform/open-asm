import type {
  WorkflowNodeDto,
  WorkflowResponseDto,
  WorkflowStepDto,
} from '@/services/apis/gen/queries';
import type { Edge, Node } from '@xyflow/react';

export const WORKFLOW_NODE_WIDTH = 220;
export const WORKFLOW_NODE_HEIGHT = 84;
export const WORKFLOW_HEAD_HEIGHT = 64;
const GAP_X = 24;
const GAP_Y = 48;
/** Room between the plan pipeline and the subagents outside the plan */
const BAND_GAP = 48;
const ROW = WORKFLOW_NODE_HEIGHT + GAP_Y;

const ROOT_ID = 'root';

/** How one node led to another, top to bottom */
export type WorkflowEdgeKind =
  | 'plan' // goal → first step, or a step without subagents → the next one
  | 'handoff' // the last results of a step → the next step
  | 'dispatch' // step (or goal) → a subagent with no upstream agent
  | 'after' // waited for the source and received its result
  | 'derived' // dispatched because of the source's result
  | 'continue'; // follow-up of the source

export const WORKFLOW_EDGE_KINDS: Array<{
  kind: WorkflowEdgeKind;
  label: string;
  color: string;
  dashed?: boolean;
}> = [
  { kind: 'plan', label: 'Plan', color: '#94a3b8' },
  { kind: 'handoff', label: 'Feeds next step', color: '#ec4899' },
  { kind: 'dispatch', label: 'Dispatched', color: '#10b981' },
  { kind: 'after', label: 'Waits for', color: '#0ea5e9' },
  { kind: 'derived', label: 'Derived from', color: '#8b5cf6' },
  { kind: 'continue', label: 'Follow-up', color: '#f59e0b', dashed: true },
];

export type WorkflowEdgeData = {
  kind: WorkflowEdgeKind;
  /** Work is flowing along it right now */
  live: boolean;
  /** Touches the selected node */
  highlighted: boolean;
  /** Something else is selected */
  dimmed: boolean;
};

export type RootNodeData = { goal: string | null; count: number };
export type StepNodeData = {
  step: WorkflowStepDto;
  index: number;
  count: number;
};
export type AgentNodeData = { node: WorkflowNodeDto; selected: boolean };

export type WorkflowGraphNode =
  | Node<RootNodeData, 'root'>
  | Node<StepNodeData, 'step'>
  | Node<AgentNodeData, 'agent'>;
export type WorkflowGraphEdge = Edge<WorkflowEdgeData, 'flow'>;
export type WorkflowBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const ACTIVE = new Set(['pending', 'in_progress']);

/** Upstream subagents of a node, deduplicated and limited to known ids */
function upstream(
  node: WorkflowNodeDto,
  known: Set<string>,
): Array<{ id: string; kind: WorkflowEdgeKind }> {
  const seen = new Set<string>();
  const out: Array<{ id: string; kind: WorkflowEdgeKind }> = [];
  const add = (id: string, kind: WorkflowEdgeKind) => {
    if (!known.has(id) || seen.has(id) || id === node.id) return;
    seen.add(id);
    out.push({ id, kind });
  };
  node.after.forEach((id) => add(id, 'after'));
  (node.derivedFrom ?? []).forEach((id) => add(id, 'derived'));
  if (node.continuesFrom) add(node.continuesFrom, 'continue');
  return out;
}

/**
 * Depth of each subagent in the dependency graph: 0 without `after`,
 * `derivedFrom` or `continuesFrom`, else one more than its deepest parent.
 * Links to unknown ids are ignored.
 */
export function workflowDepths(nodes: WorkflowNodeDto[]): Map<string, number> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const known = new Set(byId.keys());
  const depth = new Map<string, number>();
  const visit = (id: string, seen: Set<string>): number => {
    const cached = depth.get(id);
    if (cached !== undefined) return cached;
    const node = byId.get(id);
    if (!node || seen.has(id)) return 0;
    seen.add(id);
    const parents = upstream(node, known);
    const d =
      parents.length === 0
        ? 0
        : 1 + Math.max(...parents.map((p) => visit(p.id, seen)));
    depth.set(id, d);
    return d;
  };
  nodes.forEach((n) => visit(n.id, new Set()));
  return depth;
}

/**
 * Subagents of a step that nothing else in the step built on: what the step
 * finally handed to the next one.
 */
function stepLeaves(nodes: WorkflowNodeDto[]): WorkflowNodeDto[] {
  const ids = new Set(nodes.map((n) => n.id));
  const used = new Set(nodes.flatMap((n) => upstream(n, ids).map((p) => p.id)));
  return nodes.filter((n) => !used.has(n.id));
}

/**
 * Lays the workflow out as a pipeline read top to bottom: the goal, then each
 * plan step followed by the subagents it dispatched (in rows by dependency
 * depth), then the next step, fed by the step's last results.
 * Subagents outside the plan hang off the goal beside the pipeline.
 */
export function buildWorkflowLayout(
  workflow: Pick<WorkflowResponseDto, 'goal' | 'steps' | 'nodes'>,
  selectedId?: string | null,
): {
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
  /** Box around every node, at the sizes they are drawn */
  bounds: WorkflowBounds;
} {
  const steps = [...workflow.steps].sort((a, b) => a.sortOrder - b.sortOrder);
  const stepIds = new Set(steps.map((s) => s.id));
  const known = new Set(workflow.nodes.map((n) => n.id));
  const byId = new Map(workflow.nodes.map((n) => [n.id, n]));
  const groups = steps.map((step) => ({
    id: `step:${step.id}`,
    step,
    nodes: workflow.nodes.filter((n) => n.stepId === step.id),
  }));
  const outside = workflow.nodes.filter(
    (n) => !n.stepId || !stepIds.has(n.stepId),
  );

  // Rows: each step below everything before it, each subagent below its step
  // and the agents it came from
  const row = new Map<string, number>([[ROOT_ID, 0]]);
  const placeAgents = (nodes: WorkflowNodeDto[], first: number): number => {
    let last = first - 1;
    // Parents inside the same group may come later in the list
    for (let pass = 0; pass <= nodes.length; pass++) {
      for (const n of nodes) {
        const parents = upstream(n, known)
          .map((p) => row.get(p.id))
          .filter((r): r is number => r !== undefined);
        const r = Math.max(first, ...parents.map((p) => p + 1));
        row.set(n.id, r);
        last = Math.max(last, r);
      }
    }
    return last;
  };
  let cursor = 1;
  for (const g of groups) {
    row.set(g.id, cursor);
    cursor = placeAgents(g.nodes, cursor + 1) + 1;
    cursor = Math.max(cursor, (row.get(g.id) ?? 0) + 1);
  }
  placeAgents(outside, 1);

  // Graph parents (for placing and for edges)
  const status = new Map(workflow.nodes.map((n) => [n.id, n.status]));
  const edges: WorkflowGraphEdge[] = [];
  const parentsOf = new Map<string, string[]>();
  const link = (
    source: string,
    target: string,
    kind: WorkflowEdgeKind,
    live: boolean,
  ) => {
    const highlighted =
      !!selectedId && (source === selectedId || target === selectedId);
    edges.push({
      id: `${kind}:${source}->${target}`,
      source,
      target,
      type: 'flow',
      data: { kind, live, highlighted, dimmed: !!selectedId && !highlighted },
    });
    parentsOf.set(target, [...(parentsOf.get(target) ?? []), source]);
  };
  groups.forEach((g, i) => {
    const live = g.step.status === 'in_progress';
    const prev = groups[i - 1];
    const fed = prev ? stepLeaves(prev.nodes) : [];
    if (!prev) link(ROOT_ID, g.id, 'plan', live);
    else if (fed.length === 0) link(prev.id, g.id, 'plan', live);
    else fed.forEach((n) => link(n.id, g.id, 'handoff', live));
  });
  for (const n of workflow.nodes) {
    const active = ACTIVE.has(n.status);
    const parents = upstream(n, known);
    if (parents.length === 0) {
      const head =
        n.stepId && stepIds.has(n.stepId) ? `step:${n.stepId}` : ROOT_ID;
      link(head, n.id, 'dispatch', active);
      continue;
    }
    for (const p of parents) {
      const live =
        p.kind === 'after'
          ? n.waitingOn.includes(p.id) || n.status === 'in_progress'
          : active || ACTIVE.has(status.get(p.id) ?? '');
      link(p.id, n.id, p.kind, live);
    }
  }

  // Across: row by row, each node under its parents where there is room,
  // each row shifted to sit centred under what it wants
  const center = new Map<string, number>();
  const left = new Map<string, number>();
  const placeRows = (ids: string[], floor: number) => {
    const rows = new Map<number, string[]>();
    for (const id of ids) {
      const r = row.get(id) ?? 0;
      rows.set(r, [...(rows.get(r) ?? []), id]);
    }
    let right = floor;
    for (const r of [...rows.keys()].sort((a, b) => a - b)) {
      const items = rows
        .get(r)!
        .map((id, order) => {
          const ps = (parentsOf.get(id) ?? [])
            .map((p) => center.get(p))
            .filter((x): x is number => x !== undefined);
          const want =
            ps.length > 0 ? ps.reduce((a, b) => a + b, 0) / ps.length : undefined;
          return { id, want, order };
        })
        .sort(
          (a, b) =>
            (a.want ?? Infinity) - (b.want ?? Infinity) || a.order - b.order,
        );
      let next = floor;
      const xs = items.map(({ want }) => {
        const x = Math.max(
          want !== undefined ? want - WORKFLOW_NODE_WIDTH / 2 : floor,
          next,
        );
        next = x + WORKFLOW_NODE_WIDTH + GAP_X;
        return x;
      });
      // Shift the row so its middle meets the middle of what it wants
      const wants = items.filter((it) => it.want !== undefined);
      let shift = 0;
      if (wants.length > 0) {
        const wantMid =
          wants.reduce((a, it) => a + it.want!, 0) / wants.length;
        const first = xs[0];
        const last = xs[xs.length - 1] + WORKFLOW_NODE_WIDTH;
        shift = Math.max(floor - first, wantMid - (first + last) / 2);
      }
      items.forEach(({ id }, i) => {
        const x = xs[i] + shift;
        left.set(id, x);
        center.set(id, x + WORKFLOW_NODE_WIDTH / 2);
        right = Math.max(right, x + WORKFLOW_NODE_WIDTH);
      });
    }
    return right;
  };
  left.set(ROOT_ID, 0);
  center.set(ROOT_ID, WORKFLOW_NODE_WIDTH / 2);
  const pipeline = [
    ...groups.flatMap((g) => [g.id, ...g.nodes.map((n) => n.id)]),
  ];
  // Without a plan the agents simply hang off the goal
  let right = placeRows(
    pipeline.length > 0 ? pipeline : outside.map((n) => n.id),
    0,
  );
  right = Math.max(right, WORKFLOW_NODE_WIDTH);
  if (groups.length > 0 && outside.length > 0) {
    placeRows(
      outside.map((n) => n.id),
      right + BAND_GAP,
    );
  }

  // Heads are shorter than agents: centred in the row, edges meet evenly
  const x = (id: string) => left.get(id) ?? 0;
  const y = (id: string) =>
    (row.get(id) ?? 0) * ROW +
    (byId.has(id) ? 0 : (WORKFLOW_NODE_HEIGHT - WORKFLOW_HEAD_HEIGHT) / 2);
  const nodes: WorkflowGraphNode[] = [
    {
      id: ROOT_ID,
      type: 'root',
      position: { x: x(ROOT_ID), y: y(ROOT_ID) },
      data: { goal: workflow.goal, count: workflow.nodes.length },
      draggable: false,
      selectable: false,
      style: { width: WORKFLOW_NODE_WIDTH },
    },
    ...groups.map(
      (g, index): WorkflowGraphNode => ({
        id: g.id,
        type: 'step',
        position: { x: x(g.id), y: y(g.id) },
        data: { step: g.step, index, count: g.nodes.length },
        draggable: false,
        selectable: false,
        style: { width: WORKFLOW_NODE_WIDTH },
      }),
    ),
    ...workflow.nodes.map(
      (n): WorkflowGraphNode => ({
        id: n.id,
        type: 'agent',
        position: { x: x(n.id), y: y(n.id) },
        data: { node: n, selected: n.id === selectedId },
        draggable: false,
        style: { width: WORKFLOW_NODE_WIDTH },
      }),
    ),
  ];
  // Known up front: the nodes are drawn at fixed sizes, so the view can be
  // placed without waiting for React Flow to measure them
  const boxes = nodes.map((n) => ({
    x: n.position.x,
    y: n.position.y,
    right: n.position.x + WORKFLOW_NODE_WIDTH,
    bottom:
      n.position.y +
      (n.type === 'agent' ? WORKFLOW_NODE_HEIGHT : WORKFLOW_HEAD_HEIGHT),
  }));
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const bounds = {
    x: minX,
    y: minY,
    width: Math.max(...boxes.map((b) => b.right)) - minX,
    height: Math.max(...boxes.map((b) => b.bottom)) - minY,
  };
  return { nodes, edges, bounds };
}
