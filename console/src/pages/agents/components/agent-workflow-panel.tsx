import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useTheme } from '@/components/ui/theme-provider';
import { cn } from '@/lib/utils';
import {
  useAgentsControllerCancelConversationSubagent,
  useAgentsControllerGetConversationWorkflow,
  type SubagentResponseDto,
  type WorkflowNodeDto,
  type WorkflowNoteDto,
} from '@/services/apis/gen/queries';
import {
  Background,
  BaseEdge,
  Controls,
  getBezierPath,
  Handle,
  Position,
  ReactFlow,
  useReactFlow,
  useStore,
  type EdgeProps,
  type EdgeTypes,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  CircleDashed,
  Flag,
  Lightbulb,
  Loader2,
  Maximize2,
  Square,
} from 'lucide-react';
import { memo, useEffect, useMemo, useState } from 'react';
import {
  buildWorkflowLayout,
  WORKFLOW_EDGE_KINDS,
  WORKFLOW_HEAD_HEIGHT,
  WORKFLOW_NODE_HEIGHT,
  type AgentNodeData,
  type RootNodeData,
  type StepNodeData,
  type WorkflowEdgeData,
} from './agent-workflow-layout';
import { SidePanelSection } from './side-panel-layout';
import { SubagentTranscript } from './subagent-transcript';
import { isSubagentActive, SUBAGENT_STATUS } from './subagents-panel';

const STEP_STATUS: Record<string, { icon: typeof CheckCircle2; className: string }> =
  {
    pending: { icon: CircleDashed, className: 'text-muted-foreground' },
    in_progress: { icon: Loader2, className: 'text-sky-500 animate-spin' },
    completed: { icon: CheckCircle2, className: 'text-emerald-500' },
    failed: { icon: AlertTriangle, className: 'text-destructive' },
  };

const OUTCOME_CLASS: Record<string, string> = {
  done: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  partial: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  blocked: 'bg-destructive/10 text-destructive',
};

const EDGE_KIND = Object.fromEntries(WORKFLOW_EDGE_KINDS.map((k) => [k.kind, k]));

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

const handleClass = '!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-muted-foreground/40';

const RootNode = memo(function RootNode({ data }: NodeProps) {
  const { goal, count } = data as unknown as RootNodeData;
  return (
    <div
      className="flex flex-col justify-center gap-0.5 rounded-lg border bg-card px-3 text-xs shadow-xs"
      style={{ height: WORKFLOW_HEAD_HEIGHT }}
      title={goal ?? undefined}
    >
      <div className="flex items-center gap-1.5 font-medium">
        <Flag className="size-3.5 shrink-0 text-muted-foreground" />
        Goal
        <span className="ml-auto tabular-nums font-normal text-muted-foreground">
          {count} agent{count === 1 ? '' : 's'}
        </span>
      </div>
      <p className="line-clamp-2 text-muted-foreground">
        {goal ?? 'Main agent'}
      </p>
      <Handle type="source" position={Position.Right} className={handleClass} />
    </div>
  );
});

const StepNode = memo(function StepNode({ data }: NodeProps) {
  const { step, index, count } = data as unknown as StepNodeData;
  const status = STEP_STATUS[step.status] ?? STEP_STATUS.pending;
  const Icon = status.icon;
  return (
    <div
      className="flex flex-col justify-center gap-0.5 rounded-lg border border-dashed bg-muted/40 px-3 text-xs"
      style={{ height: WORKFLOW_HEAD_HEIGHT }}
      title={step.content}
    >
      <Handle type="target" position={Position.Left} className={handleClass} />
      <div className="flex items-center gap-1.5">
        <Icon className={cn('size-3.5 shrink-0', status.className)} />
        <span className="line-clamp-2 font-medium">
          {`${index + 1}. ${step.content}`}
        </span>
      </div>
      <span className="tabular-nums text-muted-foreground">
        {count} agent{count === 1 ? '' : 's'}
      </span>
      <Handle type="source" position={Position.Right} className={handleClass} />
    </div>
  );
});

