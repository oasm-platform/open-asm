import { useTheme } from '@/components/ui/theme-provider';
import ToolLogo from '@/components/ui/tool-logo';
import type { WorkerToolDto, WorkerToolJobDto } from '@/services/apis/gen/queries';
import { useNavigate } from '@tanstack/react-router';
import {
  Background,
  BaseEdge,
  Controls,
  getBezierPath,
  getSmoothStepPath,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  type OnInit,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Crosshair, Server } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { isWorkerOnline } from '../worker-status';

/** What the worker tier draws: its OS mark, its name, and whether it is live.
 * The page above the graph owns every other fact about the worker — the diagram
 * only has to show which machine sits between the platform and the tools, so it
 * takes the primitives it renders and nothing else. `isOnline` rides along
 * because the badge is part of the mark. */
export type WorkerTierInfo = {
  name?: string;
  os?: string;
  /** Liveness flag; falls back to `lastSeenAt` when absent. */
  isOnline?: boolean;
  lastSeenAt: string;
};

/** Node data carried by each node type (react-flow requires a record). */
type OasmNodeData = Record<string, never>;
type WorkerNodeData = { worker: WorkerTierInfo };
type ToolNodeData = { tool: WorkerToolDto; hasJobs: boolean };
type JobNodeData = { job: WorkerToolJobDto; tool: WorkerToolDto };
type OasmNode = Node<OasmNodeData, 'oasm'>;
type WorkerFlowNode = Node<WorkerNodeData, 'worker'>;
type ToolFlowNode = Node<ToolNodeData, 'tool'>;
type JobFlowNode = Node<JobNodeData, 'job'>;
type AnyFlowNode = OasmNode | WorkerFlowNode | ToolFlowNode | JobFlowNode;

/** Fixed node widths. Pinned so long names wrap at a known column width instead
 * of reflowing the layout — every position below is arithmetic on these. */
const CIRCLE_SIZE = 48;
/** The platform mark sits one size up from the tool circles — enough to read as
 * the root of the chain, still unmistakably the same family. */
const HUB_CIRCLE_SIZE = 56;
/** Gap between the logo circle and its label (`mt-1.5`). */
const ICON_LABEL_GAP = 6;
/** `text-xs` line-height. */
const LINE_HEIGHT = 16;
/** Lines a label may occupy. Long names wrap instead of truncating, so the
 * layout must budget for the wrapped height: `LABEL_LINES * LINE_HEIGHT`.
 * Raise this (and nothing else) if a name still gets clipped. */
const LABEL_LINES = 2;
const LABEL_HEIGHT = LINE_HEIGHT * LABEL_LINES;
/** Wrapped label utility, shared by every tier. */
const LABEL_CLASS = 'mt-1.5 line-clamp-2 w-full text-center text-xs font-medium';
/** Live job marks sit one size down from a tool circle: same shape, clearly a
 * child of the tool above them. */
const JOB_CIRCLE_SIZE = 40;
const NODE_WIDTH = 92;
/** Wider than a tool node because `OASM Platform` is fixed copy, not a
 * data-driven name: it needs ~86px at `text-xs` and must not ellipsise. */
const HUB_WIDTH = 112;
/** Same width as a tool node: the worker tier is no longer a chip, so it lines
 * up with the row below it. */
const WORKER_WIDTH = NODE_WIDTH;
/** Nominal rendered heights, used only to space the tiers. The nodes are also
 * given these as explicit React Flow sizes where they matter, so a few px of
 * drift here costs margin, never correctness.
 *
 * Each is the actual box: circle + label gap + wrapped label budget, plus the
 * tool/hub nodes' `py-1` (8px). Keeping these honest is what makes `TIER_GAP`
 * mean the 36px it says — they are what `WORKER_Y` / `TOOLS_Y` / `JOBS_Y` are
 * built from. */
const NODE_HEIGHT = CIRCLE_SIZE + ICON_LABEL_GAP + LABEL_HEIGHT + 8;
const HUB_HEIGHT = HUB_CIRCLE_SIZE + ICON_LABEL_GAP + LABEL_HEIGHT;
/** Circle, gap and the wrapped label budget — the worker node is the same mark
 * as a tool node, so it costs the same height. */
