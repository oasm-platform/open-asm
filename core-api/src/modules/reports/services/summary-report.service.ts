import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vulnerability } from '@/modules/vulnerabilities/entities/vulnerability.entity';
import { Target } from '@/modules/targets/entities/target.entity';
import { AssetService } from '@/modules/assets/entities/asset-services.entity';
import { AssetTag } from '@/modules/assets/entities/asset-tags.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { StatisticService } from '@/modules/statistic/statistic.service';
import { Severity, VulnerabilityAnalyzeStatus, JobStatus } from '@/common/enums/enum';
import type { TargetType } from '@/modules/targets/entities/target.entity';
import type { ReportData } from '../types/report-data.type';

type RiskLevel = Exclude<Severity, Severity.INFO>;
type ScanStatus = VulnerabilityAnalyzeStatus | Exclude<JobStatus, JobStatus.CANCELLED>;

@Injectable()
export class SummaryReportService {
  constructor(
    @InjectRepository(Vulnerability)
    private readonly vulnRepo: Repository<Vulnerability>,
    @InjectRepository(Target)
    private readonly targetRepo: Repository<Target>,
    @InjectRepository(AssetService)
    private readonly assetServiceRepo: Repository<AssetService>,
    @InjectRepository(AssetTag)
    private readonly assetTagRepo: Repository<AssetTag>,
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    private readonly statisticService: StatisticService,
  ) {}

