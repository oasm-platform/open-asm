import type { NodeProps } from '@xyflow/react';
import type { TopologyNodeData } from './topology-types';

/**
 * Placeholder topology node component.
 * Will be replaced by per-type styled nodes in todo 7.
 */
export function TopologyNodeComponent({ data }: NodeProps) {
  const nodeData = data as TopologyNodeData;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs text-card-foreground">
      {nodeData.label}
    </div>
  );
}
