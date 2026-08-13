import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useKeyPress,
  ReactFlowProvider,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Focus, RefreshCw } from 'lucide-react';
import { useTheme } from '@/components/ui/theme-provider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import NoData from '@/components/ui/no-data';
import {
  useAssetsControllerGetAssetGraph,
  useTargetsControllerGetTargetsInWorkspace,
} from '@/services/apis/gen/queries';
import {
  applyForceLayout,
  CLUSTER_COLORS,
  type LayoutInputNode,
  type LayoutInputEdge,
  type GraphNodeData,
} from './graph-types';
import { GraphNodeComponent } from './graph-node';
import GraphDetailSheet from './graph-detail-sheet';

const nodeTypes = {
  target: GraphNodeComponent,
  asset: GraphNodeComponent,
  ip: GraphNodeComponent,
  service: GraphNodeComponent,
  technology: GraphNodeComponent,
  tls: GraphNodeComponent,
  statusCode: GraphNodeComponent,
};

interface SelectedGraphNode {
  id: string;
  type: string;
  data: GraphNodeData;
}

interface AssetGraphProps {
  targetId?: string;
}

const EDGE_TYPE_LABELS: Record<string, string> = {
  belongs_to: 'Belongs to',
  resolves_to: 'Resolves to',
  runs_on: 'Runs on',
  uses: 'Uses',
  has_tls: 'Has TLS',
  returns: 'Returns',
};