const WORKER_HEIGHT = CIRCLE_SIZE + ICON_LABEL_GAP + LABEL_HEIGHT;
const JOB_NODE_HEIGHT = JOB_CIRCLE_SIZE + ICON_LABEL_GAP + LABEL_HEIGHT + 8;
/** Horizontal gap between neighbours in a row. */
const COL_GAP = 16;
/** Vertical gap between tiers (OASM -> worker -> tool). */
const TIER_GAP = 36;
/** Drop between the outer jobs of a fan and the one sitting directly under its
 * tool. The fan is a shallow arc rather than a row: same cross-axis spacing, but
 * the marks read as scattered around the tool instead of pinned to a grid.
 * Bounded well under `NODE_WIDTH`, so no two fans can grow into each other. */
const JOB_ARC_DROP = 20;
/** Gap between wrapped tool rows. Only reached past 10 tools. */
const ROW_GAP = 40;

/** Max tools per row. Derived from the real numbers: the canvas is ~1076px and
 * the zoom keeps ~5% margin, so `c` nodes need `92c + 16(c-1)` px. 9 columns is
 * 956px and fits; 10 is 1064px, which still lands at 0.91 zoom — better than
 * wrapping 10 tools into two rows at 0.77. Hence 10, not 9: it keeps every tool
 * count up to 10 in a single row. */
const MAX_COLS = 10;

/** Vertical origin of each tier. The chain is what the diagram documents:
 * OASM (platform backend) -> worker -> connected tools -> the job each tool is
 * running right now. */
const HUB_Y = 0;
const WORKER_Y = HUB_HEIGHT + TIER_GAP;
const TOOLS_Y = WORKER_Y + WORKER_HEIGHT + TIER_GAP;

/** Centre-to-centre pitch of one column's contents: the node itself, the gap to
 * the next column, and the extra width a `count`-mark fan needs around the
 * centre line. Sizing the column by this is what keeps a wide fan from touching
 * its neighbour — `columnWidth(count)` alone returns the span between the fan's
 * outer edges, and its outer marks then sit flush against the slot boundary. */
const columnPitch = (count: number) =>
  columnWidth(Math.max(count, 1)) + COL_GAP;

/** Width of one column holding `count` parallel nodes. */
const columnWidth = (count: number) => count * NODE_WIDTH + (count - 1) * COL_GAP;

/** Split `total` tools into `rows` rows as evenly as possible, giving the
 * earlier rows the remainder — 9 tools over 2 rows is 5 + 4, not 5 + 2 with a
 * lopsided tail. */
function distribute(total: number, rows: number): number[] {
  if (rows < 1) return [];
  const base = Math.floor(total / rows);
  const extra = total % rows;
  return Array.from({ length: rows }, (_, r) => base + (r < extra ? 1 : 0));
}

/** Where one job mark sits inside its tool's column.
 *
 * The fan is laid out on a shallow parabola: the outer marks drop
 * `JOB_ARC_DROP` below the one directly under the tool. That keeps the marks
 * scattered around their tool instead of aligned on a row, while still being
 * arithmetic — a job can only occupy its own reserved slot, so a busy worker
 * never produces overlapping nodes.
 *
 * @param columnCenter - Centre x of the column the tool owns.
 * @param index - Position of the job within the fan.
 * @param count - Size of the fan (jobs per tool are capped at `MAX_COLS`).
 * @returns The node origin, not the centre, because that is what React Flow
 *          positions nodes by.
 */
function jobPosition(
  columnCenter: number,
  index: number,
  count: number,
  baseY: number,
): { x: number; y: number } {
  const halfSpan = ((count - 1) * (NODE_WIDTH + COL_GAP)) / 2;
  const offset = index * (NODE_WIDTH + COL_GAP) - halfSpan;
  // t in [0, 1]: 0 for the mark at the tool's centre line, 1 for the outermost.
  const t = halfSpan === 0 ? 0 : Math.abs(offset) / halfSpan;

  return {
    x: columnCenter - NODE_WIDTH / 2 + offset,
    y: baseY + t * t * JOB_ARC_DROP,
  };
}

