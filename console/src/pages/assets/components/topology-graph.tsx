import { useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
  applyDagreLayout,
  type LayoutInputNode,
  type LayoutInputEdge,
  type TopologyNodeData,
} from './topology-types';
import { TopologyNodeComponent } from './topology-node';
import TopologyDetailSheet from './topology-detail-sheet';

const nodeTypes = {
  target: TopologyNodeComponent,
  asset: TopologyNodeComponent,
  ip: TopologyNodeComponent,
  service: TopologyNodeComponent,
  technology: TopologyNodeComponent,
  tls: TopologyNodeComponent,
  statusCode: TopologyNodeComponent,
};

interface SelectedGraphNode {
  id: string;
  type: string;
  data: TopologyNodeData;
}

interface TopologyGraphProps {
  targetId?: string;
}

function TopologyGraphInner({ targetId }: TopologyGraphProps) {
  const { fitView } = useReactFlow();

  const [filterTargetId, setFilterTargetId] = useState<string | undefined>(
    targetId,
  );

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
    error,
    refetch,
  } = useAssetsControllerGetAssetGraph(params, {
    query: {
      refetchInterval: 30_000,
    },
  });

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<SelectedGraphNode | null>(null);

  // Apply dagre layout whenever graph data changes
  useEffect(() => {
    if (!graphData) return;

    const inputNodes: LayoutInputNode[] = graphData.nodes.map((n) => ({
      id: n.id,
      type: n.type as LayoutInputNode['type'],
      data: {
        label: (n.data as Record<string, unknown>)?.label as string ?? n.id,
        metadata: (n.data as Record<string, unknown>)?.metadata as
          | Record<string, unknown>
          | undefined,
      },
    }));

    const inputEdges: LayoutInputEdge[] = graphData.edges.map((e) => ({
      source: e.source,
      target: e.target,
    }));

    const result = applyDagreLayout(
      { nodes: inputNodes, edges: inputEdges },
      'TB',
    );

    const rfNodes: Node[] = result.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: n.data,
    }));

    const rfEdges: Edge[] = result.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
    }));

    setNodes(rfNodes);
    setEdges(rfEdges);

    // Fit view after layout settles
    requestAnimationFrame(() => {
      fitView({ padding: 0.15 });
    });
  }, [graphData, setNodes, setEdges, fitView]);

  if (isLoading) {
    return <Skeleton className="h-[600px] w-full" />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex items-center gap-2">
          Failed to load topology graph.
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
        >
          <RefreshCw className="mr-1.5 size-3.5" />
          Refresh
        </Button>
      </div>
      <div className="h-[calc(100vh-12rem)] w-full rounded-md border">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={(_, node) => setSelectedNode(node as unknown as SelectedGraphNode)}
          onPaneClick={() => setSelectedNode(null)}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
      <TopologyDetailSheet
        open={!!selectedNode}
        setOpen={(o) => { if (!o) setSelectedNode(null); }}
        node={selectedNode}
      />
    </div>
  );
}

export default function TopologyGraph({ targetId }: TopologyGraphProps) {
  return (
    <ReactFlowProvider>
      <TopologyGraphInner targetId={targetId} />
    </ReactFlowProvider>
  );
}
