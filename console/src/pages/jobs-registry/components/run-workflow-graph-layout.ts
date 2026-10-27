import type { WorkflowStepStatusDto } from '@/services/apis/gen/queries';
import type { Edge, EdgeMarker, Node } from '@xyflow/react';
import { formatCategory } from '@/pages/tools/components/format-category';

/**
 * Layout of a workflow run as a DAG, in "waves".
 *
 * Wave 1 holds the steps without `needs`; wave N every step whose dependencies
 * all sit in earlier waves. Steps in one wave execute at the same time — that is
 * what expressing a workflow with `needs` buys, and a single sequential column
 * would hide it.
 *
 * Kept pure and free of React so it can be unit-tested, and deterministic so a
 * step finishing never reshuffles the graph.
 */

// A chain is fit to the canvas width, so a wider card or column gap only
// zooms the graph out further. The card grows in height and type size instead,
// and the gap shrinks, so the steps read larger on screen.
const NODE_WIDTH = 280;
const NODE_HEIGHT = 96;
const COLUMN_GAP = 56;
const ROW_GAP = 20;

export interface StepNodeData extends Record<string, unknown> {
  id: string;
  label: string;
  run: string;
  /** Category the step runs its tool in. */
  category?: string;
  /** Display status: see `stepDisplayStatus`. */
  status: string;
  needs: string[];
  jobs: number;
  /** Job rows that failed — shown even when the step itself is done. */
  failed?: number;
  /** Job rows a worker is executing right now. */
  running?: number;
  reason?: string;
  logoUrl?: string;
}

/**
 * Status the graph shows for a step. The engine marks a step `dispatched` as
 * soon as its jobs are created, but they then wait in the queue for a worker
 * to pick them up: until one of them is executing the step is `queued`, not
 * running.
 */
export function stepDisplayStatus(step: WorkflowStepStatusDto): string {
  return step.status === 'dispatched' && !step.running ? 'queued' : step.status;
}

/** How a run was started; the graph's first node. */
export type RunTrigger = 'manual' | 'scheduled';

/** Id of the trigger node. A step id is a workflow job key, never this. */
export const TRIGGER_NODE_ID = '__trigger__';
const TRIGGER_WIDTH = 220;

export interface TriggerNodeData extends Record<string, unknown> {
  trigger: RunTrigger;
  /** When the run was created. */
  startedAt?: string;
}

export interface WorkflowGraphLayoutOptions {
  /** Adds the run's start as the first node, feeding every root step. */
  trigger?: RunTrigger;
  startedAt?: string;
}

export interface WorkflowGraphLayout {
  nodes: Node[];
  edges: Edge[];
  /** Number of waves (columns) in the run. */
  waves: number;
  /** Natural height of the tallest column, so the canvas can size itself. */
  contentHeight: number;
}

/**
 * Plain-text summary of a step for assistive technology.
 *
 * The node is read-only and has no tab stop, so everything the card does not
 * show in text — the job id, the skip reason, what it waits for — has to be
 * spelled out on the node itself. Pure, so it is unit-testable.
 */
export function describeStep(step: WorkflowStepStatusDto): string {
  const parts = [
    step.name || step.id || step.run,
    step.category ? `${step.run} (${formatCategory(step.category)})` : step.run,
    stepDisplayStatus(step),
    `${step.jobs} job${step.jobs === 1 ? '' : 's'}`,
  ];
  const needs = step.needs ?? [];
  if (needs.length > 0) parts.push(`waits for ${needs.join(', ')}`);
  if (step.failed && step.failed > 0) {
    parts.push(`${step.failed} job${step.failed === 1 ? '' : 's'} failed`);
  }
  if (step.reason) parts.push(`reason: ${step.reason}`);
  return parts.join(', ');
}

/**
 * Wave index of every step: roots are wave 1, everything else is one past its
 * deepest dependency. A cycle (which the backend rejects) cannot recurse forever
 * — the guard parks the step in wave 1 instead.
 */
export function computeStepWaves(
  steps: WorkflowStepStatusDto[],
): Map<string, number> {
  const byId = new Map(steps.map((step) => [step.id, step]));
  const waves = new Map<string, number>();

  const waveOf = (id: string, visiting: Set<string>): number => {
    const known = waves.get(id);
    if (known !== undefined) return known;
    const step = byId.get(id);
    if (!step || visiting.has(id)) return 0;
    visiting.add(id);
    const needs = step.needs ?? [];
    const wave =
      needs.length === 0 ? 0 : 1 + Math.max(...needs.map((need) => waveOf(need, visiting)));
    visiting.delete(id);
    waves.set(id, wave);
    return wave;
  };

  for (const step of steps) waveOf(step.id, new Set());
  return waves;
}

/**
 * Edge into `step`. Live while either endpoint is executing; its colour follows
 * the step it feeds.
 */