/** Deterministic four-tier chain: OASM at the top, the worker beneath it, the
 * tool nodes wrapped into centred rows, and under each tool the job nodes for
 * the work it is running right now. Wires run job -> tool -> worker -> OASM, so
 * nothing connects to the platform directly. No auto-layout library — every
 * position is arithmetic on the index, so the diagram is stable across renders.
 *
 * Non-overlap is structural, not observed: a column is pre-sized to the widest
 * of its two rows (the tool mark and the parallel job marks), every slot inside
 * it is reserved, and rows are all centred inside the same frame. A node can
 * only ever occupy its own reserved slot. */
function buildGraph(
  tools: WorkerToolDto[],
  worker: WorkerTierInfo,
): {
  nodes: AnyFlowNode[];
  edges: Edge[];
  /** Content width, so the scroll container can floor at exactly this. */
  width: number;
  /** Topmost origin of the job arc row (before the per-mark drop). */
  jobsY: number;
  /** Lowest origin any job mark actually occupies — the arc bottom. */
  jobsBottom: number;
} {
  const nodes: AnyFlowNode[] = [
    {
      id: 'oasm',
      type: 'oasm',
      position: { x: -HUB_WIDTH / 2, y: HUB_Y },
      // Explicit width on every node: React Flow otherwise learns a node's box
      // from a DOM measurement pass, and a node that mounts in that pass with a
      // not-yet-laid-out box gets remembered as ~0 wide — the next node to the
      // left then visually lands on top of it. Declaring the width removes the
      // measurement dependency entirely (height stays measured, which is fine:
      // vertical drift only shifts a tier, it never overlaps a sibling).
      width: HUB_WIDTH,
      data: {},
      draggable: false,
      connectable: false,
    },
    {
      id: 'worker',
      type: 'worker',
      position: { x: -WORKER_WIDTH / 2, y: WORKER_Y },
      width: WORKER_WIDTH,
      data: { worker },
      draggable: false,
      connectable: false,
    },
  ];

  // The single platform link. Every other edge terminates at the worker.
  // Both edges use the same `flow` type: this one is vertically aligned with
  // the OASM node, so the orthogonal router collapses it to a straight spine
  // on its own — consistency without a special case.
  const edges: Edge[] = [
    {
      id: 'e-worker-oasm',
      source: 'worker',
      target: 'oasm',
      sourceHandle: 's-center',
      targetHandle: 't-center',
      type: 'flow',
      className: 'graph-edge-flow',
      // The trunk only carries a stream when the worker is scanning anything at
      // all. A tool-specific wire that is not running stays a static rail.
      animated: tools.some((tool) => (tool.currentJobs?.length ?? 0) > 0),
    },
  ];

  const cols = Math.min(MAX_COLS, Math.max(tools.length, 1));
  const rows = Math.ceil(tools.length / cols);
  const perRow = distribute(tools.length, rows);

  // A tool and its jobs share a column: the tool at the top, then its job marks
  // fanned below it. The column is sized to the widest of the two, which is what
  // keeps two jobs of the same tool apart and keeps a wide fan clear of the next
  // tool's column.
  //
  // Per tool the fan is capped at `MAX_COLS` marks — the same width budget the
  // tool rows use — so one very busy tool cannot stretch the diagram off screen.
  const columns = tools.map((tool) => {
    // Hard-capped here, so every position below is bounded by a constant.
    const jobs = (tool.currentJobs ?? []).slice(0, MAX_COLS);
    return { tool, jobs, jobCount: jobs.length };
  });
  const columnSlot = (jobCount: number) => columnPitch(jobCount);
  const columnStart = (column: { jobCount: number }) =>
    -(columnWidth(column.jobCount) - NODE_WIDTH) / 2;
  /** Where the fan's marks are centred: the column's own centre line. */
  const columnCenter = (column: { jobCount: number }, x: number) =>
    x + NODE_WIDTH / 2 + columnStart(column);

  // Rows are centred inside one shared frame, not each inside its own width —
  // otherwise a row of wide job fans would drift off the tier axis and the
  // fan-in to the worker would read lopsided.
  const rowChunks: (typeof columns)[] = [];
  let cursor = 0;
  perRow.forEach((count) => {
    rowChunks.push(columns.slice(cursor, cursor + count));
    cursor += count;
  });
  const rowWidths = rowChunks.map(
    (chunk) =>
      chunk.reduce((total, column) => total + columnSlot(column.jobCount), 0) +
      Math.max(chunk.length - 1, 0) * COL_GAP,
  );
  const widestRow = rowWidths.length ? Math.max(...rowWidths) : NODE_WIDTH;

  const width = Math.max(HUB_WIDTH, WORKER_WIDTH, widestRow);
  /** Column centre line, by tool index. Indexed rather than keyed by tool id:
   * two tools can never collide here, so two fans can never be drawn on the
   * same axis even if the API ever repeated an id. */
  const columnCenters: number[] = new Array(columns.length).fill(0);
  let columnIndex = 0;

  rowChunks.forEach((chunk, row) => {
    const rowWidth = rowWidths[row];
    const rowStart = -rowWidth / 2;
    const y = TOOLS_Y + row * (NODE_HEIGHT + ROW_GAP);
    let x = rowStart;

    chunk.forEach((column) => {
      const { tool, jobCount } = column;
      columnCenters[columnIndex] = columnCenter(column, x);
      columnIndex += 1;

      nodes.push({
        id: `tool-${tool.id}`,
        type: 'tool',
        position: { x: x + columnStart(column), y },
        width: NODE_WIDTH,
        data: { tool, hasJobs: jobCount > 0 },
        draggable: false,
        connectable: false,
      });
      edges.push({
        id: `e-${tool.id}-worker`,
        source: `tool-${tool.id}`,
        target: 'worker',
        sourceHandle: 's-center',
        targetHandle: 't-center',
        // Soft curve, unlike the stepped worker -> OASM spine: a row of tools
        // converging on one chip reads as a fan, and bends are for the trunk.
        // The dash animation (`graph-edge-flow`, styled in index.css) is shared
        // by both types.
        type: 'curve',
        className: 'graph-edge-flow',
        // Only a tool that is actually scanning gets a moving line — that is
        // the whole signal of the diagram.
        animated: jobCount > 0,
      });

      x += columnSlot(column.jobCount) + COL_GAP;
    });
  });

  // Job tier: each tool's running work hangs below that tool, scattered across
  // the column the tool reserved, so the wires arrive at the tool from separate
  // directions instead of stacking into one line.
  const jobsY = TOOLS_Y + rows * NODE_HEIGHT + (rows - 1) * ROW_GAP + TIER_GAP;
  let deepestJob = jobsY;
  columns.forEach(({ tool, jobs }, toolIndex) => {
    if (jobs.length === 0) return;
    const center = columnCenters[toolIndex];

    jobs.forEach((job, jobIndex) => {
      const jobId = `job-${tool.id}-${jobIndex}`;
      const { x, y } = jobPosition(center, jobIndex, jobs.length, jobsY);
      deepestJob = Math.max(deepestJob, y);

      nodes.push({
        id: jobId,
        type: 'job',
        position: { x, y },
        width: NODE_WIDTH,
        data: { job, tool },
        draggable: false,
        connectable: false,
      });
      edges.push({
        id: `e-${jobId}-tool`,
        source: jobId,
        target: `tool-${tool.id}`,
        sourceHandle: 's-center',
        targetHandle: 't-center',
        type: 'curve',
        className: 'graph-edge-flow',
        animated: true,
      });
    });
  });

  return { nodes, edges, width, jobsY, jobsBottom: deepestJob };
}