  async getSummaryReportData(
    workspaceId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      targetIds?: string[];
    },
  ): Promise<ReportData> {
    const now = new Date();
    const week = this.getWeekNumber(now);
    const year = now.getFullYear();

    // Fetch workspace name
    const workspace = await this.workspaceRepo.findOne({ where: { id: workspaceId } });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    // Calculate date ranges for weekly and monthly comparisons
    const weekStart = this.getWeekStart(now);
    const lastWeekStart = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    // Fetch all data in parallel
    const [
      currentTargets,
      lastWeekTargets,
      lastMonthTargets,
      currentAssets,
      lastWeekAssets,
      lastMonthAssets,
      currentServices,
      lastWeekServices,
      lastMonthServices,
      currentVulns,
      lastWeekVulns,
      lastMonthVulns,
      severityCounts,
      lastWeekSeverityCounts,
      lastMonthSeverityCounts,
      newVulnsThisWeek,
      newVulnsThisMonth,
      resolvedVulnsThisWeek,
      resolvedVulnsThisMonth,
      vulnerabilityTrends,
      newFindings,
      resolvedFindings,
      targets,
      vulnerabilityByTarget,
      scanCountThisMonth,
      newDomains,
      newIpAddresses,
      newPorts,
      newTechnologies,
    ] = await Promise.all([
      this.statisticService.getCountForWorkspace('targets', workspaceId, options),
      this.statisticService.getCountForWorkspace('targets', workspaceId, { ...options, startDate: lastWeekStart, endDate: weekStart }),
      this.statisticService.getCountForWorkspace('targets', workspaceId, { ...options, startDate: lastMonthStart, endDate: monthStart }),
      this.statisticService.getCountForWorkspace('assets', workspaceId, options),
      this.statisticService.getCountForWorkspace('assets', workspaceId, { ...options, startDate: lastWeekStart, endDate: weekStart }),
      this.statisticService.getCountForWorkspace('assets', workspaceId, { ...options, startDate: lastMonthStart, endDate: monthStart }),
      this.statisticService.getCountForWorkspace('services', workspaceId, options),
      this.statisticService.getCountForWorkspace('services', workspaceId, { ...options, startDate: lastWeekStart, endDate: weekStart }),
      this.statisticService.getCountForWorkspace('services', workspaceId, { ...options, startDate: lastMonthStart, endDate: monthStart }),
      this.statisticService.getCountForWorkspace('vulnerabilities', workspaceId, options),
      this.statisticService.getCountForWorkspace('vulnerabilities', workspaceId, { ...options, startDate: lastWeekStart, endDate: weekStart }),
      this.statisticService.getCountForWorkspace('vulnerabilities', workspaceId, { ...options, startDate: lastMonthStart, endDate: monthStart }),
      this.statisticService.getSeverityCounts(workspaceId, options),
      this.statisticService.getSeverityCounts(workspaceId, { ...options, startDate: lastWeekStart, endDate: weekStart }),
      this.statisticService.getSeverityCounts(workspaceId, { ...options, startDate: lastMonthStart, endDate: monthStart }),
      this.getNewVulnerabilityCount(workspaceId, weekStart, now),
      this.getNewVulnerabilityCount(workspaceId, monthStart, now),
      this.getResolvedVulnerabilityCount(workspaceId, weekStart, now),
      this.getResolvedVulnerabilityCount(workspaceId, monthStart, now),
      this.statisticService.getVulnerabilityTrends(workspaceId),
      this.getNewFindings(workspaceId, options),
      this.getResolvedFindings(workspaceId, options),
      this.getTargets(workspaceId, options),
      this.getVulnerabilityByTarget(workspaceId, options),
      this.getScanCount(workspaceId, monthStart, now),
      this.getNewTargetsByType(workspaceId, 'DOMAIN', weekStart, now),
      this.getNewTargetsByType(workspaceId, 'IP', weekStart, now),
      this.getNewPorts(workspaceId, weekStart, now),
      this.getNewTechnologies(workspaceId, weekStart, now),
    ]);

    // Calculate changes
    const targetsChange = currentTargets - lastWeekTargets;
    const assetsChange = currentAssets - lastWeekAssets;
    const servicesChange = currentServices - lastWeekServices;
    const vulnsChange = currentVulns - lastWeekVulns;

    const securityScore = StatisticService.calculateSecurityScore(severityCounts, currentAssets);
    const lastWeekScore = StatisticService.calculateSecurityScore(lastWeekSeverityCounts, currentAssets);
    const lastMonthScore = StatisticService.calculateSecurityScore(lastMonthSeverityCounts, currentAssets);
    const scoreChange = securityScore - lastWeekScore;

    // Build risk distribution
    const totalVulns = Object.values(severityCounts).reduce((sum, count) => sum + count, 0);
    const riskDistribution = [
      { level: Severity.CRITICAL as const, count: severityCounts[Severity.CRITICAL] || 0, percent: totalVulns > 0 ? ((severityCounts[Severity.CRITICAL] || 0) / totalVulns) * 100 : 0, color: '#dc2626' },
      { level: Severity.HIGH as const, count: severityCounts[Severity.HIGH] || 0, percent: totalVulns > 0 ? ((severityCounts[Severity.HIGH] || 0) / totalVulns) * 100 : 0, color: '#f97316' },
      { level: Severity.MEDIUM as const, count: severityCounts[Severity.MEDIUM] || 0, percent: totalVulns > 0 ? ((severityCounts[Severity.MEDIUM] || 0) / totalVulns) * 100 : 0, color: '#eab308' },
      { level: Severity.LOW as const, count: severityCounts[Severity.LOW] || 0, percent: totalVulns > 0 ? ((severityCounts[Severity.LOW] || 0) / totalVulns) * 100 : 0, color: '#3b82f6' },
    ];

    // Build date range string if options provided
    let dateRange: string | undefined;
    let dateRangeLabel: string | undefined;
    if (options?.startDate || options?.endDate) {
      const formatDate = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      if (options.startDate && options.endDate) {
        dateRange = `${formatDate(options.startDate)} - ${formatDate(options.endDate)}`;
        dateRangeLabel = 'Date Range';
      } else if (options.startDate) {
        dateRange = `From ${formatDate(options.startDate)}`;
        dateRangeLabel = 'Start Date';
      } else if (options.endDate) {
        dateRange = `Until ${formatDate(options.endDate)}`;
        dateRangeLabel = 'End Date';
      }
    }

    return {
      reportTitle: 'Attack Surface Discovery Report',
      week,
      year,
      exportedAt: now.toISOString(),
      classification: 'Strictly Confidential',
      systemName: 'Open Attack Surface Management',
      workspaceName: workspace.name,
      formattedDate: now.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      weekPad: String(week).padStart(2, '0'),
      systemNameChar: 'O',
      dateRange,
      dateRangeLabel,
      weekly: {
        totalTargets: currentTargets,
        targetsChange,
        targetsChangePercent: lastWeekTargets > 0 ? (targetsChange / lastWeekTargets) * 100 : 0,
        totalAssets: currentAssets,
        assetsChange,
        assetsChangePercent: lastWeekAssets > 0 ? (assetsChange / lastWeekAssets) * 100 : 0,
        totalServices: currentServices,
        servicesChange,
        servicesChangePercent: lastWeekServices > 0 ? (servicesChange / lastWeekServices) * 100 : 0,
        securityScore,
        scoreChange,
        scoreChangePercent: lastWeekScore > 0 ? (scoreChange / lastWeekScore) * 100 : 0,
        activeVulns: currentVulns,
        vulnsChange,
        vulnsChangePercent: lastWeekVulns > 0 ? (vulnsChange / lastWeekVulns) * 100 : 0,
        criticalVulns: severityCounts[Severity.CRITICAL] || 0,
        criticalChange: (severityCounts[Severity.CRITICAL] || 0) - (lastWeekSeverityCounts[Severity.CRITICAL] || 0),
        criticalChangePercent: (lastWeekSeverityCounts[Severity.CRITICAL] || 0) > 0
          ? (((severityCounts[Severity.CRITICAL] || 0) - (lastWeekSeverityCounts[Severity.CRITICAL] || 0)) / (lastWeekSeverityCounts[Severity.CRITICAL] || 0)) * 100
          : 0,
        highVulns: severityCounts[Severity.HIGH] || 0,
        mediumVulns: severityCounts[Severity.MEDIUM] || 0,
        lowVulns: severityCounts[Severity.LOW] || 0,
        infoVulns: severityCounts[Severity.INFO] || 0,
        newVulns: newVulnsThisWeek,
        resolvedVulns: resolvedVulnsThisWeek,
      },
      monthly: {
        totalTargets: currentTargets,
        targetsChange: currentTargets - lastMonthTargets,
        targetsChangePercent: lastMonthTargets > 0 ? ((currentTargets - lastMonthTargets) / lastMonthTargets) * 100 : 0,
        totalAssets: currentAssets,
        assetsChange: currentAssets - lastMonthAssets,
        assetsChangePercent: lastMonthAssets > 0 ? ((currentAssets - lastMonthAssets) / lastMonthAssets) * 100 : 0,
        totalServices: currentServices,
        servicesChange: currentServices - lastMonthServices,
        servicesChangePercent: lastMonthServices > 0 ? ((currentServices - lastMonthServices) / lastMonthServices) * 100 : 0,
        securityScore,
        scoreChange: securityScore - lastMonthScore,
        scoreChangePercent: lastMonthScore > 0 ? ((securityScore - lastMonthScore) / lastMonthScore) * 100 : 0,
        activeVulns: currentVulns,
        vulnsChange: currentVulns - lastMonthVulns,
        vulnsChangePercent: lastMonthVulns > 0 ? ((currentVulns - lastMonthVulns) / lastMonthVulns) * 100 : 0,
        criticalVulns: severityCounts[Severity.CRITICAL] || 0,
        criticalChange: (severityCounts[Severity.CRITICAL] || 0) - (lastMonthSeverityCounts[Severity.CRITICAL] || 0),
        criticalChangePercent: (lastMonthSeverityCounts[Severity.CRITICAL] || 0) > 0
          ? (((severityCounts[Severity.CRITICAL] || 0) - (lastMonthSeverityCounts[Severity.CRITICAL] || 0)) / (lastMonthSeverityCounts[Severity.CRITICAL] || 0)) * 100
          : 0,
        highVulns: severityCounts[Severity.HIGH] || 0,
        mediumVulns: severityCounts[Severity.MEDIUM] || 0,
        lowVulns: severityCounts[Severity.LOW] || 0,
        infoVulns: severityCounts[Severity.INFO] || 0,
        newVulns: newVulnsThisMonth,
        resolvedVulns: resolvedVulnsThisMonth,
        scansCompleted: scanCountThisMonth,
      },
      vulnerabilityTrends,
      newDiscoveries: {
        domains: newDomains,
        ipAddresses: newIpAddresses,
        ports: newPorts,
        technologies: newTechnologies,
      },
      newFindings,
      resolvedFindings,
      riskDistribution,
      targets,
      vulnerabilityByTarget,
    };
  }

  private async getNewVulnerabilityCount(
    workspaceId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    return this.vulnRepo
      .createQueryBuilder('v')
      .leftJoin('v.asset', 'asset')
      .leftJoin('asset.target', 'target')
      .leftJoin('target.workspaceTargets', 'wt')
      .leftJoin('wt.workspace', 'workspace')
      .where('workspace.id = :workspaceId', { workspaceId })
      .andWhere('v.isArchived = :isArchived', { isArchived: false })
      .andWhere('v.createdAt >= :startDate', { startDate })
      .andWhere('v.createdAt <= :endDate', { endDate })
      .getCount();
  }

  private async getResolvedVulnerabilityCount(
    workspaceId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    return this.vulnRepo
      .createQueryBuilder('v')
      .leftJoin('v.asset', 'asset')
      .leftJoin('asset.target', 'target')
      .leftJoin('target.workspaceTargets', 'wt')
      .leftJoin('wt.workspace', 'workspace')
      .leftJoin('v.vulnerabilityDismissal', 'dismissal')
      .where('workspace.id = :workspaceId', { workspaceId })
      .andWhere('v.isArchived = :isArchived', { isArchived: false })
      .andWhere('dismissal.id IS NOT NULL')
      .andWhere('dismissal.createdAt >= :startDate', { startDate })
      .andWhere('dismissal.createdAt <= :endDate', { endDate })
      .getCount();
  }

  private async getNewFindings(
    workspaceId: string,
    options?: { startDate?: Date; endDate?: Date; targetIds?: string[] },
    limit = 10,
  ) {
    const qb = this.vulnRepo
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.asset', 'asset')
      .leftJoin('asset.target', 'target')
      .leftJoin('target.workspaceTargets', 'wt')
      .leftJoin('wt.workspace', 'workspace')
      .where('workspace.id = :workspaceId', { workspaceId })
      .andWhere('v.isArchived = :isArchived', { isArchived: false })
      .andWhere('v.severity != :info', { info: 'info' })
      .orderBy('v.createdAt', 'DESC')
      .limit(limit);

    if (options?.startDate) {
      qb.andWhere('v.createdAt >= :startDate', { startDate: options.startDate });
    }
    if (options?.endDate) {
      qb.andWhere('v.createdAt <= :endDate', { endDate: options.endDate });
    }
    if (options?.targetIds?.length) {
      qb.andWhere('target.id IN (:...targetIds)', {
        targetIds: options.targetIds,
      });
    }

    const vulns = await qb.getMany();

    return vulns.map((v) => ({
      id: v.cveId?.[0] || v.fingerprint || v.id.substring(0, 8),
      title: v.name,
      severity: v.severity,
      cvss: v.cvssScore ?? 0,
      asset: v.asset?.value || 'Unknown',
      category: v.tags?.[0] || 'General',
      discovered: `${String(v.createdAt.getDate()).padStart(2, '0')}/${String(v.createdAt.getMonth() + 1).padStart(2, '0')}/${v.createdAt.getFullYear()}`,
      status: v.analyzeStatus,
    }));
  }

  private async getResolvedFindings(
    workspaceId: string,
    options?: { startDate?: Date; endDate?: Date; targetIds?: string[] },
    limit = 10,
  ) {
    const dismissedQb = this.vulnRepo
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.asset', 'asset')
      .leftJoin('asset.target', 'target')
      .leftJoin('target.workspaceTargets', 'wt')
      .leftJoin('wt.workspace', 'workspace')
      .leftJoinAndSelect('v.vulnerabilityDismissal', 'dismissal')
      .where('workspace.id = :workspaceId', { workspaceId })
      .andWhere('dismissal.id IS NOT NULL')
      .orderBy('dismissal.createdAt', 'DESC')
      .limit(limit);

    if (options?.startDate) {
      dismissedQb.andWhere('dismissal.createdAt >= :startDate', { startDate: options.startDate });
    }
    if (options?.endDate) {
      dismissedQb.andWhere('dismissal.createdAt <= :endDate', { endDate: options.endDate });
    }
    if (options?.targetIds?.length) {
      dismissedQb.andWhere('target.id IN (:...targetIds)', {
        targetIds: options.targetIds,
      });
    }

    const dismissedVulns = await dismissedQb.getMany();

    const archivedQb = this.vulnRepo
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.asset', 'asset')
      .leftJoin('asset.target', 'target')
      .leftJoin('target.workspaceTargets', 'wt')
      .leftJoin('wt.workspace', 'workspace')
      .where('workspace.id = :workspaceId', { workspaceId })
      .andWhere('v.isArchived = :isArchived', { isArchived: true })
      .orderBy('v.updatedAt', 'DESC')
      .limit(limit);

    if (options?.startDate) {
      archivedQb.andWhere('v.updatedAt >= :startDate', { startDate: options.startDate });
    }
    if (options?.endDate) {
      archivedQb.andWhere('v.updatedAt <= :endDate', { endDate: options.endDate });
    }
    if (options?.targetIds?.length) {
      archivedQb.andWhere('target.id IN (:...targetIds)', {
        targetIds: options.targetIds,
      });
    }

    const archivedVulns = await archivedQb.getMany();

    const allVulns = new Map<string, Vulnerability>();
    for (const v of [...dismissedVulns, ...archivedVulns]) {
      if (!allVulns.has(v.id)) {
        allVulns.set(v.id, v);
      }
    }

    const now = new Date();
    return Array.from(allVulns.values())
      .slice(0, limit)
      .map((v) => {
        const resolvedDate = v.vulnerabilityDismissal?.createdAt || v.updatedAt;
        const daysOpen = Math.max(
          0,
          Math.floor((now.getTime() - v.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
        );
        return {
          id: v.cveId?.[0] || v.fingerprint || v.id.substring(0, 8),
          title: v.name,
          resolved: this.formatDate(resolvedDate),
          daysOpen,
        };
      });
  }

  private async getTargets(
    workspaceId: string,
    options?: { startDate?: Date; endDate?: Date; targetIds?: string[] },
    limit = 10,
  ) {
    const qb = this.targetRepo
      .createQueryBuilder('t')
      .leftJoin('t.workspaceTargets', 'wt')
      .leftJoin('wt.workspace', 'workspace')
      .leftJoin('t.assets', 'asset')
      .leftJoin('asset.vulnerabilities', 'v')
      .leftJoin('asset.jobs', 'job')
      .where('workspace.id = :workspaceId', { workspaceId })
      .andWhere('v.isArchived = :isArchived', { isArchived: false })
      .select('t.id', 't_id')
      .addSelect('t.value', 't_value')
      .addSelect('t.type', 't_type')
      .addSelect('t.lastDiscoveredAt', 't_lastDiscoveredAt')
      .addSelect('COUNT(DISTINCT v.id)', 'vulnCount')
      .addSelect(
        `CASE
          WHEN COUNT(CASE WHEN job.status = '${JobStatus.IN_PROGRESS}' THEN 1 END) > 0 THEN '${JobStatus.IN_PROGRESS}'
          WHEN COUNT(CASE WHEN job.status = '${JobStatus.PENDING}' THEN 1 END) > 0 THEN '${JobStatus.PENDING}'
          WHEN COUNT(CASE WHEN job.status = '${JobStatus.COMPLETED}' THEN 1 END) > 0 THEN '${JobStatus.COMPLETED}'
          ELSE '${JobStatus.COMPLETED}'
        END`,
        'targetStatus',
      )
      .groupBy('t.id')
      .addGroupBy('t.value')
      .addGroupBy('t.type')
      .addGroupBy('t.lastDiscoveredAt')
      .orderBy('COUNT(DISTINCT v.id)', 'DESC')
      .limit(limit);

    if (options?.startDate) {
      qb.andWhere('v.createdAt >= :startDate', { startDate: options.startDate });
    }
    if (options?.endDate) {
      qb.andWhere('v.createdAt <= :endDate', { endDate: options.endDate });
    }
    if (options?.targetIds?.length) {
      qb.andWhere('t.id IN (:...targetIds)', { targetIds: options.targetIds });
    }

    const targets = await qb.getRawMany<{
      t_id: string;
      t_value: string;
      t_type: TargetType;
      t_lastDiscoveredAt: Date | null;
      vulnCount: string;
      targetStatus: string;
    }>();

    return targets.map((t) => ({
      id: t.t_id,
      identifier: t.t_value,
      type: t.t_type,
      status: t.targetStatus as ScanStatus,
      riskLevel: this.getRiskLevel(parseInt(t.vulnCount, 10)),
      provider: 'OpenASM',
      lastScan: t.t_lastDiscoveredAt
        ? this.formatDate(t.t_lastDiscoveredAt)
        : 'Never',
    }));
  }

  private async getVulnerabilityByTarget(
    workspaceId: string,
    options?: { startDate?: Date; endDate?: Date; targetIds?: string[] },
  ) {
    const qb = this.targetRepo
      .createQueryBuilder('t')
      .leftJoin('t.workspaceTargets', 'wt')
      .leftJoin('wt.workspace', 'workspace')
      .leftJoin('t.assets', 'asset')
      .leftJoin('asset.vulnerabilities', 'v')
      .select('t.value', 'targetValue')
      .addSelect('t.type', 'targetType')
      .addSelect(
        `SUM(CASE WHEN v.severity = 'critical' THEN 1 ELSE 0 END)`,
        'critical',
      )
      .addSelect(
        `SUM(CASE WHEN v.severity = 'high' THEN 1 ELSE 0 END)`,
        'high',
      )
      .addSelect(
        `SUM(CASE WHEN v.severity = 'medium' THEN 1 ELSE 0 END)`,
        'medium',
      )
      .addSelect(
        `SUM(CASE WHEN v.severity = 'low' THEN 1 ELSE 0 END)`,
        'low',
      )
      .addSelect('COUNT(v.id)', 'total')
      .where('workspace.id = :workspaceId', { workspaceId })
      .andWhere('v.isArchived = :isArchived', { isArchived: false })
      .groupBy('t.id')
      .addGroupBy('t.value')
      .addGroupBy('t.type')
      .having('COUNT(v.id) > 0')
      .orderBy('COUNT(v.id)', 'DESC');

    if (options?.startDate) {
      qb.andWhere('v.createdAt >= :startDate', { startDate: options.startDate });
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
      total: string;
    }>();

    return results.map((r) => ({
      target: r.targetValue,
      type: r.targetType as TargetType,
      critical: parseInt(r.critical, 10),
      high: parseInt(r.high, 10),
      medium: parseInt(r.medium, 10),
      low: parseInt(r.low, 10),
      total: parseInt(r.total, 10),
    }));
  }

  private async getScanCount(
    workspaceId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    // Count distinct job history entries as scans
    const qb = this.vulnRepo
      .createQueryBuilder('v')
      .leftJoin('v.asset', 'asset')
      .leftJoin('asset.target', 'target')
      .leftJoin('target.workspaceTargets', 'wt')
      .leftJoin('wt.workspace', 'workspace')
      .select('COUNT(DISTINCT v.jobHistoryId)', 'count')
      .where('workspace.id = :workspaceId', { workspaceId })
      .andWhere('v.createdAt >= :startDate', { startDate })
      .andWhere('v.createdAt <= :endDate', { endDate });

    const result = await qb.getRawOne<{ count: string }>();
    return result?.count ? parseInt(result.count, 10) : 0;
  }

  private async getNewTargetsByType(
    workspaceId: string,
    type: string,
    startDate: Date,
    endDate: Date,
  ) {
    const results = await this.targetRepo
      .createQueryBuilder('t')
      .leftJoin('t.workspaceTargets', 'wt')
      .leftJoin('wt.workspace', 'workspace')
      .leftJoin('t.assets', 'asset')
      .leftJoin('asset.vulnerabilities', 'v')
      .select('t.value', 'identifier')
      .addSelect('t.createdAt', 'discovered')
      .addSelect('COUNT(v.id)', 'vulnCount')
      .where('workspace.id = :workspaceId', { workspaceId })
      .andWhere('t.type = :type', { type })
      .andWhere('t.createdAt >= :startDate', { startDate })
      .andWhere('t.createdAt <= :endDate', { endDate })
      .groupBy('t.id')
      .addGroupBy('t.value')
      .addGroupBy('t.createdAt')
      .orderBy('t.createdAt', 'DESC')
      .limit(10)
      .getRawMany<{ identifier: string; discovered: Date; vulnCount: string }>();

    return results.map((r) => ({
      identifier: r.identifier,
      discovered: this.formatDate(r.discovered),
      provider: 'OpenASM',
      riskLevel: this.getRiskLevel(parseInt(r.vulnCount, 10)),
    }));
  }

  private async getNewPorts(
    workspaceId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const results = await this.assetServiceRepo
      .createQueryBuilder('as')
      .leftJoin('as.asset', 'asset')
      .leftJoin('asset.target', 'target')
      .leftJoin('target.workspaceTargets', 'wt')
      .leftJoin('wt.workspace', 'workspace')
      .leftJoin('asset.vulnerabilities', 'v', 'v.ports @> ARRAY["as".port::text]')
      .select('as.port', 'port')
      .addSelect('as.value', 'service')
      .addSelect('as.createdAt', 'discovered')
      .addSelect('target.value', 'targetValue')
      .addSelect('COUNT(v.id)', 'vulnCount')
      .where('workspace.id = :workspaceId', { workspaceId })
      .andWhere('as.createdAt >= :startDate', { startDate })
      .andWhere('as.createdAt <= :endDate', { endDate })
      .groupBy('as.id')
      .addGroupBy('as.port')
      .addGroupBy('as.value')
      .addGroupBy('as.createdAt')
      .addGroupBy('target.value')
      .orderBy('as.createdAt', 'DESC')
      .limit(10)
      .getRawMany<{
        port: number;
        service: string;
        discovered: Date;
        targetValue: string;
        vulnCount: string;
      }>();

    return results.map((r) => ({
      port: r.port,
      service: r.service,
      discovered: this.formatDate(r.discovered),
      target: r.targetValue,
      riskLevel: this.getRiskLevel(parseInt(r.vulnCount, 10)),
    }));
  }

  private async getNewTechnologies(
    workspaceId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const results = await this.assetTagRepo
      .createQueryBuilder('at')
      .leftJoin('at.assetService', 'as')
      .leftJoin('as.asset', 'asset')
      .leftJoin('asset.target', 'target')
      .leftJoin('target.workspaceTargets', 'wt')
      .leftJoin('wt.workspace', 'workspace')
      .select('at.tag', 'name')
      .addSelect('at.createdAt', 'discovered')
      .addSelect('target.value', 'targetValue')
      .where('workspace.id = :workspaceId', { workspaceId })
      .andWhere('at.createdAt >= :startDate', { startDate })
      .andWhere('at.createdAt <= :endDate', { endDate })
      .groupBy('at.id')
      .addGroupBy('at.tag')
      .addGroupBy('at.createdAt')
      .addGroupBy('target.value')
      .orderBy('at.createdAt', 'DESC')
      .limit(10)
      .getRawMany<{ name: string; discovered: Date; targetValue: string }>();

    return results.map((r) => ({
      name: r.name,
      discovered: this.formatDate(r.discovered),
      target: r.targetValue,
      category: 'Technology',
    }));
  }

  private formatDate(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  private getRiskLevel(vulnCount: number): RiskLevel {
    if (vulnCount >= 10) return Severity.CRITICAL;
    if (vulnCount >= 5) return Severity.HIGH;
    if (vulnCount >= 2) return Severity.MEDIUM;
    return Severity.LOW;
  }

  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  }

  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }
}
