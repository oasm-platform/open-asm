import { Handle, Position, type NodeProps } from '@xyflow/react';
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

/** Derive the visual node type from a composite ID like "target|<key>". */
function resolveNodeType(nodeId: string): NodeType {
  const prefix = nodeId.split('|')[0] ?? '';
  return ID_PREFIX_MAP[prefix] ?? 'asset';
}

/** Circular badge — used for ip / service / tls / statusCode nodes. */
function CircleBadge({
  icon: Icon,
  text,
  color,
  selected,
}: {
  icon?: LucideIcon;
  text: string;
  color: string;
  selected: boolean;
}) {
  return (
    <div
      className="flex size-14 flex-col items-center justify-center gap-0.5 rounded-full text-white shadow-sm transition-shadow group-hover:shadow-md"
      style={{
        backgroundColor: color,
        ...(selected ? { boxShadow: `0 0 0 2px ${color}66` } : {}),
      }}
    >
      {Icon && <Icon className="size-3.5" strokeWidth={2.4} />}
      <span
        className={`font-bold uppercase leading-none tracking-widest ${
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
        ...(selected ? { boxShadow: `0 0 0 2px ${color}66` } : {}),
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
 * red status dot. React Flow resolves the component via the `nodeTypes` map
 * but does NOT pass `node.type` in `NodeProps`, so the visual type is derived
 * from the composite ID prefix (`id.split('|')[0]`).
 */
export function GraphNodeComponent({ data, id, selected }: NodeProps) {
  const nodeData = data as unknown as GraphNodeData;
  const label = nodeData.label ?? id;
  const type = resolveNodeType(id);
  const color = nodeData.clusterColor ?? NODE_TYPE_COLORS[type];
  const alert = nodeData.alert === true;

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
          <CircleBadge icon={Globe} text="WWW" color={color} selected={selected} />
        );
      case 'tls':
        return <CircleBadge text="SSI" color={color} selected={selected} />;
      case 'statusCode':
        return (
          <CircleBadge
            text={truncatedLabel.slice(0, 4)}
            color={color}
            selected={selected}
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

  return (
    <div
      role="treeitem"
      aria-label={`${type} node: ${label}`}
      className="group flex cursor-pointer select-none flex-col items-center gap-1"
      title={label}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <div className="relative">
        {badge}
        {alert && (
          <span
            className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-red-500 ring-2 ring-background"
            aria-label="alert"
          />
        )}
      </div>
      {showLabelBelow && (
        <div className="max-w-[110px] text-center text-[10px] font-medium leading-tight text-foreground/80">
          {truncatedLabel}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!opacity-0"
      />
    </div>
  );
}
