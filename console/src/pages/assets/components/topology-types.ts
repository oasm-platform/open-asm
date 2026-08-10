import { Graph, layout } from '@dagrejs/dagre';

/** Framework-agnostic node shape matching the API DTO. */
export type TopologyNodeData = {
  label: string;
  metadata?: Record<string, unknown>;
};

/** Edge data shape from the API. */
export type TopologyEdgeData = {
  type?: string;
  label?: string;
};

/** All node types present in the topology graph. */
export type NodeType =
  | 'target'
  | 'asset'
  | 'ip'
  | 'service'
  | 'technology'
  | 'tls'
  | 'statusCode';

/** Distinct hex color for each node type (border / icon tint). */
export const NODE_TYPE_COLORS: Record<NodeType, string> = {
  target: '#3b82f6',
  asset: '#22c55e',
  ip: '#a855f7',
  service: '#f97316',
  technology: '#14b8a6',
  tls: '#eab308',
  statusCode: '#ef4444',
};

/** Lucide-react icon name for each node type. */
export const NODE_TYPE_ICONS: Record<NodeType, string> = {
  target: 'Globe',
  asset: 'Monitor',
  ip: 'Server',
  service: 'Plug',
  technology: 'Code',
  tls: 'Lock',
  statusCode: 'Hash',
};

/** Input node extending TopologyNodeData with id and type for layout. */
export type LayoutInputNode = {
  id: string;
  type: NodeType;
  data: TopologyNodeData;
};

/** Input edge from the API. */
export type LayoutInputEdge = {
  source: string;
  target: string;
  data?: TopologyEdgeData;
};

/** Output node positioned by dagre, compatible with React Flow. */
export type LayoutOutputNode = {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: TopologyNodeData;
};

/** Output edge compatible with React Flow. */
export type LayoutOutputEdge = {
  id: string;
  source: string;
  target: string;
  data?: TopologyEdgeData;
};

/** Result of the dagre layout pass. */
export type LayoutResult = {
  nodes: LayoutOutputNode[];
  edges: LayoutOutputEdge[];
};

/**
 * Compute a non-overlapping dagre layout for a topology graph.
 *
 * Nodes are deduplicated by id. Edges are deduplicated by (source, target)
 * pair before being passed to the layout engine.
 */
export function applyDagreLayout(
  graphData: { nodes: LayoutInputNode[]; edges: LayoutInputEdge[] },
  direction: 'TB' | 'LR' = 'TB',
): LayoutResult {
  const g = new Graph({ multigraph: false, compound: false })
    .setGraph({
      rankdir: direction,
      nodesep: 50,
      ranksep: 80,
    })
    .setDefaultEdgeLabel(() => ({}));

  // Add nodes — deduplicate by id
  const seenNodeIds = new Set<string>();
  for (const node of graphData.nodes) {
    if (seenNodeIds.has(node.id)) continue;
    seenNodeIds.add(node.id);
    g.setNode(node.id, { width: 180, height: 40 });
  }

  // Add edges — deduplicate by (source, target)
  const seenEdgeKeys = new Set<string>();
  for (const edge of graphData.edges) {
    const key = `${edge.source}->${edge.target}`;
    if (seenEdgeKeys.has(key)) continue;
    seenEdgeKeys.add(key);
    // Only add if both endpoints exist in the graph
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }

  // Run layout
  layout(g);

  // Collect positioned nodes
  const positionedNodes: LayoutOutputNode[] = [];
  for (const node of graphData.nodes) {
    const dagreNode = g.node(node.id);
    if (dagreNode) {
      positionedNodes.push({
        id: node.id,
        type: node.type,
        position: { x: dagreNode.x, y: dagreNode.y },
        data: node.data,
      });
    }
  }

  // Collect positioned edges
  const positionedEdges: LayoutOutputEdge[] = [];
  const dedupedEdgeKeys = new Set<string>();
  for (const edge of graphData.edges) {
    const key = `${edge.source}->${edge.target}`;
    if (dedupedEdgeKeys.has(key)) continue;
    dedupedEdgeKeys.add(key);
    if (g.hasEdge(edge.source, edge.target)) {
      positionedEdges.push({
        id: `e-${edge.source}-${edge.target}`,
        source: edge.source,
        target: edge.target,
        data: edge.data,
      });
    }
  }

  return { nodes: positionedNodes, edges: positionedEdges };
}