const AgentNode = memo(function AgentNode({ data }: NodeProps) {
  const { node, selected } = data as unknown as AgentNodeData;
  const status = SUBAGENT_STATUS[node.status];
  const Icon = status.icon;
  const waiting = node.status === 'pending' && node.waitingOn.length > 0;
  return (
    <div
      className={cn(
        'flex cursor-pointer flex-col gap-1 rounded-lg border bg-card px-3 py-2 text-xs shadow-xs transition-colors hover:border-foreground/30',
        node.status === 'in_progress' && 'border-sky-500/50',
        selected && 'border-primary ring-1 ring-primary',
      )}
      style={{ height: WORKFLOW_NODE_HEIGHT }}
    >
      <Handle type="target" position={Position.Left} className={handleClass} />
      <div className="flex items-center gap-1.5">
        <Icon className={cn('size-3.5 shrink-0', status.className)} />
        <span className="truncate font-medium">@{node.name}</span>
        {node.outcome && (
          <span
            className={cn(
              'ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium',
              OUTCOME_CLASS[node.outcome],
            )}
          >
            {node.outcome}
          </span>
        )}
      </div>
      <p className="line-clamp-2 text-muted-foreground">
        {waiting ? `Waiting for ${node.waitingOn.length} agent(s) · ` : ''}
        {node.objective}
      </p>
      {node.findings.length > 0 && (
        <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
          {node.findings.length} candidate finding
          {node.findings.length === 1 ? '' : 's'}
        </span>
      )}
      <Handle type="source" position={Position.Right} className={handleClass} />
    </div>
  );
});

const nodeTypes: NodeTypes = { root: RootNode, step: StepNode, agent: AgentNode };

/**
 * A link coloured by how the target came from the source, with a pulse
 * travelling left to right along it: fast while work flows through it,
 * slow otherwise.
 */
function FlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const { kind, live, highlighted, dimmed } = data as unknown as WorkflowEdgeData;
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const meta = EDGE_KIND[kind];
  const opacity = dimmed ? 0.2 : 1;
  return (
    <g style={{ opacity }} data-kind={kind}>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: meta.color,
          strokeWidth: highlighted ? 2.25 : 1.5,
          strokeDasharray: meta.dashed ? '5 4' : undefined,
          strokeOpacity: live || highlighted ? 1 : 0.65,
        }}
      />
      {!reducedMotion() && (
        <circle r={live ? 3.5 : 2.5} fill={meta.color}>
          <animateMotion
            dur={live ? '1.4s' : '3.5s'}
            repeatCount="indefinite"
            path={path}
          />
        </circle>
      )}
    </g>
  );
}

const edgeTypes: EdgeTypes = { flow: FlowEdge };

function EdgeLegend() {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 px-2 text-xs text-muted-foreground">
      {WORKFLOW_EDGE_KINDS.map((k) => (
        <li key={k.kind} className="flex items-center gap-1.5">
          <svg width="18" height="6" aria-hidden>
            <line
              x1="0"
              y1="3"
              x2="18"
              y2="3"
              stroke={k.color}
              strokeWidth="2"
              strokeDasharray={k.dashed ? '4 3' : undefined}
            />
          </svg>
          {k.label}
        </li>
      ))}
    </ul>
  );
}

const NOTE_ICON: Record<string, typeof Lightbulb> = {
  fact: BookOpen,
  decision: Lightbulb,
  issue: AlertTriangle,
};

