import { useT } from '@/lib/i18n-dictionary';
import { NODE_TYPE_COLORS, type NodeType } from './graph-types';

interface LegendTarget {
  label: string;
  color: string;
}

interface GraphLegendProps {
  targets: LegendTarget[];
}

const NODE_TYPES: NodeType[] = ['target', 'asset', 'ip', 'service'];

// Label keys resolved at render so a language switch applies.
const EDGE_ROWS: Array<{ label: string; type: string; note: string }> = [
  { label: 'assets.graph.legend.edgeFamily', type: 'belongs_to', note: 'assets.graph.legend.edgeFamilyNote' },
  { label: 'assets.graph.legend.edgeIp', type: 'resolves_to', note: '' },
  { label: 'assets.graph.legend.edgeService', type: 'runs_on', note: 'assets.graph.legend.edgeServiceNote' },
];

const SEVERITY_ROWS = [
  { color: 'bg-warning', text: 'assets.graph.legend.severity4xx' },
  { color: 'bg-destructive', text: 'assets.graph.legend.severity5xx' },
];

/** Collapsible-free legend: swatches for targets, node types, edges, severity. */
export function GraphLegend({ targets }: GraphLegendProps) {
  const t = useT();
  return (
    <div className="flex w-64 flex-col gap-3 rounded-md border bg-popover/95 p-3 text-xs shadow-md">
      {targets.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="font-semibold uppercase tracking-wide text-[10px] text-muted-foreground">
            {t('assets.graph.legend.targets')}
          </span>
          {targets.map((target) => (
            <div key={target.label} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: target.color }}
              />
              <span className="truncate">{target.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="font-semibold uppercase tracking-wide text-[10px] text-muted-foreground">
          {t('assets.graph.legend.nodeTypes')}
        </span>
        {NODE_TYPES.map((type) => (
          <div key={type} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: NODE_TYPE_COLORS[type] }}
            />
            <span className="capitalize">{t(`assets.graph.nodeType.${type}`)}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="font-semibold uppercase tracking-wide text-[10px] text-muted-foreground">
          {t('assets.graph.legend.edges')}
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
            <span>{t(e.label)}</span>
            {e.note && (
              <span className="ml-auto text-[10px] text-muted-foreground">
                {t(e.note)}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="font-semibold uppercase tracking-wide text-[10px] text-muted-foreground">
          {t('assets.graph.legend.serviceStatus')}
        </span>
        {SEVERITY_ROWS.map((s) => (
          <div key={s.text} className="flex items-center gap-2">
            <span className={`size-2.5 shrink-0 rounded-full ${s.color}`} />
            <span>{t(s.text)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
