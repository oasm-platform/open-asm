import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { Node } from '@xyflow/react';
import { resolveNodeType } from './graph-node';
import { NODE_TYPE_COLORS, type NodeType } from './graph-types';
import { Search } from 'lucide-react';

interface GraphNodeSearchProps {
  nodes: Node[];
  onSelect: (nodeId: string) => void;
}

const TYPE_LABELS: Record<NodeType, string> = {
  target: 'Target',
  asset: 'Domain',
  ip: 'IP',
  service: 'Service',
  technology: 'Technology',
  tls: 'TLS',
  statusCode: 'Status',
};

/** Searchable node picker: filters current graph nodes by label and zooms. */
export function GraphNodeSearch({ nodes, onSelect }: GraphNodeSearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const labelOf = (n: Node) =>
      ((n.data as Record<string, unknown> | undefined)?.label as string) ?? '';
    const base = q
      ? nodes.filter((n) => labelOf(n).toLowerCase().includes(q))
      : nodes;
    // Show targets/assets/IPs first, then the rest, capped for readability.
    const priority: Record<string, number> = {
      target: 0,
      asset: 1,
      ip: 2,
      service: 3,
    };
    return [...base]
      .sort(
        (a, b) =>
          (priority[resolveNodeType(a.id)] ?? 9) -
          (priority[resolveNodeType(b.id)] ?? 9),
      )
      .slice(0, 50);
  }, [nodes, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="border-dashed">
          <Search className="mr-1.5 size-3.5" />
          Find Node
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <div className="space-y-2">
          <Input
            autoFocus
            placeholder="Search domains, IPs, services..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 text-xs"
          />
          <div className="max-h-72 overflow-y-auto">
            {results.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                No matching nodes
              </div>
            ) : (
              results.map((n) => {
                const type = resolveNodeType(n.id);
                const label =
                  ((n.data as Record<string, unknown> | undefined)?.label as
                    | string
                    | undefined) ?? n.id;
                return (
                  <div
                    key={n.id}
                    className="flex items-center gap-2 rounded-sm px-2 py-1.5 cursor-pointer hover:bg-accent"
                    onClick={() => {
                      onSelect(n.id);
                      setOpen(false);
                      setQuery('');
                    }}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          NODE_TYPE_COLORS[type] ?? '#94a3b8',
                      }}
                    />
                    <span className="truncate text-sm">{label}</span>
                    <span className="ml-auto shrink-0 text-[10px] uppercase text-muted-foreground">
                      {TYPE_LABELS[type] ?? type}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
