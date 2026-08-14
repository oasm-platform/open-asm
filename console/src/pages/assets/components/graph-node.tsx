import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion, useReducedMotion } from 'framer-motion';
import { FileText, Flag, Globe, type LucideIcon } from 'lucide-react';
import {
  NODE_TYPE_COLORS,
  type NodeType,
  type GraphNodeData,
} from './graph-types';

/**
 * ID prefix → NodeType mapping.
 * The API uses `tech|` (not `technology|`) in composite IDs.
 */
const ID_PREFIX_MAP: Record<string, NodeType> = {
  target: 'target',
  asset: 'asset',
  ip: 'ip',
  service: 'service',
  tech: 'technology',
  tls: 'tls',
  statusCode: 'statusCode',
};

const MAX_LABEL_LENGTH = 24;

/** Censys-style recency threshold: show the orange dot past 24h. */
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/** Derive the visual node type from a composite ID like "target|<key>". */
export function resolveNodeType(nodeId: string): NodeType {
  const prefix = nodeId.split('|')[0] ?? '';
  return ID_PREFIX_MAP[prefix] ?? 'asset';
}

/** Severity ring classes applied to a service badge when it carries an alert. */
function severityRingClass(severity?: 'warn' | 'danger'): string {
  if (severity === 'warn') {
    return 'ring-2 ring-warning ring-offset-2 ring-offset-graph-canvas';
  }
  if (severity === 'danger') {
    return 'ring-2 ring-destructive ring-offset-2 ring-offset-graph-canvas';
  }
  return '';
}

/** Circular badge — used for ip / service / tls / statusCode nodes. */
function CircleBadge({
  icon: Icon,
  text,
  color,
  selected,
  severityRing,
  size = 'size-14',
}: {
  icon?: LucideIcon;
  text: string;
  color: string;
  selected: boolean;
  severityRing?: 'warn' | 'danger';
  size?: string;
}) {
  return (
    <div
      className={`flex ${size} flex-col items-center justify-center gap-0.5 overflow-hidden rounded-full text-white shadow-sm transition-shadow group-hover:shadow-md ${severityRingClass(severityRing)}`}
      style={{
        backgroundColor: color,
        ...(selected
          ? { boxShadow: `0 0 0 2px ${color}, 0 0 12px 2px ${color}66` }
          : {}),
      }}
    >
      {Icon && <Icon className="size-3.5" strokeWidth={2.4} />}
      <span
        className={`whitespace-nowrap font-bold uppercase leading-none tracking-widest ${
          text.length > 3 ? 'text-[9px]' : 'text-[11px]'
        }`}
      >
        {text}
      </span>
    </div>
  );
}

/** Rounded pill badge — used for target / asset / technology nodes. */
function PillBadge({
  icon: Icon,
  text,
  color,
  selected,
}: {
  icon?: LucideIcon;
  text?: string;
  color: string;
  selected: boolean;
}) {
  return (
    <div
      className="flex h-7 max-w-[110px] items-center gap-1 rounded-lg px-2.5 text-white shadow-sm transition-shadow group-hover:shadow-md"
      style={{
        backgroundColor: color,
        ...(selected
          ? { boxShadow: `0 0 0 2px ${color}, 0 0 12px 2px ${color}66` }
          : {}),
      }}
    >
      {Icon && <Icon className="size-3.5 shrink-0" strokeWidth={2.4} />}
      {text && (
        <span className="truncate text-[11px] font-semibold leading-none">
          {text}
        </span>
      )}
    </div>
  );
}

/**
 * Custom graph node component for all 7 asset graph types.
 *
 * Renders a colored circle (type abbreviation inside) or pill per node type,
 * with the label below — matching the reference force-directed graph style.
 * The fill comes from the cluster color injected by the view; `alert` adds a
 * severity ring (amber 4xx / red 5xx) plus a small dot, and critical (red)
 * services get a soft pulsing glow (CSS keyframes, disabled under reduced
 * motion and below zoom 0.5). Nodes are keyboard-focusable: Enter/Space opens
 * the detail sheet. React Flow resolves the component via the `nodeTypes` map
 * but does NOT pass `node.type` in `NodeProps`, so the visual type is derived
 * from the composite ID prefix (`id.split('|')[0]`).
 */