function NoteRow({ note }: { note: WorkflowNoteDto }) {
  const Icon = NOTE_ICON[note.kind] ?? BookOpen;
  return (
    <li className="flex items-start gap-2.5 rounded-lg px-2 py-1 text-sm">
      <Icon
        className={cn(
          'mt-0.5 size-4 shrink-0 text-muted-foreground',
          note.kind === 'issue' && 'text-amber-500',
        )}
        aria-label={note.kind}
      />
      <div className="min-w-0 flex-1">
        <p className="break-words">
          {note.key && <span className="font-medium">{note.key}: </span>}
          {note.content}
        </p>
        <p className="text-xs text-muted-foreground">@{note.author}</p>
      </div>
    </li>
  );
}

function NodeDetail({
  node,
  nodes,
  subagent,
  conversationId,
}: {
  node: WorkflowNodeDto;
  nodes: WorkflowNodeDto[];
  subagent?: SubagentResponseDto;
  conversationId: string;
}) {
  const cancel = useAgentsControllerCancelConversationSubagent();
  const active = subagent ? isSubagentActive(subagent) : false;
  const name = (id: string) => {
    const n = nodes.find((x) => x.id === id);
    return n ? `@${n.name}` : id.slice(0, 8);
  };
  const links = [
    { label: 'Waits for', ids: node.after },
    { label: 'Derived from', ids: node.derivedFrom },
    { label: 'Follows up', ids: node.continuesFrom ? [node.continuesFrom] : [] },
  ].filter((l) => l.ids.length > 0);
  return (
    <SidePanelSection
      title={`@${node.name}`}
      meta={
        active ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 text-muted-foreground hover:cursor-pointer"
            disabled={cancel.isPending}
            onClick={() =>
              cancel.mutate({ id: conversationId, subagentId: node.id })
            }
          >
            <Square className="size-3" />
            Stop
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-2 px-2 text-sm">
        {links.map((l) => (
          <p key={l.label} className="text-xs text-muted-foreground">
            {l.label}: {l.ids.map(name).join(', ')}
          </p>
        ))}
        {node.summary && <p>{node.summary}</p>}
        {node.findings.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-4 text-xs">
            {node.findings.map((f, i) => (
              <li key={i}>
                {f.severity && <span className="font-medium">[{f.severity}] </span>}
                {f.title}
              </li>
            ))}
          </ul>
        )}
        {node.error && <p className="text-xs text-destructive">{node.error}</p>}
      </div>
      {subagent && (
        <div className="px-2 pt-2">
          <SubagentTranscript subagent={subagent} conversationId={conversationId} />
        </div>
      )}
    </SidePanelSection>
  );
}

/**
 * Fits the graph again once its box stops changing size (detail pane opened,
 * panel resized): refitting on every frame of a divider drag makes it stutter.
 */
function FitOnResize({ minZoom }: { minZoom: number }) {
  const { fitView } = useReactFlow();
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  useEffect(() => {
    if (!width || !height) return;
    const timer = setTimeout(() => {
      void fitView({ padding: 0.08, maxZoom: 1, minZoom });
    }, 150);
    return () => clearTimeout(timer);
  }, [width, height, minZoom, fitView]);
  return null;
}