/** Zero-size handles at the node centre so every wire anchors centre-to-centre
 * (same trick as the assets graph, which keeps lines free of stubs).
 *
 * The `position` prop is not cosmetic for stepped edges: `getSmoothStepPath`
 * derives its elbow direction from the handle side, so each handle is declared
 * on the side its wire actually leaves. In this stack every wire travels
 * upward — tools -> worker -> OASM — so uniformly a source exits `Top` and a
 * target is met from `Bottom`. One convention covers all three tiers. */
function CenterHandles() {
  const style = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  const className = '!opacity-0 !h-0 !w-0 !min-h-0 !min-w-0';
  return (
    <>
      <Handle
        id="t-center"
        type="target"
        position={Position.Bottom}
        style={style}
        className={className}
      />
      <Handle
        id="s-center"
        type="source"
        position={Position.Top}
        style={style}
        className={className}
      />
    </>
  );
}

/** Tier 1 — the platform backend. Same family as the tool nodes below it (a
 * circular framed mark with the label beneath) so the three tiers read as one
 * chain, with the circle one size up to mark it as the root. The `OASM
 * Platform` label replaces the old `Platform` badge — saying it once beats
 * saying it twice.
 *
 * Uses a plain `<img>` rather than the shared `Logo` component: that component
 * hardcodes `alt="logo"`, which is not a meaningful label for this mark, and
 * changing it would mean editing a file outside this change.
 *
 * `dark:bg-white` is the same backdrop trick the tool circles use — the mark
 * needs a light surface to sit on against the dark canvas.
 *
 * The mark is deliberately inset well inside its frame (32px image in a 56px
 * circle = 12px of breathing room per side, against the tool circles' 4px), so
 * the platform root reads as a framed emblem rather than a mark crammed to the
 * edge. Only the image shrinks — the circle stays `size-14`, which keeps
 * `HUB_HEIGHT` and therefore every tier position untouched. */
