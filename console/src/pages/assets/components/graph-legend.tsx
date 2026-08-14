import { NODE_TYPE_COLORS, type NodeType } from './graph-types';

interface LegendTarget {
  label: string;
  color: string;
}

interface GraphLegendProps {
  targets: LegendTarget[];
}

const NODE_TYPES: NodeType[] = ['target', 'asset', 'ip', 'service'];

const EDGE_ROWS: Array<{ label: string; type: string; note: string }> = [
  { label: 'Domain family', type: 'belongs_to', note: 'target → domain' },
  { label: 'Domain → IP', type: 'resolves_to', note: '' },
  { label: 'Domain → service', type: 'runs_on', note: 'click to load' },
];

const SEVERITY_ROWS = [
  { color: 'bg-warning', text: '4xx — warning ring' },
  { color: 'bg-destructive', text: '5xx — danger ring + glow' },
];

/** Collapsible-free legend: swatches for targets, node types, edges, severity. */
export function GraphLegend({ targets }: GraphLegendProps) {
  return (
    <div className="flex w-64 flex-col gap-3 rounded-md border bg-popover/95 p-3 text-xs shadow-md">
      {targets.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="font-semibold uppercase tracking-wide text-[10px] text-muted-foreground">
            Targets
          </span>
          {targets.map((t) => (
            <div key={t.label} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: t.color }}
              />
              <span className="truncate">{t.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="font-semibold uppercase tracking-wide text-[10px] text-muted-foreground">
          Node Types
        </span>
        {NODE_TYPES.map((t) => (
          <div key={t} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: NODE_TYPE_COLORS[t] }}
            />
            <span className="capitalize">{t}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="font-semibold uppercase tracking-wide text-[10px] text-muted-foreground">
          Edges
        </span>
        {EDGE_ROWS.map((e) => (
          <div key={e.label} className="flex items-center gap-2">
            <svg width="22" height="6" className="shrink-0">
              <line
                x1="0"
                y1="3"
                x2="22"
                y2="3"
                stroke="var(--color-graph-edge)"
                strokeWidth="1.5"
              />
            </svg>
            <span>{e.label}</span>
            {e.note && (
              <span className="ml-auto text-[10px] text-muted-foreground">
                {e.note}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="font-semibold uppercase tracking-wide text-[10px] text-muted-foreground">
          Service Status
        </span>
        {SEVERITY_ROWS.map((s) => (
          <div key={s.text} className="flex items-center gap-2">
            <span className={`size-2.5 shrink-0 rounded-full ${s.color}`} />
            <span>{s.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
