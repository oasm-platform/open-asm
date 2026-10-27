import { ToolLogo } from '@/components/ui/tool-logo';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useTheme } from '@/components/ui/theme-provider';
import { cn } from '@/lib/utils';
import type { WorkflowStepStatusDto } from '@/services/apis/gen/queries';
import {
  Background,
  BaseEdge,
  Controls,
  getSmoothStepPath,
  Handle,
  Position,
  ReactFlow,
  type EdgeProps,
  type EdgeTypes,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dayjs from 'dayjs';
import {
  CalendarClock,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Clock,
  Loader2,
  MinusCircle,
  MousePointerClick,
} from 'lucide-react';
import { memo, useMemo } from 'react';
import {
  buildWorkflowGraphLayout,
  type RunTrigger,
  type StepNodeData,
  type TriggerNodeData,
} from './run-workflow-graph-layout';
import { formatCategory } from '@/pages/tools/components/format-category';

/**
 * Read-only DAG of a workflow run.
 *
 * One column per wave: wave 1 holds the steps without `needs`, wave N every step
 * whose dependencies all sit in earlier waves. Steps inside a wave execute at the
 * same time, which is what `needs` buys over a fixed order.
 *
 * The page already polls while any job is executing, so the graph updates live
 * as steps move from waiting → running → done.
 */

const STATUS_META: Record<
  string,
  {
    label: string;
    icon: React.ReactNode;
    text: string;
    border: string;
  }
> = {
  pending: {
    label: 'waiting',
    icon: <CircleDashed className="size-5" />,
    text: 'text-yellow-600 dark:text-yellow-500',
    border: 'border-border',
  },
  // Jobs created, none picked up by a worker yet.
  queued: {
    label: 'queued',
    icon: <Clock className="size-5" />,
    text: 'text-yellow-600 dark:text-yellow-500',
    border: 'border-yellow-500/50',
  },
  dispatched: {
    label: 'running',
    icon: <Loader2 className="size-5 animate-spin" />,
    text: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-500/60',
  },
  done: {
    label: 'done',
    icon: <CircleCheck className="size-5" />,
    text: 'text-green-600 dark:text-green-500',
    border: 'border-green-500/40',
  },
  failed: {
    label: 'failed',
    icon: <CircleAlert className="size-5" />,
    text: 'text-red-600 dark:text-red-500',
    border: 'border-red-500/60',
  },
  skipped: {
    label: 'skipped',
    icon: <MinusCircle className="size-5" />,
    text: 'text-muted-foreground',
    border: 'border-border',
  },
};

const SKIP_REASON_LABEL: Record<string, string> = {
  'no-inputs': 'nothing to scan',
  'blocked-by-failure': 'a step it needs failed',
  'assets-discovery-off': 'assets discovery is disabled',
  'run-cancelled': 'the run was cancelled',
};

function statusMeta(status: string) {
  return STATUS_META[status] ?? STATUS_META.pending;
}

function WorkflowStepNode({ data }: NodeProps) {
  const {
    id,
    label,
    run,
    category,
    status,
    needs,
    jobs,
    failed,
    running,
    reason,
    logoUrl,
  } = data as StepNodeData;
  const meta = statusMeta(status);
  const skipped = status === 'skipped';
  const skipReason = reason ? (SKIP_REASON_LABEL[reason] ?? reason) : undefined;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            // Focusable so the tooltip (and the skip reason it carries) is
            // reachable by keyboard, not just by hover.
            tabIndex={0}
            className={cn(
              'flex h-full items-center rounded-xl border-2 bg-card px-3.5 py-2.5 text-left shadow-sm',
              meta.border,
              skipped && 'opacity-60',
            )}
          >
            {/* React Flow anchors an edge on these. Without a Handle on the
                custom node it cannot resolve the connection points and drops
                the edge entirely — nodes render, connections do not. They are
                invisible because this graph is read-only. */}
            <Handle
              type="target"
              position={Position.Left}
              isConnectable={false}
              className="invisible !size-0 !min-h-0 !min-w-0 !border-0 !bg-transparent"
            />
            {/* Logo left; step name, then status and job counts, then the tool
                in the middle; status icon on the far right, vertically centred. */}
            <div className="flex h-full w-full items-center justify-between gap-3">
              {logoUrl && (
                <ToolLogo
                  name={run}
                  logoUrl={logoUrl}
                  size={40}
                  className="shrink-0 rounded-full border"
                />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-base font-semibold">{label}</span>
                <div className="flex items-center gap-1.5 text-sm">
                  <span className={cn('shrink-0 font-medium', meta.text)}>
                    {meta.label}
                  </span>
                  {jobs > 0 && (
                    <span className="shrink-0 text-muted-foreground">
                      · {jobs} job{jobs > 1 ? 's' : ''}
                    </span>
                  )}
                  {!!failed && failed > 0 && (
                    <span className="shrink-0 font-medium text-destructive">
                      · {failed} failed
                    </span>
                  )}
                  {skipReason && (
                    <span className="truncate text-muted-foreground">
                      · {skipReason}
                    </span>
                  )}
                </div>
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {run}
                  {category ? ` · ${formatCategory(category)}` : ''}
                </span>
              </div>
              <span className={cn('flex shrink-0 items-center', meta.text)}>
                {meta.icon}
              </span>
            </div>
            <Handle
              type="source"
              position={Position.Right}
              isConnectable={false}
              className="invisible !size-0 !min-h-0 !min-w-0 !border-0 !bg-transparent"
            />
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-72">
          <p className="font-medium">
            {label} · {meta.label}
          </p>
          <p className="text-muted-foreground">job id: {id}</p>
          {status === 'queued' && <p>Waiting for a worker to pick up its jobs</p>}
          {!!running && running > 0 && (
            <p>
              {running} of {jobs} job(s) running
            </p>
          )}
          {needs.length > 0 && <p>Waits for: {needs.join(', ')}</p>}
          {!!failed && failed > 0 && (
            <p className="text-destructive">{failed} job(s) failed</p>
          )}
          {skipReason && <p>Skipped: {skipReason}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const TRIGGER_META: Record<
  RunTrigger,
  { label: string; icon: React.ReactNode }
> = {
  manual: { label: 'Manual', icon: <MousePointerClick className="size-5" /> },
  scheduled: { label: 'Schedule', icon: <CalendarClock className="size-5" /> },
};

/** First node of every run: how it was started. Every root step hangs off it. */
function WorkflowTriggerNode({ data }: NodeProps) {
  const { trigger, startedAt } = data as TriggerNodeData;
  const meta = TRIGGER_META[trigger] ?? TRIGGER_META.manual;

  return (
    <div className="flex h-full items-center gap-3 rounded-xl border-2 border-primary/40 bg-card px-3.5 py-2.5 text-left shadow-sm">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        {meta.icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Trigger
        </span>
        <span className="truncate text-base font-semibold">{meta.label}</span>
        {startedAt && (
          <span className="truncate font-mono text-xs text-muted-foreground">
            {dayjs(startedAt).format('YYYY-MM-DD HH:mm')}
          </span>
        )}
      </div>
      {/* Source only: nothing comes before the trigger. */}
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        className="invisible !size-0 !min-h-0 !min-w-0 !border-0 !bg-transparent"
      />
    </div>
  );
}

const nodeTypes = {
  workflowStep: WorkflowStepNode,
  workflowTrigger: WorkflowTriggerNode,
} satisfies NodeTypes;

/**
 * Edge between a step and the step that needs it.
 *
 * Live while either endpoint is executing: the arrows start travelling from the
 * step the moment it runs (feeding the step that needs it), and keep travelling
 * while the consumer runs — so the flow reads forward along the chain.
 */
function AnimatedStepEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  style,
}: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const active = (data as { active?: boolean } | undefined)?.active === true;

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      {active &&
        [0, 0.55].map((delay) => (
          <path
            key={delay}
            d="M -4,-3.5 L 5,0 L -4,3.5 Z"
            fill="var(--primary)"
            opacity={0.95}
          >
            {/* repeatCount=indefinite keeps the arrows flowing for as long as
                the step runs, not just for one pass. */}
            <animateMotion
              dur="1.1s"
              begin={`${delay}s`}
              repeatCount="indefinite"
              path={edgePath}
              rotate="auto"
            />
          </path>
        ))}
    </>
  );
}

const edgeTypes = {
  step: AnimatedStepEdge,
} satisfies EdgeTypes;

interface RunWorkflowGraphProps {
  steps: WorkflowStepStatusDto[];
  /** How the run was started: the first node, feeding every root step. */
  trigger?: RunTrigger;
  /** When the run was created, shown on the trigger node. */
  startedAt?: string;
}

/** Floor for the canvas height. The DAG is the page's main event — a run with a
 * single wave would otherwise squeeze it into a letterbox strip, with the fit
 * padding dominating the box and the step cards floating in the middle of
 * nothing. Matches the worker detail graph, which floors its canvas for the same
 * reason. */
const MIN_CANVAS_HEIGHT = 480;

/** Ceiling for the canvas height. `contentHeight` is exact, so the cap only ever
 * bites on a run with a very wide wave; without it one run with a dozen parallel
 * steps would push the job table a full screen down. Still far taller than the
 * old 520px, so a wide DAG keeps its nodes legible instead of being shrunk to
 * fit a strip. */
const MAX_CANVAS_HEIGHT = 720;

// Memoized: the run page re-renders on every poll tick and the canvas only
// changes when `steps` does.
const RunWorkflowGraph = memo(function RunWorkflowGraph({
  steps,
  trigger = 'manual',
  startedAt,
}: RunWorkflowGraphProps) {
  const { resolvedTheme } = useTheme();
  const { nodes, edges, contentHeight } = useMemo(
    () => buildWorkflowGraphLayout(steps, { trigger, startedAt }),
    [steps, trigger, startedAt],
  );

  const height = Math.min(
    MAX_CANVAS_HEIGHT,
    Math.max(MIN_CANVAS_HEIGHT, contentHeight + 32),
  );

  return (
    <div style={{ height }} className="rounded-lg border bg-background p-1.5">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        colorMode={resolvedTheme}
        fitView
        fitViewOptions={{ padding: 0.1, maxZoom: 1 }}
        minZoom={0.35}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        // The wheel belongs to the page, not the canvas. `zoomOnScroll` stops the
        // wheel from zooming the graph, and `preventScrolling={false}` stops the
        // zoom handler from calling `preventDefault()` on it — without that second
        // flag React Flow swallows the event and the page will not scroll while
        // the cursor is over the diagram. Trackpad pinch (ctrl + wheel) still
        // zooms, which is what `zoomOnPinch` keeps alive.
        zoomOnScroll={false}
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
      >
        {/* Same canvas paint as the worker detail graph: dots + grid line colour
            come from the shared --color-graph-* tokens, so the run DAG sits on
            the same surface as every other diagram instead of a lighter card. */}
        <Background
          color="var(--color-graph-edge)"
          bgColor="var(--color-graph-canvas)"
        />
        {/* Same control bar as the worker detail graph: zoom, fit view and
            lock. Zooming is a deliberate action here, not a side effect of
            scrolling the page past the diagram. */}
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
});

export default RunWorkflowGraph;