function OasmNodeComponent() {
  return (
    <div className="flex w-[112px] flex-col items-center text-center">
      <CenterHandles />
      <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-card dark:bg-white">
        <img
          src="/logo.png"
          alt="OASM Platform"
          width={32}
          height={32}
          className="object-contain"
        />
      </span>
      <span className={LABEL_CLASS}>OASM Platform</span>
    </div>
  );
}

/** Tier 2 — the worker. Just the OS mark in a circle with the name under it:
 * identical anatomy to a tool node, so the three tiers read as one family. The
 * page above the graph already carries name, liveness, run mode and tool count,
 * so repeating any of it here was duplication — the diagram only has to show
 * which machine sits between the platform and the tools.
 *
 * The liveness badge is the exception: a dot has no text to duplicate, and it
 * answers the one question a topology diagram is asked ("is that box up?"). It
 * sits on the circle's edge so the OS mark keeps the circle to itself. */
function WorkerNodeComponent({ data }: NodeProps<WorkerFlowNode>) {
  const { worker } = data;
  const online = isWorkerOnline(worker);
  return (
    <div className="flex w-[92px] flex-col items-center text-center">
      <CenterHandles />
      <span className="relative flex size-12 shrink-0">
        <span className="flex size-12 items-center justify-center overflow-hidden rounded-full border bg-card">
          {worker.os ? (
            <img
              className="dark:brightness-0 dark:invert"
              width={40}
              height={40}
              src={`/${worker.os}.svg`}
              alt={worker.os}
            />
          ) : (
            <Server className="size-5 text-muted-foreground" />
          )}
        </span>
        <span
          title={online ? 'Online' : 'Offline'}
          className={`absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full border-2 border-card ${
            online ? 'bg-emerald-500' : 'bg-muted-foreground/60'
          }`}
        />
      </span>
      <span className={LABEL_CLASS}>{worker.name || 'Unnamed worker'}</span>
    </div>
  );
}

/** `nuclei` / `http_probe` -> `Nuclei` / `Http Probe`. Only the first letter of
 * each word is upper-cased, so acronyms the source already spells out
 * (`HTTPX`, `DNS`) keep their casing.
 *
 * Built-in tools only: their API name is the raw lowercase scanner name
 * (`subfinder`), while connectors already arrive as their slug. */
