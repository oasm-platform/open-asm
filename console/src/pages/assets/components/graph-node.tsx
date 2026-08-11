import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Globe,
  Monitor,
  Server,
  Plug,
  Code,
  Lock,
  Hash,
  type LucideIcon,
} from 'lucide-react';
import {
  NODE_TYPE_COLORS,
  type NodeType,
  type GraphNodeData,
} from './graph-types';

/** Map lucide icon name strings (from NODE_TYPE_ICONS) to actual components. */
const ICON_COMPONENTS: Record<NodeType, LucideIcon> = {
  target: Globe,
  asset: Monitor,
  ip: Server,
  service: Plug,
  technology: Code,
  tls: Lock,
  statusCode: Hash,
};

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

/** Derive the visual node type from a composite ID like "target|<key>". */
function resolveNodeType(nodeId: string): NodeType {
  const prefix = nodeId.split('|')[0] ?? '';
  return ID_PREFIX_MAP[prefix] ?? 'asset';
}

/** Extract a short subtitle from metadata based on node type. */
function getSubtitle(
  type: NodeType,
  metadata: Record<string, unknown> | undefined,
): string | undefined {
  if (!metadata) return undefined;
  switch (type) {
    case 'service': {
      const port = metadata['port'];
      return port != null ? `:${String(port)}` : undefined;
    }
    case 'asset': {
      const ips = metadata['ipAddresses'];
      if (Array.isArray(ips) && ips.length > 0) {
        return `${ips.length} IP${ips.length > 1 ? 's' : ''}`;
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Custom graph node component for all 7 asset graph types.
 *
 * React Flow resolves the component via the `nodeTypes` map (one entry per
 * type, all pointing here), but does NOT pass `node.type` in `NodeProps`.
 * The visual type is derived from the composite ID prefix (`id.split('|')[0]`).
 */
export function GraphNodeComponent({ data, id, selected }: NodeProps) {
  const nodeData = data as unknown as GraphNodeData;
  const label = nodeData.label ?? id;
  const type = resolveNodeType(id);
  const color = NODE_TYPE_COLORS[type];
  const Icon = ICON_COMPONENTS[type];
  const subtitle = getSubtitle(type, nodeData.metadata);

  const truncatedLabel =
    label.length > MAX_LABEL_LENGTH
      ? `${label.slice(0, MAX_LABEL_LENGTH)}…`
      : label;

  return (
    <div
      role="treeitem"
      aria-label={`${type} node: ${label}`}
      className="cursor-pointer rounded-md border-2 bg-card px-3 py-2 shadow-sm transition-shadow hover:shadow-md dark:bg-card"
      style={{
        borderColor: color,
        ...(selected ? { boxShadow: `0 0 0 2px ${color}40` } : {}),
      }}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <div className="flex items-center gap-2">
        {/* Tinted icon circle */}
        <div
          className="flex size-7 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${color}1a` }}
        >
          <Icon className="size-3.5" style={{ color }} strokeWidth={2} />
        </div>
        {/* Label + optional subtitle */}
        <div className="min-w-0">
          <div
            className="truncate text-xs font-medium text-card-foreground"
            style={{ maxWidth: '160px' }}
            title={label}
          >
            {truncatedLabel}
          </div>
          {subtitle && (
            <div className="truncate text-[10px] text-muted-foreground">
              {subtitle}
            </div>
          )}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!opacity-0"
      />
    </div>
  );
}
