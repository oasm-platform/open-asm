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
  useOnViewportChange,
  ReactFlowProvider,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Clock, Focus, Lock, LockOpen, RefreshCw } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useTheme } from '@/components/ui/theme-provider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import NoData from '@/components/ui/no-data';
import { toast } from 'sonner';
import { TargetFilter } from '@/pages/vulnerabilities/components/target-filter';
import {
  assetsControllerGetAssetServiceGraph,
  useAssetsControllerGetAssetGraph,
  type AssetGraphResponseDto,
} from '@/services/apis/gen/queries';
import {
  applyForceLayout,
  CLUSTER_COLORS,
  NODE_TYPE_COLORS,
  type LayoutInputNode,
  type LayoutInputEdge,
  type LayoutResult,
  type GraphNodeData,
} from './graph-types';
import { GraphNodeComponent, resolveNodeType } from './graph-node';
import { GraphLegend } from './graph-legend';
import { GraphNodeSearch } from './graph-node-search';
import AssetDetailSheet from './asset-detail-sheet';
import GraphDetailSheet from './graph-detail-sheet';

dayjs.extend(relativeTime);

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

/**
 * Per-edge-type visual overrides on top of the shared default (straight,
 * source cluster color, 1.2px, 55% opacity).
 *
 * - belongs_to / resolves_to: thin straight structure edges.
 * - runs_on / uses: straight.
 * - has_tls: dashed (thin, straight).
 * - returns: dashed + animated dash-offset (CSS `graph-dash` on the
 *   `graph-edge-returns` class); the stroke turns alert-red when the target
 *   status code is >= 400 (computed in the view from the statusCode node).
 */
const EDGE_TYPE_STYLES: Record<
  string,
  {
    type?: 'smoothstep' | 'bezier' | 'straight';
    strokeWidth?: number;
    opacity?: number;
    strokeDasharray?: string;
  }
> = {
  belongs_to: { type: 'straight', strokeWidth: 1.2, opacity: 0.55 },
  resolves_to: { type: 'straight', strokeWidth: 1.2, opacity: 0.55 },
  runs_on: { type: 'straight', strokeWidth: 1.4, opacity: 0.65 },
  uses: { type: 'straight', strokeWidth: 1.4, opacity: 0.65 },
  has_tls: { type: 'straight', strokeWidth: 1.2, opacity: 0.6, strokeDasharray: '4 4' },
  returns: { type: 'straight', strokeWidth: 1.2, opacity: 0.5, strokeDasharray: '6 4' },
};

/** Zoom below which node labels are hidden and glows are disabled (LOD). */
const LABEL_LOD_ZOOM = 0.5;

/**
 * Build the React Flow edges with per-type styling. `returns` edges are
 * animated (class `graph-edge-returns`, CSS dash animation) and turn
 * alert-red when the target status code is >= 400.
 */