function formatToolName(name: string) {
  return name
    .split(/([ _-])/)
    .map((part) =>
      /^[ _-]$/.test(part)
        ? part
        : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join('');
}

/** Tier 3 — one connected tool: a circular logo with the name beneath it.
 *
 * Built-in tools open their detail page; connector ids are manifest slugs with
 * no page to open, so those stay inert. `hasJobs` only lights the node up while
 * the tool is scanning — the jobs themselves are their own nodes one tier down.
 *
 * The circle keeps the `dark:bg-white` backdrop the old `LogoFrame` used —
 * monochrome tool marks are drawn for light backgrounds and would otherwise
 * disappear against the dark canvas. */
function ToolNodeComponent({ data }: NodeProps<ToolFlowNode>) {
  const navigate = useNavigate();
  const { tool, hasJobs } = data;
  const isBuiltin = tool.type === 'builtin';
  const base =
    'flex w-[92px] flex-col items-center rounded-lg py-1 text-center';

  const body = (
    <>
      <CenterHandles />
      <span
        className={`flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-card dark:bg-white ${
          hasJobs ? 'ring-2 ring-emerald-500/40' : ''
        }`}
      >
        <ToolLogo name={tool.name} logoUrl={tool.logoUrl} size={40} />
      </span>
      <span className={LABEL_CLASS}>
        {isBuiltin ? formatToolName(tool.name) : tool.name}
      </span>
    </>
  );

  if (!isBuiltin) {
    return <div className={base}>{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => navigate({ to: '/tools/$id', params: { id: tool.id } })}
      className={`${base} cursor-pointer transition-colors hover:bg-accent/50`}
    >
      {body}
    </button>
  );
}

/** Tier 4 — one running job: the value its tool is scanning right now. A target
 * mark instead of a logo (a job has no brand), otherwise the same anatomy as
 * the tiers above so the chain reads as one family.
 *
 * `break-all` (not `break-words`): targets are domains and `host:port` pairs
 * with no spaces, so word boundaries alone would let a long one overflow the
 * fixed node width. */
function JobNodeComponent({ data }: NodeProps<JobFlowNode>) {
  const { job, tool } = data;
  const label = job.service ?? job.target ?? 'Unknown target';

  return (
    <div className="flex w-[92px] flex-col items-center rounded-lg py-1 text-center">
      <CenterHandles />
      <span
        title={`${label} · ${tool.name}`}
        className="flex size-10 shrink-0 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10"
      >
        <Crosshair className="size-5 text-emerald-600 dark:text-emerald-400" />
      </span>
      <span className={`${LABEL_CLASS} break-all`} title={label}>
        {label}
      </span>
    </div>
  );
}

/** The moving layer plus its static rail. Both edge types draw the same path,
 * so the dash animation stays a single shared implementation and the two types
 * differ only in how the path is routed.
 *
 * The rail is always drawn; the dash layer only exists while `animated` is set.
 * React Flow fills `animated` from the edge definition, which is what lets a
 * wire idle as a plain line until the tool behind it has a running job. */
function EdgeLayers({
  id,
  path,
  animated,
}: {
  id: string;
  path: string;
  animated?: boolean;
}) {
  return (
    <>
      <BaseEdge id={id} path={path} className="graph-flow-rail" />
      {animated && (
        <BaseEdge id={`${id}-flow`} path={path} className="graph-flow" />
      )}
    </>
  );
}

/** Stepped edge whose dashes march one way: OASM <-> worker.
 *
 * `type: 'straight'` was replaced because the user asked for bent (`gấp khúc`)
 * connectors. `smoothstep` with `borderRadius: 0` gives hard 90-degree corners
 * — the literal reading — while still using React Flow's battle-tested
 * orthogonal router instead of a hand-rolled path.
 *
 * The dash layer walks toward the edge target. Every edge here is declared
 * source -> target along the chain — tool -> worker, worker -> OASM — and both
 * endpoints anchor at the node centre via `CenterHandles`, so "toward the
 * target" reads as flowing away from the platform on every wire. */
function FlowEdge({
  id,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  animated,
}: EdgeProps) {
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 0,
  });

  return <EdgeLayers id={id} path={path} animated={animated} />;
}

