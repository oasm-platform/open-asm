import { Severity } from '@/common/enums/enum';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Target } from '../targets/entities/target.entity';
import { Vulnerability } from '../vulnerabilities/entities/vulnerability.entity';
import { openVulnerabilityCondition } from '../vulnerabilities/open-vulnerability';
import { StatisticService } from './statistic.service';

/**
 * The numbers the PDF reports print: severity counts, daily trends, the
 * assets and targets with the most open findings, and period counts of
 * targets, assets, services and findings. Open findings only
 * (`openVulnerabilityCondition`), like the dashboard; the general counts
 * come from `StatisticService`.
 */
@Injectable()
export class ReportStatisticsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly statistics: StatisticService,
  ) {}

  /**
   * Returns daily vulnerability counts for a workspace within a date range.
   * Fills in missing days with 0 counts.
   * Shared between summary and vulnerability report services.
   */
  async getDailyVulnerabilityCounts(
    workspaceId: string,
    startDate: Date,
    endDate: Date,
    options?: { targetIds?: string[] },
  ) {
    const qb = this.dataSource
      .getRepository(Vulnerability)
      .createQueryBuilder('v')
      .leftJoin('v.asset', 'asset')
      .leftJoin('asset.target', 'target')
      .select("TO_CHAR(v.createdAt, 'YYYY-MM-DD')", 'date')
      .addSelect('COUNT(*)', 'count')
      .where('target.workspaceId = :workspaceId', { workspaceId })
      .andWhere('v.createdAt >= :startDate', { startDate })
      .andWhere('v.createdAt <= :endDate', { endDate })
      .andWhere(openVulnerabilityCondition('v'))
      .groupBy("TO_CHAR(v.createdAt, 'YYYY-MM-DD')")
      .orderBy('date', 'ASC');

    if (options?.targetIds?.length) {
      qb.andWhere('target.id IN (:...targetIds)', {
        targetIds: options.targetIds,
      });
    }

    const results = await qb.getRawMany<{ date: string; count: string }>();

    // Fill in missing days with 0 counts
    const dateMap = new Map(
      results.map((r) => [r.date, parseInt(r.count, 10)]),
    );
    const dates: { date: string; count: number }[] = [];

    const current = new Date(startDate);
    while (current <= endDate) {
      const dateStr = current.toISOString().split('T')[0];
      dates.push({
        date: dateStr,
        count: dateMap.get(dateStr) || 0,
      });
      current.setDate(current.getDate() + 1);
    }

    return dates;
  }

  /**
   * Returns vulnerability trend data (last 7 days, last 30 days, avg per week, trend direction).
   * Shared between summary and vulnerability report services.
   */
  async getVulnerabilityTrends(
    workspaceId: string,
    options?: { targetIds?: string[] },
  ) {
    const now = new Date();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [last7DaysData, last30DaysData] = await Promise.all([
      this.getDailyVulnerabilityCounts(workspaceId, last7Days, now, options),
      this.getDailyVulnerabilityCounts(workspaceId, last30Days, now, options),
    ]);

    const avgPerWeek =
      last7DaysData.length > 0
        ? last7DaysData.reduce((sum, d) => sum + d.count, 0) / 7
        : 0;

    // Calculate trend
    const firstHalf = last30DaysData.slice(0, 15);
    const secondHalf = last30DaysData.slice(15);
    const firstAvg =
      firstHalf.length > 0
        ? firstHalf.reduce((sum, d) => sum + d.count, 0) / firstHalf.length
        : 0;
    const secondAvg =
      secondHalf.length > 0
        ? secondHalf.reduce((sum, d) => sum + d.count, 0) / secondHalf.length
        : 0;

    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (secondAvg > firstAvg * 1.2) trend = 'increasing';
    else if (secondAvg < firstAvg * 0.8) trend = 'decreasing';

    return {
      last7Days: last7DaysData.map((d) => d.count),
      last30Days: last30DaysData.map((d) => d.count),
      avgPerWeek: Math.round(avgPerWeek * 10) / 10,
      trend,
    };
  }

  /**
   * Returns vulnerability counts grouped by severity for a workspace.
   * Filters by date range and target IDs when provided.
   * Shared between summary and vulnerability report services.
   */
  async getSeverityCounts(
    workspaceId: string,
    options?: { startDate?: Date; endDate?: Date; targetIds?: string[] },
  ): Promise<Record<Severity, number>> {
    const qb = this.dataSource
      .getRepository(Vulnerability)
      .createQueryBuilder('v')
      .leftJoin('v.asset', 'asset')
      .leftJoin('asset.target', 'target')
      .select('v.severity', 'severity')
      .addSelect('COUNT(*)', 'count')
      .where('target.workspaceId = :workspaceId', { workspaceId })
      .andWhere(openVulnerabilityCondition('v'));

    if (options?.startDate) {
      qb.andWhere('v.createdAt >= :startDate', {
        startDate: options.startDate,
      });
    }
    if (options?.endDate) {
      qb.andWhere('v.createdAt <= :endDate', { endDate: options.endDate });
    }
    if (options?.targetIds?.length) {
      qb.andWhere('target.id IN (:...targetIds)', {
        targetIds: options.targetIds,
      });
    }

    const results = await qb
      .groupBy('v.severity')
      .getRawMany<{ severity: Severity; count: string }>();

    const counts = {
      [Severity.CRITICAL]: 0,
      [Severity.HIGH]: 0,
      [Severity.MEDIUM]: 0,
      [Severity.LOW]: 0,
      [Severity.INFO]: 0,
    };

    for (const result of results) {
      counts[result.severity] = parseInt(result.count, 10);
    }

    return counts;
  }

  /**
   * Returns top assets with most vulnerabilities for a workspace.
   * Filters by date range and target IDs when provided.
   * Shared between summary and vulnerability report services.
   */
  async getTopAssetsWithVulnerabilities(
    workspaceId: string,
    options?: { startDate?: Date; endDate?: Date; targetIds?: string[] },
    limit = 10,
  ) {
    const qb = this.dataSource
      .getRepository(Vulnerability)
      .createQueryBuilder('v')
      .leftJoin('v.asset', 'asset')
      .leftJoin('asset.target', 'target')
      .select('asset.value', 'assetValue')
      .addSelect('COUNT(*)', 'totalCount')
      .addSelect(
        `SUM(CASE WHEN v.severity = 'critical' THEN 1 ELSE 0 END)`,
        'critical',
      )
      .addSelect(`SUM(CASE WHEN v.severity = 'high' THEN 1 ELSE 0 END)`, 'high')
      .addSelect(
        `SUM(CASE WHEN v.severity = 'medium' THEN 1 ELSE 0 END)`,
        'medium',
      )
      .addSelect(`SUM(CASE WHEN v.severity = 'low' THEN 1 ELSE 0 END)`, 'low')
      .addSelect(`SUM(CASE WHEN v.severity = 'info' THEN 1 ELSE 0 END)`, 'info')
      .where('target.workspaceId = :workspaceId', { workspaceId })
      .andWhere(openVulnerabilityCondition('v'))
      .groupBy('asset.value')
      .orderBy('"totalCount"', 'DESC')
      .limit(limit);

    if (options?.startDate) {
      qb.andWhere('v.createdAt >= :startDate', {
        startDate: options.startDate,
      });
    }
    if (options?.endDate) {
      qb.andWhere('v.createdAt <= :endDate', { endDate: options.endDate });
    }
    if (options?.targetIds?.length) {
      qb.andWhere('target.id IN (:...targetIds)', {
        targetIds: options.targetIds,
      });
    }

    const results = await qb.getRawMany<{
      assetValue: string;
      totalCount: string;
      critical: string;
      high: string;
      medium: string;
      low: string;
      info: string;
    }>();

    return results.map((r) => ({
      asset: r.assetValue,
      total: parseInt(r.totalCount, 10),
      critical: parseInt(r.critical, 10),
      high: parseInt(r.high, 10),
      medium: parseInt(r.medium, 10),
      low: parseInt(r.low, 10),
      info: parseInt(r.info, 10),
    }));
  }

  /**
   * Returns vulnerability stats grouped by target for a workspace.
   * Filters by date range and target IDs when provided.
   * Shared between summary and vulnerability report services.
   */
  async getTargetVulnerabilityStats(
    workspaceId: string,
    options?: { startDate?: Date; endDate?: Date; targetIds?: string[] },
  ) {
    const qb = this.dataSource
      .getRepository(Target)
      .createQueryBuilder('t')
      .leftJoin('t.assets', 'asset')
      .leftJoin('asset.vulnerabilities', 'v')
      .select('t.value', 'targetValue')
      .addSelect('t.type', 'targetType')
      .addSelect(
        `SUM(CASE WHEN v.severity = 'critical' THEN 1 ELSE 0 END)`,
        'critical',
      )
      .addSelect(`SUM(CASE WHEN v.severity = 'high' THEN 1 ELSE 0 END)`, 'high')
      .addSelect(
        `SUM(CASE WHEN v.severity = 'medium' THEN 1 ELSE 0 END)`,
        'medium',
      )
      .addSelect(`SUM(CASE WHEN v.severity = 'low' THEN 1 ELSE 0 END)`, 'low')
      .addSelect(`SUM(CASE WHEN v.severity = 'info' THEN 1 ELSE 0 END)`, 'info')
      .addSelect('COUNT(v.id)', 'total')
      .where('t.workspaceId = :workspaceId', { workspaceId })
      .andWhere(openVulnerabilityCondition('v'))
      .groupBy('t.id')
      .addGroupBy('t.value')
      .addGroupBy('t.type')
      .having('COUNT(v.id) > 0')
      .orderBy('total', 'DESC');

    if (options?.startDate) {
      qb.andWhere('v.createdAt >= :startDate', {
        startDate: options.startDate,
      });
    }
    if (options?.endDate) {
      qb.andWhere('v.createdAt <= :endDate', { endDate: options.endDate });
    }
    if (options?.targetIds?.length) {
      qb.andWhere('t.id IN (:...targetIds)', { targetIds: options.targetIds });
    }

    const results = await qb.getRawMany<{
      targetValue: string;
      targetType: string;
      critical: string;
      high: string;
      medium: string;
      low: string;
      info: string;
      total: string;
    }>();

    return results.map((r) => ({
      target: r.targetValue,
      type: r.targetType,
      critical: parseInt(r.critical, 10),
      high: parseInt(r.high, 10),
      medium: parseInt(r.medium, 10),
      low: parseInt(r.low, 10),
      info: parseInt(r.info, 10),
      total: parseInt(r.total, 10),
    }));
  }

  /**
   * Returns a single count for a specific workspace using the get*Counts methods.
   * Convenience wrapper for report services that need a single numeric count.
   */
  async getCountForWorkspace(
    countType:
      | 'assets'
      | 'targets'
      | 'vulnerabilities'
      | 'services'
      | 'ports'
      | 'techs',
    workspaceId: string,
    options?: { startDate?: Date; endDate?: Date },
  ): Promise<number> {
    const filter = { workspaceIds: [workspaceId], ...options };

    if (countType === 'vulnerabilities') {
      // One row per severity; Info findings are not open vulnerabilities.
      const rows = await this.statistics.getVulnerabilityCounts(filter);
      return rows
        .filter((row) => row.severity !== 'info')
        .reduce((sum, row) => sum + Number(row.count), 0);
    }
    if (countType === 'services' || countType === 'ports') {
      const [row] = await this.statistics.getServiceFootprintCounts(filter);
      return row ? Number(row[countType]) : 0;
    }

    const methodMap = {
      assets: () => this.statistics.getAssetCounts(filter),
      targets: () => this.statistics.getTargetCounts(filter),
      techs: () => this.statistics.getTechCounts(filter),
    };

    const results = await methodMap[countType]();
    return results.length > 0 ? Number(results[0].count) : 0;
  }
}
