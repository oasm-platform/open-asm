import type { QueryBatchResult } from '@/modules/attack-surface-query/domain/query.types';
import { Severity, type TargetType } from '@/common/enums/enum';
import { StatisticService } from '@/modules/statistic/statistic.service';
import { at, firstError, num, type Row, rowsOf, str, strArray } from '../../shared/batch-result';
import { formatDay, reportHeader, riskLevel, trendStats } from '../../shared/report-header';
import type { ReportOptions } from '../../shared/asq-filters';
import { matrixOf, trendSeries } from '../../shared/severity-matrix';
import type { MappedData, TemplateContext } from '../../template.types';
import type { ReportData } from './data.type';

type RiskLevel = Exclude<Severity, Severity.INFO>;

const LEVELS = [Severity.CRITICAL, Severity.HIGH, Severity.MEDIUM, Severity.LOW, Severity.INFO] as const;
/** Colours the old report used; info is not part of the distribution. */
const RISK_COLORS: [RiskLevel, string][] = [
  [Severity.CRITICAL, '#dc2626'],
  [Severity.HIGH, '#f97316'],
  [Severity.MEDIUM, '#eab308'],
  [Severity.LOW, '#3b82f6'],
];

const PROVIDER = 'OpenASM';
const TECH_CATEGORY = 'Technology';

/** Severity counts of one aggregate column (`current` or `lastWeek`). */
function severityCounts(rows: Row[], column: 'current' | 'lastWeek'): Record<Severity, number> {
  const counts = Object.fromEntries(LEVELS.map((s) => [s, 0])) as Record<Severity, number>;
  for (const r of rows) {
    const severity = str(r.severity);
    if (severity in counts) counts[severity as Severity] = num(r[column]);
  }
  return counts;
}

/** `[total, change]`: the total minus the rows created last week, as today. */
function totalAndChange(results: QueryBatchResult[], name: string): [number, number] {
  const r = rowsOf(results, name)[0] ?? {};
  const total = num(r.total);
  return [total, total - num(r.lastWeek)];
}

export function summaryToData(results: QueryBatchResult[], ctx: TemplateContext<ReportOptions>): MappedData<ReportData> {
  firstError(results);
  const severityRows = rowsOf(results, 'severity');
  const current = severityCounts(severityRows, 'current');
  const lastWeek = severityCounts(severityRows, 'lastWeek');
  const total = LEVELS.reduce((sum, s) => sum + current[s], 0);
  const securityScore = StatisticService.calculateSecurityScore(current);

  const [totalTargets, targetsChange] = totalAndChange(results, 'targets');
  const [totalAssets, assetsChange] = totalAndChange(results, 'hosts');
  const [totalServices, servicesChange] = totalAndChange(results, 'services');

  const trend = trendSeries(rowsOf(results, 'trend'));

  const discoveryRisk = new Map<string, number>();
  for (const r of rowsOf(results, 'discoveryRisk')) discoveryRisk.set(String(at(r, 'host', 'target', 'value')), num(r.n));
  const targetRisk = (value: string) => riskLevel(discoveryRisk.get(value) ?? 0) as RiskLevel;
  const targets = (name: string) =>
    rowsOf(results, name).map((r) => ({
      identifier: String(r.value),
      discovered: formatDay(r.firstSeen),
      provider: PROVIDER,
      riskLevel: targetRisk(String(r.value)),
    }));

  const portRows = rowsOf(results, 'portRisk');
  // Open findings on the same host whose `ports` list the port, like the old `v.ports @> ARRAY[port]`.
  const portRiskCount = (hostId: unknown, port: number) =>
    portRows.filter((v) => at(v, 'host', 'id') === hostId && strArray(v.ports).includes(String(port)))
      .length;

  return {
    ...reportHeader(ctx.now, ctx.options, 'Attack Surface Discovery Report'),
    // `classification` and `systemName` are added by renderTemplatePdf.
    workspaceName: ctx.workspaceName,
    weekly: {
      totalTargets,
      targetsChange,
      totalAssets,
      assetsChange,
      totalServices,
      servicesChange,
      securityScore,
      scoreChange: securityScore - StatisticService.calculateSecurityScore(lastWeek),
    },
    vulnerabilityTrends: { ...trend, ...trendStats(trend.last30Days, trend.last7Days) },
    newDiscoveries: {
      domains: targets('newDomains'),
      ipAddresses: targets('newIps'),
      ports: rowsOf(results, 'newPorts').map((r) => ({
        port: num(r.port),
        service: String(r.value),
        discovered: formatDay(r.firstSeen),
        target: str(at(r, 'target', 'value')),
        riskLevel: riskLevel(portRiskCount(at(r, 'host', 'id'), num(r.port))) as RiskLevel,
      })),
      technologies: rowsOf(results, 'newTech').map((r) => ({
        name: String(r.tag),
        discovered: formatDay(r.firstSeen),
        target: str(at(r, 'service', 'target', 'value')),
        category: TECH_CATEGORY,
      })),
    },
    newFindings: rowsOf(results, 'newFindings').map((v) => ({
      title: String(v.name),
      severity: v.severity as Severity,
      cvss: num(v.cvssScore),
      asset: str(at(v, 'host', 'value')) || 'Unknown',
      discovered: formatDay(v.firstSeen),
    })),
    riskDistribution: RISK_COLORS.map(([level, color]) => ({
      level,
      count: current[level],
      percent: total > 0 ? (current[level] / total) * 100 : 0,
      color,
    })),
    vulnerabilityByTarget: rowsOf(results, 'byTarget').map((r) => {
      const { total: t, critical, high, medium, low } = matrixOf(r);
      return { target: str(at(r, 'host', 'target', 'value')), type: str(at(r, 'host', 'target', 'type')) as TargetType, critical, high, medium, low, total: t };
    }),
  };
}
