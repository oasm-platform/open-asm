import {
  StatCard,
  StatCardSkeleton,
  StatNote,
} from '@/components/common/stat-card';
import {
  useVulnerabilitiesControllerGetSettings,
  type GetVulnerabilitiesStatisticsResponseDto,
  type SeverityCountsDto,
} from '@/services/apis/gen/queries';
import {
  AlarmClock,
  CircleCheck,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Timer,
} from 'lucide-react';
import { SEVERITY_TEXT_CLASS } from '../../dashboard/severity';
import { SeverityBreakdown } from '../../projects/components/severity-bar';

/** A view of the list a card opens: `open`, findings new in 7 days, or overdue ones. */
export type StatsView = 'open' | 'new' | 'overdue';

interface StatsStripProps {
  stats?: GetVulnerabilitiesStatisticsResponseDto;
  isLoading?: boolean;
  /** Opens the list view a card counts; cards without an exact view are not clickable. */
  onSelect?: (view: StatsView) => void;
}

/** One row of compact cards on wide screens, like the dashboard totals. */
const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6';

/**
 * Lifecycle numbers above the list: new in 7 days, open, resurfaced and fixed
 * in 30 days, overdue, and mean time to remediate high findings.
 */
export function VulnerabilityStatsStrip({
  stats,
  isLoading,
  onSelect,
}: StatsStripProps) {
  const { data: settings } = useVulnerabilitiesControllerGetSettings();

  if (isLoading) {
    return (
      <div className={GRID} data-testid="vuln-stats-loading">
        {Array.from({ length: 6 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!stats) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
        Statistics are not available right now.
      </p>
    );
  }

  const bySeverity = Object.fromEntries(
    (stats.data ?? []).map((s) => [s.severity, s.count]),
  ) as Partial<SeverityCountsDto>;
  const counts: SeverityCountsDto = {
    critical: bySeverity.critical ?? 0,
    high: bySeverity.high ?? 0,
    medium: bySeverity.medium ?? 0,
    low: bySeverity.low ?? 0,
    info: bySeverity.info ?? 0,
  };
  const open = (stats.data ?? []).reduce((sum, s) => sum + s.count, 0);
  const mttrHigh = stats.mttr?.find((m) => m.severity === 'high');
  const slaHigh = settings?.slaDays.high;
  const select = (view: StatsView) =>
    onSelect ? () => onSelect(view) : undefined;

  return (
    <div className={GRID}>
      <StatCard
        label="New"
        icon={Sparkles}
        value={stats.newLast7Days}
        aside={<StatNote title="First detected in the last 7 days, still open">7d</StatNote>}
        onClick={select('new')}
      />
      <StatCard
        label="Open"
        icon={ShieldAlert}
        value={open}
        onClick={select('open')}
      >
        <SeverityBreakdown counts={counts} />
      </StatCard>
      <StatCard
        label="Resurfaced"
        icon={RotateCcw}
        value={stats.resurfacedLast30Days}
        aside={<StatNote title="In the last 30 days">30d</StatNote>}
      />
      <StatCard
        label="Fixed"
        icon={CircleCheck}
        value={stats.fixedLast30Days}
        aside={<StatNote title="In the last 30 days">30d</StatNote>}
      />
      <StatCard
        label="SLA overdue"
        icon={AlarmClock}
        value={stats.overdue}
        tone={stats.overdue > 0 ? SEVERITY_TEXT_CLASS.critical : undefined}
        onClick={select('overdue')}
      />
      <StatCard
        label="MTTR high"
        icon={Timer}
        value={mttrHigh?.days != null ? `${Math.round(mttrHigh.days)} d` : '—'}
        aside={
          slaHigh ? (
            <StatNote title={`SLA for high findings: ${slaHigh} days`}>
              SLA {slaHigh}d
            </StatNote>
          ) : (
            <StatNote title="Fixed in the last 90 days">90d</StatNote>
          )
        }
      />
    </div>
  );
}
