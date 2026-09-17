import { Badge } from '@/components/ui/badge';
import { useTheme } from '@/components/ui/theme-provider';
import ToolLogo from '@/components/ui/tool-logo';
import type { WorkerToolDto } from '@/services/apis/gen/queries';
import { useNavigate } from '@tanstack/react-router';
import {
  Background,
  BaseEdge,
  Controls,
  getSmoothStepPath,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Server } from 'lucide-react';
import { useMemo } from 'react';
import { WorkerStatus } from '../worker-status';

/** Structural subset of `GetWorkerResponseDto` that the worker tier renders.
 * Passed as primitives rather than the whole DTO so the graph depends only on
 * what it draws — and so the layout memo can key on stable values.
 *
 * `isOnline` stays optional on purpose: `WorkerStatus` falls back to comparing
 * `lastSeenAt` against the 30s threshold when the flag is absent, and coercing
 * it to a boolean here would defeat that. */
export type WorkerTierInfo = {
  name?: string;
  os?: string;
  runMode?: string | null;
  isOnline?: boolean;
  lastSeenAt: string;
};

/** Node data carried by each node type (react-flow requires a record). */
type OasmNodeData = Record<string, never>;
type WorkerNodeData = { worker: WorkerTierInfo; toolsCount: number };
type ToolNodeData = { tool: WorkerToolDto };
type OasmNode = Node<OasmNodeData, 'oasm'>;
type WorkerFlowNode = Node<WorkerNodeData, 'worker'>;
type ToolFlowNode = Node<ToolNodeData, 'tool'>;
type AnyFlowNode = OasmNode | WorkerFlowNode | ToolFlowNode;

/** Fixed node widths. Pinned so long names truncate instead of reflowing the
 * column, which would break the deterministic layout. */
const CIRCLE_SIZE = 48;
/** The platform mark sits one size up from the tool circles — enough to read as
 * the root of the chain, still unmistakably the same family. */
const HUB_CIRCLE_SIZE = 56;
/** Gap between the logo circle and its label (`mt-1.5`). */
const ICON_LABEL_GAP = 6;
/** `text-xs` line-height. One line only — the label truncates. */
const LABEL_HEIGHT = 16;
const NODE_WIDTH = 92;
/** Wider than a tool node because `OASM Platform` is fixed copy, not a
 * data-driven name: it needs ~86px at `text-xs` and must not ellipsise. */
const HUB_WIDTH = 112;
const WORKER_WIDTH = 260;
/** Nominal rendered heights, used only to space the tiers. `fitView` measures
 * the real DOM, so a few px of drift here costs margin, never correctness.
 *
 * Each is the actual box: circle + label gap + label line, plus the tool/hub
 * nodes' `py-1` (8px). Keeping them honest is what makes `TIER_GAP` mean the
 * 36px it says — these values are what `WORKER_Y` / `TOOLS_Y` are built from. */
const NODE_HEIGHT = CIRCLE_SIZE + ICON_LABEL_GAP + LABEL_HEIGHT + 8;
const HUB_HEIGHT = HUB_CIRCLE_SIZE + ICON_LABEL_GAP + LABEL_HEIGHT;
const WORKER_HEIGHT = 72;
/** Horizontal gap between neighbours in a row. */
const COL_GAP = 16;
/** Vertical gap between tiers (OASM -> worker -> tools). */
const TIER_GAP = 36;
/** Gap between wrapped tool rows. Only reached past 10 tools. */
const ROW_GAP = 40;

/** Max tools per row. Derived from the real numbers: the canvas is ~1076px and
 * `fitView`'s `padding: 0.05` leaves ~968px usable, so `c` nodes need
 * `92c + 16(c-1)` px. 9 columns is 956px and fits; 10 is 1064px, which still
 * lands at 0.91 zoom — better than wrapping 10 tools into two rows at 0.77.
 * Hence 10, not 9: it keeps every tool count up to 10 in a single row. */
const MAX_COLS = 10;

/** Vertical origin of each tier. The chain is what the diagram documents:
 * OASM (platform backend) -> worker -> connected tools. */
const HUB_Y = 0;
const WORKER_Y = HUB_HEIGHT + TIER_GAP;
const TOOLS_Y = WORKER_Y + WORKER_HEIGHT + TIER_GAP;

