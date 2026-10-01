import { Badge } from '@/components/ui/badge';
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
  BackgroundVariant,
  BaseEdge,
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
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Loader2,
  MinusCircle,
} from 'lucide-react';
import { useMemo } from 'react';
import {
  buildWorkflowGraphLayout,
  type StepNodeData,
  type WaveNodeData,
} from './run-workflow-graph-layout';

/**
 * Read-only DAG of a workflow run.
 *
 * One column per wave: wave 1 holds the steps without `needs`, wave N every step
 * whose dependencies all sit in earlier waves. Steps inside a wave execute at the
 * same time, which is what `needs` buys over a fixed order — the graph makes that
 * visible instead of drawing a single column for everything.
 *
 * The run page already polls while any job is executing, so the graph updates
 * live as steps move from waiting → running → done.
 */

const STATUS_META: Record<
  string,
  {
    label: string;
    icon: React.ReactNode;
    text: string;
    dot: string;
    border: string;
  }
> = {
  pending: {
    label: 'waiting',
    icon: <CircleDashed className="size-3.5" />,
    text: 'text-yellow-600 dark:text-yellow-500',
    dot: 'bg-yellow-500',
    border: 'border-border',
  },
  dispatched: {
    label: 'running',
    icon: <Loader2 className="size-3.5 animate-spin" />,
    text: 'text-purple-600 dark:text-purple-400',
    dot: 'bg-purple-500',
    border: 'border-purple-500/60',
  },
  done: {
    label: 'done',
    icon: <CircleCheck className="size-3.5" />,
    text: 'text-green-600 dark:text-green-500',
    dot: 'bg-green-500',
    border: 'border-green-500/40',
  },
  failed: {
    label: 'failed',
    icon: <CircleAlert className="size-3.5" />,
    text: 'text-red-600 dark:text-red-500',
    dot: 'bg-red-500',
    border: 'border-red-500/60',
  },
  skipped: {
    label: 'skipped',
    icon: <MinusCircle className="size-3.5" />,
    text: 'text-muted-foreground',
    dot: 'bg-gray-400',
    border: 'border-border',
  },
};

const SKIP_REASON_LABEL: Record<string, string> = {
  'no-inputs': 'nothing to scan',
  'blocked-by-failure': 'a step it needs failed',
  'assets-discovery-off': 'assets discovery is disabled',
  'run-cancelled': 'the run was cancelled',
};

/** Legend/status order; also what the graph can render. */
const STATUS_ORDER = [
  'pending',
  'dispatched',
  'done',
  'failed',
  'skipped',
] as const;

function statusMeta(status: string) {
  return STATUS_META[status] ?? STATUS_META.pending;
}

function WaveLabelNode({ data }: NodeProps) {
  const { wave, total, done, jobs } = data as WaveNodeData;
  return (
    <div className="flex items-center gap-2 border-b border-dashed pb-1.5 text-xs">
      <span className="font-medium">Wave {wave}</span>
      <span className="text-muted-foreground">
        {done}/{total} done
        {jobs > 0 ? ` · ${jobs} job${jobs > 1 ? 's' : ''}` : ''}
      </span>
    </div>
  );
}

function WorkflowStepNode({ data }: NodeProps) {
  const { id, label, run, status, needs, jobs, reason, logoUrl, duration } =
    data as StepNodeData;
  const meta = statusMeta(status);
  const skipped = status === 'skipped';
  const skipReason = reason ? (SKIP_REASON_LABEL[reason] ?? reason) : undefined;

  const subtitle = skipReason
    ? `skipped: ${skipReason}`
    : needs.length > 0
      ? `needs ${needs.join(', ')}`
      : 'runs in parallel';

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'flex h-full flex-col justify-center gap-1 rounded-lg border bg-card px-2.5 py-2 text-left shadow-sm',
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
            <div className="flex items-center gap-1.5">
              <span className={cn('shrink-0', meta.text)}>{meta.icon}</span>
              {logoUrl && (
                <ToolLogo
                  name={run}
                  logoUrl={logoUrl}
                  size={16}
                  className="shrink-0 rounded-full border"
                />
              )}
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {label}
              </span>
              {duration && (
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {duration}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className={cn('font-medium', meta.text)}>{meta.label}</span>
              <span className="text-muted-foreground">·</span>
              <span className="truncate font-mono text-muted-foreground">
                {run}
              </span>
              {jobs > 0 && (
                <span className="shrink-0 text-muted-foreground">
                  · {jobs} job{jobs > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <span className="truncate text-[11px] text-muted-foreground">
              {subtitle}
            </span>
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
            {label} · {status}
          </p>
          <p className="text-muted-foreground">job id: {id}</p>
          {needs.length > 0 && <p>Waits for: {needs.join(', ')}</p>}
          {skipReason && <p>Skipped: {skipReason}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const nodeTypes = {
  workflowStep: WorkflowStepNode,
  waveLabel: WaveLabelNode,
} satisfies NodeTypes;

/**
 * Edge between a step and the step that needs it.
 *
 * Live while either endpoint is executing: the arrows start travelling from the
 * step the moment it runs (feeding the step that needs it), and keep travelling
 * while the consumer runs — so the mutation flows forward along the chain.
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
  /** Steps executing right now — more than one means the run branched. */
  runningSteps: number;
}

export default function RunWorkflowGraph({
  steps,
  runningSteps,
}: RunWorkflowGraphProps) {
  const { resolvedTheme } = useTheme();
  const { nodes, edges, waves, contentHeight } = useMemo(
    () => buildWorkflowGraphLayout(steps),
    [steps],
  );

  const height = Math.min(520, Math.max(200, contentHeight + 32));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        {runningSteps > 1 && (
          <Badge variant="outline" className="font-normal">
            {runningSteps} steps running in parallel
          </Badge>
        )}
        <span>
          {waves} wave{waves > 1 ? 's' : ''} · {steps.length} step
          {steps.length > 1 ? 's' : ''}
        </span>
        <span className="flex flex-wrap items-center gap-3">
          {STATUS_ORDER.map((status) => {
            const meta = statusMeta(status);
            return (
              <span key={status} className="flex items-center gap-1.5">
                <span className={cn('size-2 rounded-full', meta.dot)} />
                {meta.label}
              </span>
            );
          })}
        </span>
      </div>

      <div style={{ height }} className="rounded-lg border bg-card/40">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          colorMode={resolvedTheme}
          fitView
          fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
          minZoom={0.35}
          maxZoom={1.5}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        </ReactFlow>
      </div>
    </div>
  );
}