function stepEdge(
  source: string,
  step: WorkflowStepStatusDto,
  sourceRunning: boolean,
): Edge {
  // The dependency is moving as soon as the step it comes from starts running,
  // and keeps moving while the step that consumes it runs — so the arrows reach
  // the next step from the moment its `needs` step kicks off, not only once it
  // is that step's turn. A queued step is not executing yet.
  const isActive = sourceRunning || stepDisplayStatus(step) === 'dispatched';
  const stroke =
    step.status === 'failed'
      ? 'var(--destructive)'
      : step.status === 'skipped'
        ? 'var(--border)'
        : isActive
          ? 'var(--primary)'
          : 'var(--muted-foreground)';

  return {
    id: `${source}->${step.id}`,
    source,
    target: step.id,
    // Custom edge: it draws the travelling arrow itself, so the flow direction
    // is explicit instead of relying on the default dashes.
    type: 'step',
    // NOT `animated`: that only toggles React Flow's `animated` class, whose
    // stylesheet rule (`.react-flow__edge.animated path`) draws marching ants
    // and a `stroke-dasharray` an inline `undefined` cannot cancel — so the
    // live edge would be dashed *and* carry the arrows. `data.active` is what
    // actually drives the motion.
    data: { active: isActive },
    style: {
      stroke,
      strokeDasharray: isActive ? undefined : '4 4',
      strokeWidth: isActive ? 2 : 1.5,
    },
    markerEnd: {
      // Type-only: the layout module must not pull xyflow in at runtime.
      type: 'arrowclosed' as EdgeMarker['type'],
      width: 16,
      height: 16,
      color: stroke,
    },
  };
}

/** Builds the React Flow nodes/edges for a run's steps. Pure — no DOM. */
export function buildWorkflowGraphLayout(
  steps: WorkflowStepStatusDto[],
  options: WorkflowGraphLayoutOptions = {},
): WorkflowGraphLayout {
  const { trigger, startedAt } = options;
  const withTrigger = !!trigger && steps.length > 0;
  // The trigger takes the first column; the waves start one column later.
  const offsetX = withTrigger ? TRIGGER_WIDTH + COLUMN_GAP : 0;
  const waves = computeStepWaves(steps);
  const waveCount = steps.length === 0 ? 0 : Math.max(...waves.values()) + 1;

  const columns = new Map<number, WorkflowStepStatusDto[]>();
  for (const step of steps) {
    const wave = waves.get(step.id) ?? 0;
    columns.set(wave, [...(columns.get(wave) ?? []), step]);
  }

  const tallest = Math.max(1, ...[...columns.values()].map((c) => c.length));
  const columnHeight = tallest * NODE_HEIGHT + (tallest - 1) * ROW_GAP;

  const nodes: Node[] = [];

  if (withTrigger) {
    nodes.push({
      id: TRIGGER_NODE_ID,
      type: 'workflowTrigger',
      position: { x: 0, y: (columnHeight - NODE_HEIGHT) / 2 },
      draggable: false,
      selectable: false,
      ariaLabel: trigger === 'scheduled' ? 'Started by a schedule' : 'Started manually',
      data: { trigger, startedAt } satisfies TriggerNodeData,
      style: { width: TRIGGER_WIDTH, height: NODE_HEIGHT },
      measured: { width: TRIGGER_WIDTH, height: NODE_HEIGHT },
    });
  }

  for (let wave = 0; wave < waveCount; wave++) {
    const column = columns.get(wave) ?? [];
    const x = offsetX + wave * (NODE_WIDTH + COLUMN_GAP);
    const stackHeight =
      column.length * NODE_HEIGHT + Math.max(0, column.length - 1) * ROW_GAP;
    const startY = (columnHeight - stackHeight) / 2;

    column.forEach((step, index) => {
      nodes.push({
        id: step.id,
        type: 'workflowStep',
        position: { x, y: startY + index * (NODE_HEIGHT + ROW_GAP) },
        draggable: false,
        selectable: false,
        // The node is read-only and has no tab stop, so its tooltip (and
        // everything only the tooltip carries — the job id, the skip reason) is
        // unreachable by keyboard and screen reader. Spell the whole step out
        // here instead.
        ariaLabel: describeStep(step),
        data: {
          id: step.id,
          label: step.name || step.id || step.run,
          run: step.run,
          category: step.category,
          status: stepDisplayStatus(step),
          needs: step.needs,
          jobs: step.jobs,
          failed: step.failed,
          running: step.running,
          reason: step.reason,
          logoUrl: step.logoUrl,
        } satisfies StepNodeData,
        // Fixed height too: every card lines up, and the handles (vertically
        // centred) meet the edges the layout drew for this box.
        style: { width: NODE_WIDTH, height: NODE_HEIGHT },
        // Explicit size: the edge layer needs node dimensions, and deriving them
        // from the DOM is what stalled (nodes rendered, connections did not).
        measured: { width: NODE_WIDTH, height: NODE_HEIGHT },
      });
    });
  }

  // Status by id: an edge is live while EITHER endpoint is executing. A queued
  // step is not executing yet, so its edges stay idle.
  const statusById = new Map(
    steps.map((step) => [step.id, stepDisplayStatus(step)]),
  );

  const edges: Edge[] = steps.flatMap((step) => {
    // A `needs` id with no step of its own (content whose graph failed
    // validation — the API falls back to the raw entries in that case) would be
    // an edge React Flow drops silently, leaving the node orphaned mid-graph.
    const needs = (step.needs ?? []).filter((need) => statusById.has(need));
    // A step with nothing to wait for starts from the trigger, so every step
    // traces back to how the run was started.
    if (needs.length === 0) {
      return withTrigger ? [stepEdge(TRIGGER_NODE_ID, step, false)] : [];
    }
    return needs.map((need) =>
      stepEdge(need, step, statusById.get(need) === 'dispatched'),
    );
  });

  return {
    nodes,
    edges,
    waves: waveCount,
    contentHeight: columnHeight,
  };
}