/** `http_probe` -> `Http Probe`. Shared with the worker detail page. */
export function formatCategory(category: string) {
  return category
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Width of one row holding `count` nodes. */
const rowWidth = (count: number) => count * NODE_WIDTH + (count - 1) * COL_GAP;

/** Split `total` tools into `rows` rows as evenly as possible, giving the
 * earlier rows the remainder — 9 tools over 2 rows is 5 + 4, not 5 + 2 with a
 * lopsided tail. */
function distribute(total: number, rows: number): number[] {
  if (rows < 1) return [];
  const base = Math.floor(total / rows);
  const extra = total % rows;
  return Array.from({ length: rows }, (_, r) => base + (r < extra ? 1 : 0));
}

/** Deterministic three-tier chain: OASM at the top, the worker beneath it, then
 * the tool nodes wrapped into centred rows. Wires run tool -> worker -> OASM,
 * so no tool ever connects to the platform directly. No auto-layout library —
 * every position is arithmetic on the index, so the diagram is stable across
 * renders. */
function buildGraph(
  tools: WorkerToolDto[],
  toolsCount: number,
  worker: WorkerTierInfo,
): {
  nodes: AnyFlowNode[];
  edges: Edge[];
  /** Content width, so the scroll container can floor at exactly this. */
  width: number;
} {
  const nodes: AnyFlowNode[] = [
    {
      id: 'oasm',
      type: 'oasm',
      position: { x: -HUB_WIDTH / 2, y: HUB_Y },
      data: {},
      draggable: false,
      connectable: false,
    },
    {
      id: 'worker',
      type: 'worker',
      position: { x: -WORKER_WIDTH / 2, y: WORKER_Y },
      data: { worker, toolsCount },
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
    },
  ];

  const cols = Math.min(MAX_COLS, Math.max(tools.length, 1));
  const rows = Math.ceil(tools.length / cols);
  const perRow = distribute(tools.length, rows);

  let width = Math.max(HUB_WIDTH, WORKER_WIDTH);
  let index = 0;
  perRow.forEach((count, row) => {
    const thisRowWidth = rowWidth(count);
    width = Math.max(width, thisRowWidth);
    // Each row is centred on the tier axis so the convergence reads
    // symmetrically.
    const startX = -thisRowWidth / 2;
    const y = TOOLS_Y + row * (NODE_HEIGHT + ROW_GAP);

    for (let col = 0; col < count; col++) {
      const tool = tools[index];
      index += 1;
      nodes.push({
        id: `tool-${tool.id}`,
        type: 'tool',
        position: {
          x: startX + col * (NODE_WIDTH + COL_GAP),
          y,
        },
        data: { tool },
        draggable: false,
        connectable: false,
      });
      edges.push({
        id: `e-${tool.id}-worker`,
        source: `tool-${tool.id}`,
        target: 'worker',
        sourceHandle: 's-center',
        targetHandle: 't-center',
        // Stepped (`type: 'flow'` -> smoothstep with hard corners) so the wires
        // read as bent connectors, with the bidirectional dash animation coming
        // from the `graph-edge-flow` class. Styling lives in index.css.
        type: 'flow',
        className: 'graph-edge-flow',
      });
    }
  });

  return { nodes, edges, width };
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
      <span className="mt-1.5 w-full truncate text-xs font-medium">
        OASM Platform
      </span>
    </div>
  );
}

/** Tier 2 — the worker. A horizontal chip so it reads as a tier rather than a
 * second hub: machine icon, name, liveness and the details that describe how it
 * runs. Reuses `WorkerStatus` from the sibling module, so the online logic is
 * shared with the list page instead of duplicated. */