function WorkflowCanvas({
  layout,
  onSelect,
  expanded,
}: {
  layout: ReturnType<typeof buildWorkflowLayout>;
  onSelect: (id: string) => void;
  expanded?: boolean;
}) {
  const { resolvedTheme } = useTheme();
  // The side panel shows the whole graph small; Expand is for reading it
  const fitMin = expanded ? 0.2 : 0.3;
  return (
    <ReactFlow
      nodes={layout.nodes}
      edges={layout.edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      colorMode={resolvedTheme}
      fitView
      fitViewOptions={{ padding: 0.08, maxZoom: 1, minZoom: fitMin }}
      minZoom={0.2}
      maxZoom={1.5}
      nodesDraggable={false}
      nodesConnectable={false}
      zoomOnScroll={!!expanded}
      preventScrolling={!!expanded}
      proOptions={{ hideAttribution: true }}
      onNodeClick={(_, node) => {
        if (node.type === 'agent') onSelect(node.id);
      }}
    >
      <Background gap={16} size={1} />
      <Controls showInteractive={false} position="bottom-left" />
      <FitOnResize minZoom={fitMin} />
    </ReactFlow>
  );
}

interface AgentWorkflowPanelProps {
  conversationId: string;
  /** Live list from the chat stream: a change refreshes the snapshot */
  subagents: SubagentResponseDto[];
  /** Plan state from the stream, same purpose */
  planVersion: string;
}

/**
 * The conversation as a workflow, read left to right: the goal, then each
 * plan step with the subagents dispatched for it, its last results feeding
 * the next step, and the links between agents (waited for, derived from,
 * followed up), then the notebook they shared.
 * Pick an agent to see its result and transcript.
 */
export function AgentWorkflowPanel({
  conversationId,
  subagents,
  planVersion,
}: AgentWorkflowPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading, refetch } = useAgentsControllerGetConversationWorkflow(
    conversationId,
    { query: { refetchOnWindowFocus: false } },
  );

  // The stream tells us when something moved: refetch then, not on a timer
  const streamVersion = useMemo(
    () =>
      `${planVersion}|${subagents.map((s) => `${s.id}:${s.status}`).join(',')}`,
    [planVersion, subagents],
  );
  useEffect(() => {
    void refetch();
  }, [streamVersion, refetch]);

  const layout = useMemo(
    () => (data ? buildWorkflowLayout(data, selectedId) : null),
    [data, selectedId],
  );
  const selected = data?.nodes.find((n) => n.id === selectedId);
  const toggle = (id: string) => setSelectedId((cur) => (cur === id ? null : id));
  const height = useMemo(() => {
    const bottom = layout?.nodes.reduce(
      (max, n) => Math.max(max, n.position.y + WORKFLOW_NODE_HEIGHT),
      0,
    );
    // Drawn at well under half size in the side panel
    return Math.min(Math.max((bottom ?? 0) * 0.45 + 48, 200), 420);
  }, [layout]);

  if (isLoading || !data || !layout) {
    return <Skeleton className="h-64 w-full" />;
  }

  const detail = selected && (
    <NodeDetail
      node={selected}
      nodes={data.nodes}
      subagent={subagents.find((s) => s.id === selected.id)}
      conversationId={conversationId}
    />
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <EdgeLegend />
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-6 shrink-0 gap-1 text-muted-foreground hover:cursor-pointer"
          onClick={() => setExpanded(true)}
        >
          <Maximize2 className="size-3" />
          Expand
        </Button>
      </div>
      <div
        className="overflow-hidden rounded-lg border bg-background"
        style={{ height }}
        data-testid="agent-workflow-graph"
      >
        <WorkflowCanvas layout={layout} onSelect={toggle} />
      </div>

      {detail}

      <SidePanelSection
        title="Notebook"
        meta={data.notes.length > 0 ? data.notes.length : undefined}
      >
        {data.notes.length > 0 ? (
          <ul className="space-y-0.5">
            {data.notes.map((n) => (
              <NoteRow key={n.id} note={n} />
            ))}
          </ul>
        ) : (
          <p className="px-2 text-sm text-muted-foreground">
            Facts, decisions and open questions the agents share show up here.
          </p>
        )}
      </SidePanelSection>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="flex h-[85vh] max-w-[95vw] flex-col gap-3 sm:max-w-[95vw]">
          <DialogHeader>
            <DialogTitle>Workflow</DialogTitle>
            <DialogDescription className="line-clamp-1">
              {data.goal ?? 'How the subagents of this conversation connect'}
            </DialogDescription>
          </DialogHeader>
          <EdgeLegend />
          <div className="flex min-h-0 flex-1 gap-4">
            <div className="min-w-0 flex-1 overflow-hidden rounded-lg border bg-background">
              <WorkflowCanvas layout={layout} onSelect={toggle} expanded />
            </div>
            {detail && (
              <div className="w-96 shrink-0 overflow-y-auto">{detail}</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