function buildRfEdges(
  inputEdges: LayoutInputEdge[],
  colorById: Map<string, string>,
): Edge[] {
  return inputEdges.map((e) => {
    const typeOverrides = EDGE_TYPE_STYLES[e.data?.type ?? ''] ?? {};
    const isReturns = e.data?.type === 'returns';
    return {
      id: `e-${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      sourceHandle: 's-center',
      targetHandle: 't-center',
      data: e.data,
      type: typeOverrides.type ?? 'straight',
      className: isReturns ? 'graph-edge-returns' : undefined,
      style: {
        stroke: colorById.get(e.source) ?? 'var(--color-graph-edge)',
        strokeWidth: typeOverrides.strokeWidth ?? 1.2,
        opacity: typeOverrides.opacity ?? 0.55,
        ...(typeOverrides.strokeDasharray
          ? { strokeDasharray: typeOverrides.strokeDasharray }
          : {}),
      },
    };
  });
}

function AssetGraphInner({ targetId }: AssetGraphProps) {
  const { fitView } = useReactFlow();
  const { resolvedTheme } = useTheme();
  const reducedMotion = useReducedMotion() === true;

  const [filterTargetId, setFilterTargetId] = useState<string | undefined>(
    targetId,
  );
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [layoutLocked, setLayoutLocked] = useState(false);

  // Domain nodes expand their child services on click: the per-asset
  // endpoint result is merged into the layout until toggled off again.
  const [expandedServices, setExpandedServices] = useState<
    Map<string, AssetGraphResponseDto>
  >(new Map());
  const expandedIdsRef = useRef<Set<string>>(new Set());
  // Assets whose expansion is still wanted (guards the async fetch: a
  // collapse or filter change during the request must not be undone by it).
  const pendingExpansionsRef = useRef<Set<string>>(new Set());
  const toggleAssetServices = useCallback(async (assetId: string) => {
    if (expandedIdsRef.current.has(assetId)) {
      expandedIdsRef.current.delete(assetId);
      pendingExpansionsRef.current.delete(assetId);
      setExpandedServices((prev) => {
        const next = new Map(prev);
        next.delete(assetId);
        return next;
      });
      return;
    }
    // Collapse while a fetch is in flight: mark not-wanted so the pending
    // response does not re-expand. Also ignores duplicate expansion clicks.
    if (pendingExpansionsRef.current.has(assetId)) return;
    pendingExpansionsRef.current.add(assetId);
    try {
      const data = await assetsControllerGetAssetServiceGraph(assetId);
      if (data.nodes.length === 0) {
        toast.info('No services found for this domain');
        return;
      }
      if (!pendingExpansionsRef.current.has(assetId)) return;
      pendingExpansionsRef.current.delete(assetId);
      expandedIdsRef.current.add(assetId);
      setExpandedServices((prev) => {
        const next = new Map(prev);
        next.set(assetId, data);
        return next;
      });
    } catch {
      toast.error('Failed to load services for this domain');
    }
  }, []);

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
  // Service nodes open the reusable service detail sheet (same one the
  // Services tab uses) — keyed by the raw service id.
  const [serviceDetailId, setServiceDetailId] = useState<string | null>(null);
  // Legend overlay toggle; legend data derives from rendered target nodes.
  const [showLegend, setShowLegend] = useState(false);

  // Mirrors the current React Flow node positions so applyLayout can preserve
  // them across refetches without depending on the `nodes` state directly (a
  // state dep would recreate the callback on every drag).
  const nodesRef = useRef<Node[]>([]);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // Live zoom + reduced-motion, read by applyLayout and the LOD effect via
  // refs so layout never needs to re-run when they change.
  const zoomRef = useRef(1);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  const reducedMotionRef = useRef(false);
  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);

  // Position-preserving merge is skipped for explicit re-layouts (layout mode
  // switch, `r` key), so those actually move nodes.
  const preservePositionsRef = useRef(true);
  const forceRecomputeRef = useRef(false);

  useOnViewportChange({
    onChange: useCallback((viewport: { zoom: number }) => {
      setZoom(viewport.zoom);
    }, []),
  });

  const openDetailForNode = useCallback((nodeId: string) => {
    const node = nodesRef.current.find((n) => n.id === nodeId);
    if (!node) return;
    // Domain (asset) nodes expand their services, same as a mouse click.
    if (node.type === 'asset') {
      const assetId = node.id.split('|')[1];
      if (assetId) void toggleAssetServices(assetId);
      return;
    }
    if (node.type === 'service') {
      const serviceId = node.id.split('|')[1];
      if (serviceId) setServiceDetailId(serviceId);
      return;
    }
    setSelectedNode(node as unknown as SelectedGraphNode);
  }, [toggleAssetServices]);

  const applyLayout = useCallback(() => {
    if (!graphData) return;

    // Only domain nodes render: target (root domain), asset (domain/subdomain)
    // and ip. Service/technology/tls/statusCode satellites stay hidden.
    const visibleNodeTypes = new Set(['target', 'asset', 'ip']);
    const inputNodes: LayoutInputNode[] = graphData.nodes
      .filter((n) => visibleNodeTypes.has(n.type))
      .map((n) => {
        const raw = n.data as Record<string, unknown> | undefined;
        const metadata = raw?.metadata as Record<string, unknown> | undefined;
        return {
          id: n.id,
          type: n.type as LayoutInputNode['type'],
          data: {
            label: (raw?.label as string) ?? n.id,
            metadata,
            alert: raw?.alert === true,
            lastScannedAt:
              typeof metadata?.lastScannedAt === 'string'
                ? metadata.lastScannedAt
                : undefined,
          },
        };
      });

    // Expanded domain services (fetched on click) merge into the layout
    // exactly like graph payload nodes; their runs_on edges are kept too.
    const expandedNodes: LayoutInputNode[] = [];
    const expandedEdges: LayoutInputEdge[] = [];
    for (const svc of expandedServices.values()) {
      for (const n of svc.nodes) {
        if (n.type !== 'service') continue;
        const md = n.data.metadata as Record<string, unknown> | undefined;
        expandedNodes.push({
          id: n.id,
          type: 'service',
          data: {
            label: String(n.data.label),
            metadata: md,
            alert: n.data.alert === true,
            lastScannedAt:
              typeof md?.lastScannedAt === 'string'
                ? md.lastScannedAt
                : undefined,
          },
        });
      }
      for (const e of svc.edges) {
        expandedEdges.push({
          source: e.source,
          target: e.target,
          data: e.type ? { type: e.type, label: e.label } : undefined,
        });
      }
    }
    const mergedNodes: LayoutInputNode[] = [...inputNodes, ...expandedNodes];

    // Only edges between visible nodes render (belongs_to target→asset,
    // resolves_to asset→ip); the rest are dropped as dangling.
    const visibleNodeIds = new Set(mergedNodes.map((n) => n.id));
    const baseEdges: LayoutInputEdge[] = graphData.edges
      .filter(
        (e): e is typeof e & { type: string } =>
          !!e.type &&
          visibleNodeIds.has(e.source) &&
          visibleNodeIds.has(e.target),
      )
      .map((e) => ({
        source: e.source,
        target: e.target,
        data:
          e.type || e.label ? { type: e.type, label: e.label } : undefined,
      }));
    const inputEdges: LayoutInputEdge[] = [...baseEdges, ...expandedEdges];

    // ── Severity: derived directly from the latest http status code the
    // backend exposes on each service node's metadata (5xx = danger,
    // 4xx = warn). No statusCode satellite nodes flow through the layout.
    const severityByService = new Map<string, 'warn' | 'danger'>();
    for (const node of mergedNodes) {
      if (node.type !== 'service') continue;
      const code = node.data.metadata?.statusCode;
      if (typeof code === 'number' && code >= 500) {
        severityByService.set(node.id, 'danger');
      } else if (typeof code === 'number' && code >= 400) {
        severityByService.set(node.id, 'warn');
      }
    }

    // ── Layout: force-directed always. Positions are merged per node id:
    // nodes already on canvas keep their position across polls (user
    // pan/zoom/drags survive refetches); only genuinely new nodes take the
    // freshly computed position. When the layout is locked, the engine is
    // skipped entirely unless new nodes (or an explicit re-layout) require
    // positions.
    const prevPositions = new Map(
      preservePositionsRef.current
        ? nodesRef.current.map((n) => [n.id, n.position])
        : [],
    );
    preservePositionsRef.current = true;

    const hasNewNodes = mergedNodes.some((n) => !prevPositions.has(n.id));
    const shouldRunLayout =
      !layoutLocked || hasNewNodes || forceRecomputeRef.current;
    let layoutResult: LayoutResult | null = null;
    if (shouldRunLayout) {
      layoutResult = applyForceLayout({ nodes: mergedNodes, edges: inputEdges });
      forceRecomputeRef.current = false;
    }
    const layoutPositionById = new Map(
      (layoutResult?.nodes ?? []).map((n) => [n.id, n.position]),
    );

    // ── Node colors: each target gets its own pastel palette color, each IP
    // a distinct golden-angle hue, and the rest of every domain family
    // (asset → service → technology/tls/statusCode) inherits its target's
    // color through the ownership edges, so a shared IP no longer merges
    // distinct targets into one color. Deterministic and stable across the
    // 30s polls because the API sorts nodes and edges by id. Shared leaves
    // (e.g. one technology used by several targets) take the first owning
    // service's color.
    const colorById = new Map<string, string>();
    {
      let targetIndex = 0;
      for (const node of mergedNodes) {
        if (node.type !== 'target') continue;
        colorById.set(
          node.id,
          CLUSTER_COLORS[targetIndex % CLUSTER_COLORS.length],
        );
        targetIndex += 1;
      }
    }
    // Propagate each target color down the ownership spine. IPs are skipped
    // here — they are shared leaves and get their own colors below.
    const colorInheritanceEdgeTypes = [
      'belongs_to',
      'runs_on',
      'uses',
      'has_tls',
      'returns',
    ];
    for (const edgeType of colorInheritanceEdgeTypes) {
      for (const edge of inputEdges) {
        if (edge.data?.type !== edgeType) continue;
        const color = colorById.get(edge.source);
        if (!color || colorById.has(edge.target)) continue;
        colorById.set(edge.target, color);
      }
    }
    // IPs: one saturated hue per address (golden-angle spacing across the
    // hue wheel), visually distinct from each other and from the pastel
    // target palette.
    let ipIndex = 0;
    for (const node of mergedNodes) {
      if (node.type !== 'ip') continue;
      const hue = Math.round((ipIndex * 137.508) % 360);
      colorById.set(node.id, `hsl(${hue} 60% 52%)`);
      ipIndex += 1;
    }

    const labelVisible = zoomRef.current >= LABEL_LOD_ZOOM;
    const glowEnabled = !reducedMotionRef.current && labelVisible;

    // Expanded services hug their domain: pin each one on a small ring around
    // the owning asset's current position instead of letting FR scatter them
    // far from the node that was clicked.
    const serviceRingById = new Map<string, { x: number; y: number }>();
    {
      const ringRadius = 130;
      const angleStep = 2.399963229728653; // golden angle
      const ringIndexByAsset = new Map<string, number>();
      for (const edge of expandedEdges) {
        if (edge.data?.type !== 'runs_on') continue;
        const assetPos =
          prevPositions.get(edge.source) ??
          layoutPositionById.get(edge.source);
        if (!assetPos) continue;
        const idx = ringIndexByAsset.get(edge.source) ?? 0;
        ringIndexByAsset.set(edge.source, idx + 1);
        const angle = idx * angleStep;
        serviceRingById.set(edge.target, {
          x: assetPos.x + Math.cos(angle) * ringRadius,
          y: assetPos.y + Math.sin(angle) * ringRadius,
        });
      }
    }

    const rfNodes: Node[] = mergedNodes.map((node, index) => {
      const previous = prevPositions.get(node.id);
      const fresh = layoutPositionById.get(node.id);
      return {
        id: node.id,
        type: node.type,
        position:
          // The ring positions freshly-expanded services around their
          // domain; once a node has been on canvas (or dragged) its own
          // preserved position wins over the ring.
          previous ??
          serviceRingById.get(node.id) ??
          fresh ??
          { x: 0, y: index * 24 },
        data: {
          ...node.data,
          clusterColor: colorById.get(node.id),
          alert: node.data.alert === true,
          severity:
            node.type === 'service' ? severityByService.get(node.id) : undefined,
          labelVisible,
          glow:
            glowEnabled &&
            node.data.alert === true &&
            severityByService.get(node.id) === 'danger',
          staggerIndex: index,
          onOpenDetail: openDetailForNode,
        },
      };
    });

    // ── Edge rendering: per-type defaults + animated alert `returns` edges.
    const rfEdges: Edge[] = buildRfEdges(inputEdges, colorById);

    setNodes(rfNodes);
    setEdges(rfEdges);
  }, [graphData, layoutLocked, openDetailForNode, expandedServices, setNodes, setEdges]);

  useEffect(() => {
    applyLayout();
  }, [applyLayout]);

  // ── Viewport fitting ──────────────────────────────────────────────────
  // fitView runs on first data arrival and whenever the target filter
  // changes — NOT on periodic refetches, so the user's pan/zoom survives the
  // 30s polls. Explicit user actions (f key, r key, double-click zoom,
  // Reset View) call fitView directly below.
  const fitRequestedRef = useRef(true);

  useEffect(() => {
    fitRequestedRef.current = true;
    // A different target means a different asset set: drop any expanded
    // domain services so no orphaned service nodes survive the switch.
    expandedIdsRef.current.clear();
    pendingExpansionsRef.current.clear();
    setExpandedServices(new Map());
  }, [filterTargetId]);

  useEffect(() => {
    if (!graphData || graphData.nodes.length === 0) return;
    if (!fitRequestedRef.current) return;
    fitRequestedRef.current = false;
    requestAnimationFrame(() => {
      fitView({ padding: 0.25 });
    });
  }, [graphData, fitView]);

  // ── LOD: labels hidden / glows disabled below zoom 0.5. Only touches node
  // data flags — never re-runs layout. Guarded so the node array only
  // changes when a flag actually flips.
  useEffect(() => {
    const labelVisible = zoom >= LABEL_LOD_ZOOM;
    const glowEnabled = !reducedMotion && labelVisible;
    let changed = false;
    const next = nodesRef.current.map((n) => {
      const data = n.data as GraphNodeData;
      const glow =
        glowEnabled && data.alert === true && data.severity === 'danger';
      if (data.glow === glow && data.labelVisible === labelVisible) return n;
      changed = true;
      return { ...n, data: { ...data, glow, labelVisible } };
    });
    if (changed) setNodes(next);
  }, [zoom, reducedMotion, setNodes]);

  // ── Hover dim (1-hop): dims non-connected nodes on hover.
  const connectedNodeIds = useMemo(() => {
    if (!hoveredNodeId) return null;
    const ids = new Set<string>([hoveredNodeId]);
    for (const edge of edges) {
      if (edge.source === hoveredNodeId) ids.add(edge.target);
      if (edge.target === hoveredNodeId) ids.add(edge.source);
    }
    return ids;
  }, [hoveredNodeId, edges]);

  // ── Selection dim: dims everything not connected to the selected node.
  // Hover takes precedence when both are active (focus follows the pointer).
  const selectedConnectedIds = useMemo(() => {
    if (!selectedNodeId) return null;
    const ids = new Set<string>([selectedNodeId]);
    for (const edge of edges) {
      if (edge.source === selectedNodeId) ids.add(edge.target);
      if (edge.target === selectedNodeId) ids.add(edge.source);
    }
    return ids;
  }, [selectedNodeId, edges]);

  const displayNodes = useMemo(() => {
    const focusSet = connectedNodeIds ?? selectedConnectedIds;
    if (!focusSet) return nodes;
    const dimClass = connectedNodeIds
      ? 'opacity-40 transition-opacity'
      : 'opacity-35 transition-opacity';
    return nodes.map((n) => ({
      ...n,
      className: focusSet.has(n.id) ? '' : dimClass,
    }));
  }, [nodes, connectedNodeIds, selectedConnectedIds]);

  const displayEdges = useMemo(() => {
    const focusId = hoveredNodeId ?? selectedNodeId;
    if (!focusId) return edges;
    return edges.map((e) => {
      const baseOpacity =
        (e.style as { opacity?: number } | undefined)?.opacity ?? 0.55;
      return {
        ...e,
        style: {
          ...e.style,
          opacity:
            e.source === focusId || e.target === focusId
              ? baseOpacity
              : 0.12,
        },
      };
    });
  }, [edges, hoveredNodeId, selectedNodeId]);

  const hoveredEdgeLabel = useMemo(() => {
    if (!hoveredEdgeId) return null;
    const edge = edges.find((e) => e.id === hoveredEdgeId);
    if (!edge) return null;
    const rawType = (edge.data as Record<string, unknown> | undefined)
      ?.type as string | undefined;
    if (!rawType) return null;
    return EDGE_TYPE_LABELS[rawType] ?? rawType;
  }, [hoveredEdgeId, edges]);

  // ── Freshness chip: relative time of the most recent scan among service
  // nodes. Hidden when no service carries lastScannedAt.
  const freshnessLabel = useMemo(() => {
    let latest: number | null = null;
    for (const n of graphData?.nodes ?? []) {
      const raw = n.data as Record<string, unknown> | undefined;
      const metadata = raw?.metadata as Record<string, unknown> | undefined;
      const scannedAt = metadata?.lastScannedAt;
      if (typeof scannedAt !== 'string') continue;
      const ts = new Date(scannedAt).getTime();
      if (Number.isFinite(ts) && (latest === null || ts > latest)) latest = ts;
    }
    if (latest === null) return null;
    return `Last scanned ${dayjs(latest).fromNow()}`;
  }, [graphData]);

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
      forceRecomputeRef.current = true;
      preservePositionsRef.current = false;
      applyLayout();
      // Double rAF: first frame commits the new node positions to React
      // Flow, second frame fits the view to those fresh bounds. A single
      // rAF reads stale positions and lands the graph off-center.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          fitView({ duration: 500 });
        });
      });
    }
    rPrevRef.current = rPressed;
  }, [rPressed, applyLayout, fitView]);

  const escPressed = useKeyPress('Escape');
  const escPrevRef = useRef(false);
  useEffect(() => {
    if (escPressed && !escPrevRef.current) {
      setSelectedNode(null);
      setSelectedNodeId(null);
    }
    escPrevRef.current = escPressed;
  }, [escPressed]);

  const handleNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      fitView({ nodes: [{ id: node.id }], duration: 500, padding: 2 });
    },
    [fitView],
  );

  const miniMapNodeColor = useCallback(
    (node: Node) => NODE_TYPE_COLORS[resolveNodeType(node.id)] ?? '#94a3b8',
    [],
  );

  // Legend target swatches: from the rendered target nodes' injected color.
  const legendTargets = useMemo(() => {
    const targets: Array<{ label: string; color: string }> = [];
    for (const n of nodes) {
      if (n.type !== 'target') continue;
      const data = n.data as GraphNodeData;
      if (data.clusterColor) {
        targets.push({ label: data.label, color: data.clusterColor });
      }
    }
    return targets;
  }, [nodes]);

  // Node search: zoom straight to the picked node (same as double-click).
  const handleNodeSearchSelect = useCallback(
    (nodeId: string) => {
      fitView({ nodes: [{ id: nodeId }], duration: 500, padding: 2 });
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
      <div className="flex items-center justify-start gap-2">
        {!targetId && (
          <TargetFilter
            value={filterTargetId}
            onValueChange={setFilterTargetId}
          />
        )}
        <GraphNodeSearch nodes={nodes} onSelect={handleNodeSearchSelect} />
        <Button
          variant="outline"
          size="sm"
          className="border-dashed"
          onClick={() => setShowLegend((v) => !v)}
          aria-pressed={showLegend}
        >
          Legend
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="border-dashed"
          onClick={() => setLayoutLocked((locked) => !locked)}
          aria-pressed={layoutLocked}
          title={
            layoutLocked
              ? 'Layout positions are frozen on refresh'
              : 'Freeze node positions on refresh'
          }
        >
          {layoutLocked ? (
            <Lock className="mr-1.5 size-3.5" />
          ) : (
            <LockOpen className="mr-1.5 size-3.5" />
          )}
          {layoutLocked ? 'Locked' : 'Lock'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="border-dashed"
          onClick={() => fitView({ duration: 500 })}
        >
          <Focus className="mr-1.5 size-3.5" />
          Reset View
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="border-dashed"
          onClick={() => void refetch()}
        >
          <RefreshCw className="mr-1.5 size-3.5" />
          Refresh
        </Button>
      </div>
      <div
        className="relative h-[calc(100vh-8rem)] w-full rounded-md border"
        role="application"
        aria-label="Asset graph canvas"
      >
        {isFetching && !isLoading && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/60">
            <Spinner className="size-6" />
          </div>
        )}

        {showLegend && (
          <div className="absolute right-2 top-2 z-10">
            <GraphLegend targets={legendTargets} />
          </div>
        )}

        {hoveredEdgeLabel && (
          <div className="pointer-events-none absolute right-2 top-2 z-10 rounded-md border bg-popover px-2.5 py-1 text-xs font-medium shadow-md">
            {hoveredEdgeLabel}
          </div>
        )}

        {freshnessLabel && (
          <div className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-1.5 rounded-md border bg-popover/90 px-2.5 py-1 text-xs font-medium shadow-md">
            <Clock className="size-3 text-muted-foreground" />
            {freshnessLabel}
          </div>
        )}

        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={(_, node) => {
            // Domain (asset) nodes toggle their child services instead of
            // opening the detail sheet.
            if (node.type === 'asset') {
              const assetId = node.id.split('|')[1];
              if (assetId) void toggleAssetServices(assetId);
              return;
            }
            if (node.type === 'service') {
              const serviceId = node.id.split('|')[1];
              if (serviceId) setServiceDetailId(serviceId);
              return;
            }
            setSelectedNode(node as unknown as SelectedGraphNode);
            setSelectedNodeId(node.id);
          }}
          onNodeMouseEnter={(_, node) => setHoveredNodeId(node.id)}
          onNodeMouseLeave={() => setHoveredNodeId(null)}
          onNodeDoubleClick={handleNodeDoubleClick}
          onEdgeMouseEnter={(_, edge) => setHoveredEdgeId(edge.id)}
          onEdgeMouseLeave={() => setHoveredEdgeId(null)}
          onPaneClick={() => {
            setSelectedNode(null);
            setSelectedNodeId(null);
          }}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          minZoom={0.1}
          maxZoom={4}
          proOptions={{ hideAttribution: true }}
          colorMode={resolvedTheme}
          nodesFocusable={false}
          onlyRenderVisibleElements={displayNodes.length > 500}
        >
          <Background color="var(--color-graph-edge)" bgColor="var(--color-graph-canvas)" />
          <Controls />
          {displayNodes.length >= 200 && (
            <MiniMap
              pannable
              zoomable
              nodeColor={miniMapNodeColor}
              nodeStrokeWidth={0}
            />
          )}
        </ReactFlow>
      </div>
      <GraphDetailSheet
        open={!!selectedNode}
        setOpen={(o) => {
          if (!o) setSelectedNode(null);
        }}
        node={selectedNode}
      />
      <AssetDetailSheet
        open={!!serviceDetailId}
        setOpen={(o) => {
          if (!o) setServiceDetailId(null);
        }}
        id={serviceDetailId ?? ''}
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