function GraphNodeComponentImpl({ data, id, selected }: NodeProps) {
  const nodeData = data as unknown as GraphNodeData;
  const reducedMotion = useReducedMotion() === true;
  const label = nodeData.label ?? id;
  const type = resolveNodeType(id);
  const color = nodeData.clusterColor ?? NODE_TYPE_COLORS[type];
  const alert = nodeData.alert === true;
  const severity = alert ? (nodeData.severity ?? 'danger') : undefined;
  const glow = nodeData.glow === true && severity === 'danger';
  const labelVisible = nodeData.labelVisible !== false;

  // Entrance stagger: fade + scale with a small cascade (20ms * capped
  // index). Runs once per node mount — polls keep node ids stable so the
  // position-preserving merge never re-triggers it.
  const staggerDelay = Math.min(nodeData.staggerIndex ?? 0, 30) * 0.02;

  const stale = (() => {
    const scannedAt = nodeData.lastScannedAt;
    if (!scannedAt) return false;
    const ts = new Date(scannedAt).getTime();
    return Number.isFinite(ts) && Date.now() - ts > STALE_THRESHOLD_MS;
  })();

  const truncatedLabel =
    label.length > MAX_LABEL_LENGTH
      ? `${label.slice(0, MAX_LABEL_LENGTH)}…`
      : label;

  // Whether the raw label is rendered below the badge.
  const showLabelBelow = type !== 'target' && type !== 'technology';

  const badge = (() => {
    switch (type) {
      case 'ip':
        return <CircleBadge text="IP" color={color} selected={selected} />;
      case 'service':
        return (
          <CircleBadge
            icon={Globe}
            text="WWW"
            color={color}
            selected={selected}
            severityRing={severity}
          />
        );
      case 'tls':
        return <CircleBadge text="SSL/TLS" color={color} selected={selected} />;
      case 'statusCode':
        return (
          <CircleBadge
            text={truncatedLabel.slice(0, 4)}
            color={color}
            selected={selected}
            size="size-6"
          />
        );
      case 'asset':
        return (
          <PillBadge
            icon={FileText}
            color={color}
            selected={selected}
          />
        );
      case 'technology':
        return (
          <PillBadge
            text={truncatedLabel}
            color={color}
            selected={selected}
          />
        );
      case 'target':
        return (
          <PillBadge
            icon={Flag}
            text={truncatedLabel}
            color={color}
            selected={selected}
          />
        );
      default:
        return <CircleBadge text={type} color={color} selected={selected} />;
    }
  })();

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      nodeData.onOpenDetail?.(id);
    }
  };

  const ariaLabel = `${type} node: ${label}${alert ? ', alert' : ''}${stale ? ', stale scan data' : ''}`;

  return (
    <motion.div
      role="treeitem"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      initial={reducedMotion ? false : { opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: 0.25,
        delay: reducedMotion ? 0 : staggerDelay,
        ease: 'easeOut',
      }}
      className="group relative flex cursor-pointer select-none items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={label}
    >
      {/* Two zero-size handles exactly at the node center: every straight
          edge anchors center-to-center, so wires pass through the middle of
          each badge (the badge is painted above the wire, hiding the stub). */}
      <Handle
        id="t-center"
        type="target"
        position={Position.Top}
        style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
        className="!opacity-0 !h-0 !w-0 !min-h-0 !min-w-0"
      />
      <Handle
        id="s-center"
        type="source"
        position={Position.Top}
        style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
        className="!opacity-0 !h-0 !w-0 !min-h-0 !min-w-0"
      />
      <div className="relative" data-graph-glow={glow ? 'true' : undefined}>
        {badge}
        {alert && (
          <span
            className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-red-500 ring-2 ring-background"
            aria-label="alert"
          />
        )}
        {stale && (
          <span
            className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-orange-500 ring-2 ring-background"
            aria-label="stale scan data"
          />
        )}
      </div>
      {showLabelBelow && labelVisible && (
        <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 max-w-[110px] -translate-x-1/2 text-center text-[10px] font-medium leading-tight text-foreground/80">
          {truncatedLabel}
        </div>
      )}
    </motion.div>
  );
}

/** Memoized node component: stable per poll, avoids re-renders on hover etc. */
export const GraphNodeComponent = memo(GraphNodeComponentImpl);