function AssetGraphInner({ targetId }: AssetGraphProps) {
  const { fitView } = useReactFlow();
  const { resolvedTheme } = useTheme();

  const [filterTargetId, setFilterTargetId] = useState<string | undefined>(
    targetId,
  );
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

  const { data: targetsData } = useTargetsControllerGetTargetsInWorkspace({
    limit: 100,
  });

  const targets = useMemo(() => targetsData?.data ?? [], [targetsData?.data]);

  const params = useMemo(
    () => (filterTargetId ? { targetId: filterTargetId } : undefined),
    [filterTargetId],
  );

  const {
    data: graphData,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useAssetsControllerGetAssetGraph(params, {
    query: {
      refetchInterval: 30_000,
    },
  });

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<SelectedGraphNode | null>(
    null,
  );

  const applyLayout = useCallback(() => {
    if (!graphData) return;

    // Scope to IP↔domain mapping only: target/asset/ip nodes. belongs_to
    // stays in the layout so each target's domains form one cohesive block;
    // only resolves_to edges are ever rendered (wires go through IPs).
    const visibleNodeTypes = new Set(['target', 'asset', 'ip']);
    const visibleEdgeTypes = new Set(['belongs_to', 'resolves_to']);

    const inputNodes: LayoutInputNode[] = graphData.nodes
      .filter((n) => visibleNodeTypes.has(n.type))
      .map((n) => ({
        id: n.id,
        type: n.type as LayoutInputNode['type'],
        data: {
          label:
            ((n.data as Record<string, unknown>)?.label as string) ?? n.id,
          metadata: (n.data as Record<string, unknown>)
            ?.metadata as Record<string, unknown> | undefined,
        },
      }));

    const inputEdges: LayoutInputEdge[] = graphData.edges
      .filter(
        (e): e is typeof e & { type: string } =>
          !!e.type && visibleEdgeTypes.has(e.type),
      )
      .map((e) => ({
        source: e.source,
        target: e.target,
        data:
          e.type || e.label ? { type: e.type, label: e.label } : undefined,
      }));

    const result = applyForceLayout({ nodes: inputNodes, edges: inputEdges });

    // ── Cluster colors: one palette color per connected component, seeded
    // from target nodes so each domain family renders as its own community.
    // Computed over the visible mapping edges only.
    const colorById = new Map<string, string>();
    const adjacency = new Map<string, string[]>();
    for (const e of inputEdges) {
      const fromSource = adjacency.get(e.source) ?? [];
      fromSource.push(e.target);
      adjacency.set(e.source, fromSource);
      const fromTarget = adjacency.get(e.target) ?? [];
      fromTarget.push(e.source);
      adjacency.set(e.target, fromTarget);
    }
    const paintComponent = (startId: string, color: string) => {
      if (colorById.has(startId)) return;
      const queue = [startId];
      while (queue.length > 0) {
        const id = queue.pop()!;
        if (colorById.has(id)) continue;
        colorById.set(id, color);
        for (const neighbor of adjacency.get(id) ?? []) {
          if (!colorById.has(neighbor)) queue.push(neighbor);
        }
      }
    };
    let clusterIndex = 0;
    for (const node of inputNodes) {
      if (node.type !== 'target') continue;
      paintComponent(
        node.id,
        CLUSTER_COLORS[clusterIndex % CLUSTER_COLORS.length],
      );
      clusterIndex += 1;
    }
    for (const node of inputNodes) {
      if (!colorById.has(node.id)) {
        paintComponent(
          node.id,
          CLUSTER_COLORS[clusterIndex % CLUSTER_COLORS.length],
        );
        clusterIndex += 1;
      }
    }

    // ── Alert dots: services that return 4xx/5xx status codes.
    const alertIds = new Set<string>();
    for (const e of graphData.edges) {
      const [prefix, codeRaw] = e.target.split('|');
      if (prefix === 'statusCode' && Number(codeRaw) >= 400) {
        alertIds.add(e.source);
      }
    }

    const rfNodes: Node[] = result.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: {
        ...n.data,
        clusterColor: colorById.get(n.id),
        alert: alertIds.has(n.id),
      },
    }));

    // Only draw IP↔domain wires. belongs_to edges still drive layout so each
    // target's domains stay grouped, but they are not rendered — the only
    // visible connections are the ones that go through an IP address.
    const rfEdges: Edge[] = result.edges
      .filter((e) => e.data?.type === 'resolves_to')
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        data: e.data,
        style: {
          stroke: colorById.get(e.source) ?? '#94a3b8',
          strokeWidth: 1.2,
          opacity: 0.55,
        },
      }));

    setNodes(rfNodes);
    setEdges(rfEdges);

    requestAnimationFrame(() => {
      fitView({ padding: 0.15 });
    });
  }, [graphData, setNodes, setEdges, fitView]);

  useEffect(() => {
    applyLayout();
  }, [applyLayout]);

  const connectedNodeIds = useMemo(() => {
    if (!hoveredNodeId) return null;
    const ids = new Set<string>([hoveredNodeId]);
    for (const edge of edges) {
      if (edge.source === hoveredNodeId) ids.add(edge.target);
      if (edge.target === hoveredNodeId) ids.add(edge.source);
    }
    return ids;
  }, [hoveredNodeId, edges]);

  const displayNodes = useMemo(() => {
    if (!connectedNodeIds) return nodes;
    return nodes.map((n) => ({
      ...n,
      className: connectedNodeIds.has(n.id)
        ? ''
        : 'opacity-40 transition-opacity',
    }));
  }, [nodes, connectedNodeIds]);

  const displayEdges = useMemo(() => {
    if (!hoveredNodeId) return edges;
    return edges.map((e) => {
      const baseOpacity =
        (e.style as { opacity?: number } | undefined)?.opacity ?? 0.55;
      return {
        ...e,
        style: {
          ...e.style,
          opacity:
            e.source === hoveredNodeId || e.target === hoveredNodeId
              ? baseOpacity
              : 0.12,
        },
      };
    });
  }, [edges, hoveredNodeId]);

  const hoveredEdgeLabel = useMemo(() => {
    if (!hoveredEdgeId) return null;
    const edge = edges.find((e) => e.id === hoveredEdgeId);
    if (!edge) return null;
    const rawType = (edge.data as Record<string, unknown> | undefined)
      ?.type as string | undefined;
    if (!rawType) return null;
    return EDGE_TYPE_LABELS[rawType] ?? rawType;
  }, [hoveredEdgeId, edges]);

  const fPressed = useKeyPress('f');
  const fPrevRef = useRef(false);
  useEffect(() => {
    if (fPressed && !fPrevRef.current) {
      fitView({ duration: 500 });
    }
    fPrevRef.current = fPressed;
  }, [fPressed, fitView]);

  const rPressed = useKeyPress('r');
  const rPrevRef = useRef(false);
  useEffect(() => {
    if (rPressed && !rPrevRef.current) {
      applyLayout();
    }
    rPrevRef.current = rPressed;
  }, [rPressed, applyLayout]);

  const escPressed = useKeyPress('Escape');
  const escPrevRef = useRef(false);
  useEffect(() => {
    if (escPressed && !escPrevRef.current) {
      setSelectedNode(null);
    }
    escPrevRef.current = escPressed;
  }, [escPressed]);

  const handleNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      fitView({ nodes: [{ id: node.id }], duration: 500, padding: 2 });
    },
    [fitView],
  );

  if (isLoading) {
    return <Skeleton className="h-[600px] w-full" />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex items-center gap-2">
          Failed to load asset graph.
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!graphData || graphData.nodes.length === 0) {
    return <NoData message="No assets found" />;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-end gap-2">
        {!targetId && (
          <Select
            value={filterTargetId ?? '__all__'}
            onValueChange={(v) =>
              setFilterTargetId(v === '__all__' ? undefined : v)
            }
          >
            <SelectTrigger size="sm" className="w-[180px]">
              <SelectValue placeholder="All Targets" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Targets</SelectItem>
              {targets.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => fitView({ duration: 500 })}
        >
          <Focus className="mr-1.5 size-3.5" />
          Reset View
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
        >
          <RefreshCw className="mr-1.5 size-3.5" />
          Refresh
        </Button>
      </div>
      <div
        className="relative h-[calc(100vh-12rem)] w-full rounded-md border"
        role="application"
        aria-label="Asset graph canvas"
      >
        {isFetching && !isLoading && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/60">
            <Spinner className="size-6" />
          </div>
        )}

        {hoveredEdgeLabel && (
          <div className="pointer-events-none absolute right-2 top-2 z-10 rounded-md border bg-popover px-2.5 py-1 text-xs font-medium shadow-md">
            {hoveredEdgeLabel}
          </div>
        )}

        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={(_, node) =>
            setSelectedNode(node as unknown as SelectedGraphNode)
          }
          onNodeMouseEnter={(_, node) => setHoveredNodeId(node.id)}
          onNodeMouseLeave={() => setHoveredNodeId(null)}
          onNodeDoubleClick={handleNodeDoubleClick}
          onEdgeMouseEnter={(_, edge) => setHoveredEdgeId(edge.id)}
          onEdgeMouseLeave={() => setHoveredEdgeId(null)}
          onPaneClick={() => setSelectedNode(null)}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          maxZoom={4}
          proOptions={{ hideAttribution: true }}
          colorMode={resolvedTheme}
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
      <GraphDetailSheet
        open={!!selectedNode}
        setOpen={(o) => {
          if (!o) setSelectedNode(null);
        }}
        node={selectedNode}
      />
    </div>
  );
}

export default function AssetGraph({ targetId }: AssetGraphProps) {
  return (
    <ReactFlowProvider>
      <AssetGraphInner targetId={targetId} />
    </ReactFlowProvider>
  );
}
