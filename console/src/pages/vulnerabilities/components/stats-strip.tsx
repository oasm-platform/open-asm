import {
  StatCard,
  StatCardSkeleton,
  StatNote,
} from '@/components/common/stat-card';
import { useT } from '@/lib/i18n-dictionary';
import {
  useVulnerabilitiesControllerGetSettings,
  type GetVulnerabilitiesStatisticsResponseDto,
  type SeverityCountsDto,
} from '@/services/apis/gen/queries';
import {
  AlarmClock,
  Bot,
  CircleCheck,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Timer,
} from 'lucide-react';
import { SEVERITY_TEXT_CLASS } from '../../dashboard/severity';
import { SeverityBreakdown } from '../../projects/components/severity-bar';

/**
 * A view of the list a card opens: `open`, findings new in 7 days, overdue
 * ones, or AI proposals waiting for review.
 */
export type StatsView = 'open' | 'new' | 'overdue' | 'pending_review';

interface StatsStripProps {
  stats?: GetVulnerabilitiesStatisticsResponseDto;
  isLoading?: boolean;
  /** Opens the list view a card counts; cards without an exact view are not clickable. */
  onSelect?: (view: StatsView) => void;
  /** Shows AI proposals to review instead of open findings (the dashboard counts those already). */
  showPendingReview?: boolean;
  /**
   * False leaves the per-severity counts out of the Open card, for a page
   * that shows them elsewhere: they make every card in the row taller.
   */
  showSeverityBreakdown?: boolean;
}

/** Open findings per severity, zeros included. */
export function openSeverityCounts(
  stats: GetVulnerabilitiesStatisticsResponseDto,
): SeverityCountsDto {
  const bySeverity = Object.fromEntries(
    (stats.data ?? []).map((s) => [s.severity, s.count]),
  ) as Partial<SeverityCountsDto>;
  return {
    critical: bySeverity.critical ?? 0,
    high: bySeverity.high ?? 0,
    medium: bySeverity.medium ?? 0,
    low: bySeverity.low ?? 0,
    info: bySeverity.info ?? 0,
  };
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
  showPendingReview,
  showSeverityBreakdown = true,
}: StatsStripProps) {
  const t = useT();
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
        {t('vulnerabilities.stats.unavailable')}
      </p>
    );
  }

  const open = (stats.data ?? []).reduce((sum, s) => sum + s.count, 0);
  const mttrHigh = stats.mttr?.find((m) => m.severity === 'high');
  const slaHigh = settings?.slaDays.high;
  const select = (view: StatsView) =>
    onSelect ? () => onSelect(view) : undefined;

  return (
    <div className={GRID}>
      <StatCard
        label={t('vulnerabilities.stats.new')}
        icon={Sparkles}
        value={stats.newLast7Days}
        aside={
          <StatNote title={t('vulnerabilities.stats.newNote')}>
            {t('vulnerabilities.stats.d7')}
          </StatNote>
        }
        onClick={select('new')}
      />
      {showPendingReview ? (
        <StatCard
          label={t('vulnerabilities.stats.pendingReview')}
          icon={Bot}
          value={stats.pendingReview}
          hint={t('vulnerabilities.stats.pendingHint')}
          onClick={select('pending_review')}
        />
      ) : (
        <StatCard
          label={t('vulnerabilities.stats.open')}
          icon={ShieldAlert}
          value={open}
          onClick={select('open')}
        >
          {showSeverityBreakdown && (
            <SeverityBreakdown counts={openSeverityCounts(stats)} />
          )}
        </StatCard>
      )}
      <StatCard
        label={t('vulnerabilities.stats.resurfaced')}
        icon={RotateCcw}
        value={stats.resurfacedLast30Days}
        aside={
          <StatNote title={t('vulnerabilities.stats.last30')}>
            {t('vulnerabilities.stats.d30')}
          </StatNote>
        }
      />
      <StatCard
        label={t('vulnerabilities.stats.fixed')}
        icon={CircleCheck}
        value={stats.fixedLast30Days}
        aside={
          <StatNote title={t('vulnerabilities.stats.last30')}>
            {t('vulnerabilities.stats.d30')}
          </StatNote>
        }
      />
      <StatCard
        label={t('vulnerabilities.stats.slaOverdue')}
        icon={AlarmClock}
        value={stats.overdue}
        tone={stats.overdue > 0 ? SEVERITY_TEXT_CLASS.critical : undefined}
        onClick={select('overdue')}
      />
      <StatCard
        label={t('vulnerabilities.stats.mttrHigh')}
        icon={Timer}
        value={mttrHigh?.days != null ? t('vulnerabilities.stats.mttrDays', { n: Math.round(mttrHigh.days) }) : '—'}
        aside={
          slaHigh ? (
            <StatNote title={t('vulnerabilities.stats.slaHighTitle', { n: slaHigh })}>
              {t('vulnerabilities.stats.slaHigh', { n: slaHigh })}
            </StatNote>
          ) : (
            <StatNote title={t('vulnerabilities.stats.last90')}>
              {t('vulnerabilities.stats.d90')}
            </StatNote>
          )
        }
      />
    </div>
  );
}