/** Same layers, bezier routing — the tool -> worker fan. `getBezierPath`
 * returns a horizontal control-point curve when the handles are on top/bottom,
 * which is exactly the soft S the converging tools want; `curvature` picks
 * between a straight-ish line and an S, and 0.6 keeps the bend visible at the
 * 36px tier gap without looping. */
function CurvedEdge({
  id,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  animated,
}: EdgeProps) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.6,
  });

  return <EdgeLayers id={id} path={path} animated={animated} />;
}

const edgeTypes = { flow: FlowEdge, curve: CurvedEdge };

const nodeTypes = {
  oasm: OasmNodeComponent,
  worker: WorkerNodeComponent,
  tool: ToolNodeComponent,
  job: JobNodeComponent,
};

/** The platform chain for a worker's connected tools: OASM on top, the worker
 * in the middle, tools wrapped into rows beneath it. The caller supplies the
 * tool list only — the tool count is page furniture, not diagram data. */
export function WorkerToolsGraph({
  tools,
  worker,
}: {
  tools: WorkerToolDto[];
  worker: WorkerTierInfo;
}) {
  const { resolvedTheme } = useTheme();
  const { name, os, isOnline, lastSeenAt } = worker;
  // Destructured first so the dependency list stays honest and statically
  // checkable: keying on these primitives rather than the `worker` object means
  // a fresh object literal at the call site does not rebuild the graph.
  const { nodes, edges, width, jobsY, jobsBottom } = useMemo(
    () => buildGraph(tools, { name, os, isOnline, lastSeenAt }),
    [tools, name, os, isOnline, lastSeenAt],
  );

  // Tall canvas on purpose — the diagram is the page's main event. The height
  // comes from the layout rather than a constant, so the job arc never pushes
  // content outside the canvas.
  const hasJobs = tools.some((tool) => (tool.currentJobs?.length ?? 0) > 0);
  const canvasHeight = hasJobs
    ? jobsBottom + JOB_NODE_HEIGHT + 2 * TIER_GAP
    : jobsY - TIER_GAP + NODE_HEIGHT + 2 * TIER_GAP;

  // The fit runs through `onInit` rather than the `fitView` prop. The prop fires
  // on mount too, but the very first frame is the one where the canvas can still
  // have its pre-layout size, and fitting there leaves the diagram off-centre
  // until something else rescales it. `onInit` runs once React Flow has a sized
  // container, so the centring sticks. Keys on the instance so a remount re-fits.
  const fitOnce = useCallback<OnInit<AnyFlowNode, Edge>>((instance) => {
    void instance.fitView({ padding: 0.05, maxZoom: 1 });
  }, []);

  const contentHeight = Math.max(canvasHeight, 620);

  // Remount React Flow whenever the node count per tier changes. Its internal
  // store keeps the node set it was last measured against, and re-rendering new
  // positions into a live store leaves the old nodes in place for a frame — the
  // boxes then visibly sit on top of each other until the next measurement
  // pass. Keying on the layout signature makes that pass start from an empty
  // store instead. Only the poll changing a job count alters this key.
  const layoutKey = tools
    .map((tool) => `${tool.id}:${tool.currentJobs?.length ?? 0}`)
    .join('|');

  return (
    // Horizontal scroll when the viewport is narrower than the diagram: the
    // canvas is floored at the content width so labels stay legible and the
    // user scrolls, instead of the whole chain being scaled down to nothing.
    <div className="w-full overflow-x-auto">
      <div
        className="relative w-full rounded-lg border bg-graph-canvas"
        style={{ minWidth: width, height: contentHeight }}
        role="application"
        aria-label="Connected tools graph"
      >
        <ReactFlowProvider>
          <ReactFlow
            key={layoutKey}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onInit={fitOnce}
            minZoom={0.2}
            maxZoom={2}
            nodesDraggable={false}
            nodesConnectable={false}
            nodesFocusable={false}
            elementsSelectable={false}
            proOptions={{ hideAttribution: true }}
            colorMode={resolvedTheme}
          >
            <Background
              color="var(--color-graph-edge)"
              bgColor="var(--color-graph-canvas)"
            />
            <Controls showInteractive={false} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  );
}

export default WorkerToolsGraph;