function WorkerNodeComponent({ data }: NodeProps<WorkerFlowNode>) {
  const { worker, toolsCount } = data;
  return (
    <div className="flex w-[260px] items-center gap-3 rounded-xl border bg-card p-3 text-left shadow-sm">
      <CenterHandles />
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
        {worker.os ? (
          <img
            className="dark:brightness-0 dark:invert"
            width={26}
            height={26}
            src={`/${worker.os}.svg`}
            alt={worker.os}
          />
        ) : (
          <Server className="size-5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {worker.name || 'Unnamed worker'}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="flex items-center gap-1.5">
            <WorkerStatus worker={worker} />
          </span>
          {worker.runMode && (
            <Badge variant="secondary" className="text-xs">
              {worker.runMode.toUpperCase()}
            </Badge>
          )}
          <Badge variant="secondary" className="text-xs">
            {toolsCount} tool{toolsCount === 1 ? '' : 's'}
          </Badge>
        </div>
      </div>
    </div>
  );
}

/** Tier 3 — one connected tool: a circular logo with the name beneath it.
 * Built-in tools open their detail page; connector ids are manifest slugs with
 * no page to open, so those stay inert.
 *
 * The circle keeps the `dark:bg-white` backdrop the old `LogoFrame` used —
 * monochrome tool marks are drawn for light backgrounds and would otherwise
 * disappear against the dark canvas. */
function ToolNodeComponent({ data }: NodeProps<ToolFlowNode>) {
  const navigate = useNavigate();
  const { tool } = data;
  const isBuiltin = tool.type === 'builtin';
  const base =
    'flex w-[92px] flex-col items-center rounded-lg py-1 text-center';

  const body = (
    <>
      <CenterHandles />
      <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-card dark:bg-white">
        <ToolLogo name={tool.name} logoUrl={tool.logoUrl} size={40} />
      </span>
      <span className="mt-1.5 w-full truncate text-xs font-medium">
        {tool.name}
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

/** Stepped edge with data flowing both ways.
 *
 * `type: 'straight'` was replaced because the user asked for bent (`gấp khúc`)
 * connectors. `smoothstep` with `borderRadius: 0` gives hard 90-degree corners
 * — the literal reading — while still using React Flow's battle-tested
 * orthogonal router instead of a hand-rolled path.
 *
 * Three stacked copies of the same path: a static rail plus two dash layers
 * animated in opposite directions (`graph-flow-up` / `graph-flow-down`, from
 * index.css). React Flow's built-in `animated: true` only marches one way, so
 * it cannot express "up and down". This keeps the whole thing in CSS and stays
 * the same size as the built-in edge. */
function FlowEdge({
  id,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
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

  return (
    <>
      <BaseEdge id={id} path={path} className="graph-flow-rail" />
      <BaseEdge id={`${id}-up`} path={path} className="graph-flow-up" />
      <BaseEdge id={`${id}-down`} path={path} className="graph-flow-down" />
    </>
  );
}

const edgeTypes = { flow: FlowEdge };

const nodeTypes = {
  oasm: OasmNodeComponent,
  worker: WorkerNodeComponent,
  tool: ToolNodeComponent,
};

/** The platform chain for a worker's connected tools: OASM on top, the worker
 * in the middle, tools wrapped into rows beneath it. */
export function WorkerToolsGraph({
  tools,
  toolsCount,
  worker,
}: {
  tools: WorkerToolDto[];
  toolsCount: number;
  worker: WorkerTierInfo;
}) {
  const { resolvedTheme } = useTheme();
  const { name, os, runMode, isOnline, lastSeenAt } = worker;
  // Destructured first so the dependency list stays honest and statically
  // checkable: keying on these primitives rather than the `worker` object means
  // a fresh object literal at the call site does not rebuild the graph.
  const { nodes, edges, width } = useMemo(
    () =>
      buildGraph(tools, toolsCount, {
        name,
        os,
        runMode,
        isOnline,
        lastSeenAt,
      }),
    [tools, toolsCount, name, os, runMode, isOnline, lastSeenAt],
  );

  return (
    // Horizontal scroll when the viewport is narrower than the diagram:
    // `fitView` can only shrink, and squeezing a 1046px row set into 314px
    // would drop the labels to ~4px. Flooring the canvas at the content width
    // keeps them legible and lets the user scroll instead.
    <div className="w-full overflow-x-auto">
      <div
        className="relative h-[320px] w-full rounded-lg border bg-graph-canvas sm:h-[340px]"
        style={{ minWidth: width }}
        role="application"
        aria-label="Connected tools graph"
      >
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            // `maxZoom` caps the fit: without it a small chain is blown up past
            // 1x and its labels render larger than the page's. The outer
            // `maxZoom` still lets the user zoom to 2 manually.
            fitViewOptions={{ padding: 0.05, maxZoom: 1 }}
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
