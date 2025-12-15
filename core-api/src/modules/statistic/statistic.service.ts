import { Injectable } from '@nestjs/common';
import { DataSource, MoreThanOrEqual } from 'typeorm';

import { SortOrder } from '@/common/dtos/get-many-base.dto';
import { GeoIp, GeoIpService } from '@/services/geo-ip/geo-ip.service';
import { AssetsService } from '../assets/assets.service';
import { AssetService } from '../assets/entities/asset-services.entity';
import { AssetTag } from '../assets/entities/asset-tags.entity';
import { Asset } from '../assets/entities/assets.entity';
import { HttpResponse } from '../assets/entities/http-response.entity';
import { Target } from '../targets/entities/target.entity';
import { WorkspaceTarget } from '../targets/entities/workspace-target.entity';
import { Vulnerability } from '../vulnerabilities/entities/vulnerability.entity';
import { Workspace } from '../workspaces/entities/workspace.entity';
import { IssuesTimelineResponseDto } from './dto/issues-timeline.dto';
import {
  GetStatisticQueryDto,
  StatisticResponseDto,
} from './dto/statistic.dto';
import { TimelineResponseDto } from './dto/timeline.dto';
import { TopAssetVulnerabilities } from './dto/top-assets-vulnerabilities.dto';
import { TopTagAsset } from './dto/top-tags-assets.dto';
import { Statistic } from './entities/statistic.entity';

interface RawAssetVulCount {
  id: string;
  value: string;
  critical: string;
  high: string;
  medium: string;
  low: string;
  info: string;
  total: string;
}

@Injectable()
export class StatisticService {
  constructor(
    private readonly dataSource: DataSource,
    private assetService: AssetsService,
    private geoIpService: GeoIpService,
  ) {}

  /**
   * Retrieves the total count of targets in a workspace directly from the database.
   *
   * @param workspaceId - The ID of the workspace.
   * @returns A promise that resolves to the total count of targets.
   */
  private async countTargets(workspaceId: string): Promise<number> {
    return this.dataSource
      .getRepository(WorkspaceTarget)
      .count({ where: { workspace: { id: workspaceId } } });
  }

  /**
   * Retrieves the total count of assets in a workspace directly from the database.
   *
   * @param workspaceId - The ID of the workspace.
   * @returns A promise that resolves to the total count of assets.
   */
  private async countAssets(workspaceId: string): Promise<number> {
    return this.dataSource
      .getRepository(Asset)
      .createQueryBuilder('asset')
      .innerJoin('asset.target', 'target')
      .innerJoin('target.workspaceTargets', 'workspaceTarget')
      .where('workspaceTarget.workspace.id = :workspaceId', { workspaceId })
      .getCount();
  }

  /**
   * Retrieves the total count of vulnerabilities in a workspace directly from the database.
   *
   * @param workspaceId - The ID of the workspace.
   * @returns A promise that resolves to the total count of vulnerabilities.
   */
  private async countVulnerabilities(workspaceId: string): Promise<number> {
    return (
      this.dataSource
        .getRepository(Vulnerability)
        .createQueryBuilder('vulnerability')
        .innerJoin('vulnerability.asset', 'asset')
        .innerJoin('asset.target', 'target')
        .innerJoin('target.workspaceTargets', 'workspaceTarget')
        .where('workspaceTarget.workspace.id = :workspaceId', { workspaceId })
        // .andWhere('asset."isErrorPage" = false')
        .getCount()
    );
  }

  /**
   * Retrieves the total count of unique technologies in a workspace directly from the database.
   *
   * @param workspaceId - The ID of the workspace.
   * @returns A promise that resolves to the total count of unique technologies.
   */
  private async countUniqueTechnologies(workspaceId: string): Promise<number> {
    const result = await this.dataSource
      .getRepository(HttpResponse)
      .createQueryBuilder('httpResponse')
      .select('DISTINCT UNNEST(httpResponse.tech)', 'technology')
      .innerJoin('httpResponse.assetService', 'assetService')
      .innerJoin('assetService.asset', 'asset')
      .innerJoin('asset.target', 'target')
      .innerJoin('target.workspaceTargets', 'workspaceTarget')
      .where('workspaceTarget.workspace.id = :workspaceId', { workspaceId })
      // .andWhere('asset."isErrorPage" = false')
      .getRawMany();

    return result.length;
  }

  /**
   * Retrieves the total count of unique ports in a workspace directly from the database.
   *
   * @param workspaceId - The ID of the workspace.
   * @returns A promise that resolves to the total count of unique ports.
   */
  private async countUniquePorts(workspaceId: string): Promise<number> {
    const result = await this.dataSource
      .createQueryBuilder()
      .select('COUNT(DISTINCT unnest_port)', 'count')
      .from((subQuery) => {
        return subQuery
          .select('unnest(port.ports)', 'unnest_port')
          .from('ports', 'port')
          .innerJoin('assets', 'asset', 'port."assetId" = asset.id')
          .innerJoin('targets', 'target', 'asset."targetId" = target.id')
          .innerJoin(
            'workspace_targets',
            'workspaceTarget',
            '"workspaceTarget"."targetId" = target.id',
          )
          .where('"workspaceTarget"."workspaceId" = :workspaceId', {
            workspaceId,
          });
        // .andWhere('asset."isErrorPage" = false');
      }, 'unnested')
      .getRawOne<{ count: string }>();
    return Number(result?.count || 0);
  }

  /**
   * Retrieves the total count of targets in a workspace.
   *
   * @param query - The query parameters containing workspaceId.
   * @returns A promise that resolves to the total count of targets.
   */
  async getTotalTargets(query: GetStatisticQueryDto): Promise<number> {
    return this.countTargets(query.workspaceId);
  }

  /**
   * Retrieves the total count of assets in a workspace.
   *
   * @param query - The query parameters containing workspaceId.
   * @returns A promise that resolves to the total count of assets.
   */
  async getTotalAssets(query: GetStatisticQueryDto): Promise<number> {
    return this.countAssets(query.workspaceId);
  }

  /**
   * Retrieves the total count of vulnerabilities in a workspace.
   *
   * @param query - The query parameters containing workspaceId.
   * @returns A promise that resolves to the total count of vulnerabilities.
   */
  async getTotalVulnerabilities(query: GetStatisticQueryDto): Promise<number> {
    return this.countVulnerabilities(query.workspaceId);
  }

  /**
   * Retrieves the total count of unique technologies in a workspace.
   *
   * @param query - The query parameters containing workspaceId.
   * @returns A promise that resolves to the total count of unique technologies.
   */
  async getTotalUniqueTechnologies(
    query: GetStatisticQueryDto,
  ): Promise<number> {
    return this.countUniqueTechnologies(query.workspaceId);
  }

  /**
   * Retrieves the total count of unique ports in a workspace.
   *
   * @param query - The query parameters containing workspaceId.
   * @returns A promise that resolves to the total count of unique ports.
   */
  async getTotalUniquePorts(query: GetStatisticQueryDto): Promise<number> {
    return this.countUniquePorts(query.workspaceId);
  }

  /**
   * Retrieves all statistics for a workspace.
   *
   * @param query - The query parameters containing workspaceId.
   * @returns A promise that resolves to an object containing all statistics.
   */
  async getStatistics(
    query: GetStatisticQueryDto,
  ): Promise<StatisticResponseDto> {
    const statistics = await this.calculateStatistics([query.workspaceId]);
    if (statistics.length === 0) {
      // Return default values if no statistics found for the workspace
      return {
        assets: 0,
        targets: 0,
        vuls: 0,
        criticalVuls: 0,
        highVuls: 0,
        mediumVuls: 0,
        lowVuls: 0,
        infoVuls: 0,
        techs: 0,
        ports: 0,
        score: 0, // Default score when no statistics found
      };
    }

    const workspaceStats = statistics[0]; // Get the first (and only) workspace statistics

    return {
      assets: workspaceStats.assets,
      targets: workspaceStats.targets,
      vuls: workspaceStats.vuls,
      criticalVuls: workspaceStats.criticalVuls,
      highVuls: workspaceStats.highVuls,
      mediumVuls: workspaceStats.mediumVuls,
      lowVuls: workspaceStats.lowVuls,
      infoVuls: workspaceStats.infoVuls,
      techs: workspaceStats.techs,
      ports: workspaceStats.ports,
      score: workspaceStats.score,
    };
  }

  /**
   * Retrieves timeline statistics for a workspace within the last 3 months
   *
   * @param query - The query parameters containing workspaceId
   * @returns A promise that resolves to timeline statistics
   */
  async getTimelineStatistics(
    workspaceId: string,
  ): Promise<TimelineResponseDto> {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const statistics = await this.dataSource.getRepository(Statistic).find({
      where: {
        workspace: { id: workspaceId },
        createdAt: MoreThanOrEqual(threeMonthsAgo),
      },
      order: {
        createdAt: 'ASC',
      },
    });

    const now = await this.calculateStatistics([workspaceId]).then((res) => {
      const data = res[0];
      data.createdAt = new Date();
      data.updatedAt = new Date();
      return data;
    });

    return {
      data: statistics.concat(now),
      total: statistics.length,
    };
  }

  /**
   * Retrieves issues timeline statistics for a workspace.
   *
   * @param workspaceId - The ID of the workspace.
   * @returns A promise that resolves to issues timeline statistics.
   */
  async getIssuesTimeline(
    workspaceId: string,
  ): Promise<IssuesTimelineResponseDto> {
    const rawResults: { vuls: number; createdAt: Date }[] =
      await this.dataSource
        .getRepository(Statistic)
        .createQueryBuilder('workspace_statistics')
        .select('vuls, "createdAt"')
        .where('"workspaceId" = :workspaceId', { workspaceId })
        .andWhere('"createdAt" >= :threeMonthsAgo', {
          threeMonthsAgo: new Date(
            new Date().setMonth(new Date().getMonth() - 3),
          ),
        })
        .getRawMany();

    return {
      data: rawResults,
      total: rawResults.length,
    };
  }

  async getTopTagsAssets(workspaceId: string): Promise<TopTagAsset[]> {
    const rawResults: { tag: string; count: string }[] = await this.dataSource
      .getRepository(AssetTag)
      .createQueryBuilder('asset_tag')
      .select('asset_tag.tag', 'tag')
      .addSelect('COUNT(asset_tag.id)', 'count')
      .innerJoin('asset_tag.assetService', 'assetService')
      .innerJoin('assetService.asset', 'asset')
      .innerJoin('asset.target', 'target')
      .innerJoin('target.workspaceTargets', 'workspaceTarget')
      .where('workspaceTarget.workspace.id = :workspaceId', { workspaceId })
      // .andWhere('asset."isErrorPage" = false')
      .groupBy('asset_tag.tag')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    return rawResults.map((result) => ({
      tag: result.tag,
      count: parseInt(result.count, 10),
    }));
  }

  async getTopAssetsWithMostVulnerabilities(
    workspaceId: string,
  ): Promise<TopAssetVulnerabilities[]> {
    const rawResults: RawAssetVulCount[] = await this.dataSource
      .getRepository(Asset)
      .createQueryBuilder('asset')
      .select('asset.id', 'id')
      .addSelect('asset.value', 'value')
      .addSelect(
        "COUNT(CASE WHEN v.severity = 'critical' THEN 1 ELSE NULL END)",
        'critical',
      )
      .addSelect(
        "COUNT(CASE WHEN v.severity = 'high' THEN 1 ELSE NULL END)",
        'high',
      )
      .addSelect(
        "COUNT(CASE WHEN v.severity = 'medium' THEN 1 ELSE NULL END)",
        'medium',
      )
      .addSelect(
        "COUNT(CASE WHEN v.severity = 'low' THEN 1 ELSE NULL END)",
        'low',
      )
      .addSelect(
        "COUNT(CASE WHEN v.severity = 'info' THEN 1 ELSE NULL END)",
        'info',
      )
      .addSelect('COUNT(v.id)', 'total')
      .leftJoin('asset.vulnerabilities', 'v')
      .innerJoin('asset.target', 'target')
      .innerJoin('target.workspaceTargets', 'workspaceTarget')
      .where('workspaceTarget.workspace.id = :workspaceId', { workspaceId })
      // .andWhere('asset."isErrorPage" = false')
      .groupBy('asset.id, asset.value')
      .orderBy('total', 'DESC')
      .limit(10)
      .getRawMany();

    return rawResults.map((result) => ({
      id: result.id,
      value: result.value,
      critical: parseInt(result.critical, 10),
      high: parseInt(result.high, 10),
      medium: parseInt(result.medium, 10),
      low: parseInt(result.low, 10),
      info: parseInt(result.info, 10),
      total: parseInt(result.total, 10),
    }));
  }

  /**
   * Retrieves the location of assets in a workspace.
   * @param workspaceId
   * @returns
   */
  async getAssetLocations(workspaceId: string): Promise<GeoIp[]> {
    const assets = await this.assetService.getIpAssets(
      {
        page: 1,
        limit: 1000,
        sortBy: 'createdAt',
        value: '',
        sortOrder: SortOrder.DESC,
      },
      workspaceId,
    );
    const ips = assets.data.map((i) => i.ip);
    if (ips.length === 0) {
      return [];
    }

    const geoIps = await this.geoIpService.getGeoIp(ips);

    return geoIps.filter((i) => i.lat && i.lon);
  }

  /**
   * Retrieves the count of assets for each workspace.
   * Only includes assets that are not error pages.
   * @param workspaceIds An array of workspace IDs.
   * @returns An array of objects containing the workspaceId and asset count.
   */
  async getAssetCounts(workspaceIds: string[]) {
    return (
      this.dataSource
        .getRepository(Asset)
        .createQueryBuilder('asset')
        .leftJoin('asset.target', 'target')
        .leftJoin('target.workspaceTargets', 'wt')
        .select('wt.workspaceId', 'workspaceId')
        .addSelect('COUNT(asset.id)', 'count')
        .where('wt.workspaceId IN (:...workspaceIds)', { workspaceIds })
        // .andWhere('asset.isErrorPage = false') // Only count assets that are not error pages
        .groupBy('wt.workspaceId')
        .getRawMany<{ workspaceId: string; count: string }>()
    );
  }

  /**
   * Retrieves the count of targets for each workspace.
   * @param workspaceIds An array of workspace IDs.
   * @returns An array of objects containing the workspaceId and target count.
   */
  async getTargetCounts(workspaceIds: string[]) {
    return this.dataSource
      .getRepository(Target)
      .createQueryBuilder('target')
      .leftJoin('target.workspaceTargets', 'wt')
      .select('wt.workspaceId', 'workspaceId')
      .addSelect('COUNT(target.id)', 'count')
      .where('wt.workspaceId IN (:...workspaceIds)', { workspaceIds })
      .groupBy('wt.workspaceId')
      .getRawMany<{ workspaceId: string; count: string }>();
  }

  /**
   * Retrieves the count of vulnerabilities for each workspace, grouped by severity.
   * @param workspaceIds An array of workspace IDs.
   * @returns An array of objects containing the workspaceId, severity, and vulnerability count.
   */
  async getVulnerabilityCounts(workspaceIds: string[]) {
    return this.dataSource
      .getRepository(Vulnerability)
      .createQueryBuilder('vuln')
      .leftJoin('vuln.asset', 'asset')
      .leftJoin('asset.target', 'target')
      .leftJoin('target.workspaceTargets', 'wt')
      .select('wt.workspaceId', 'workspaceId')
      .addSelect('vuln.severity', 'severity')
      .addSelect('COUNT(vuln.id)', 'count')
      .where('wt.workspaceId IN (:...workspaceIds)', { workspaceIds })
      .groupBy('wt.workspaceId, vuln.severity')
      .getRawMany<{ workspaceId: string; severity: string; count: string }>();
  }

  /**
   * Retrieves the count of unique technologies for each workspace.
   * Uses a subquery to unnest the technology array and count distinct values.
   * @param workspaceIds An array of workspace IDs.
   * @returns An array of objects containing the workspaceId and unique technology count.
   */
  async getTechCounts(workspaceIds: string[]) {
    // Subquery to unnest the 'tech' array from HttpResponse and link to workspaceId
    const subQuery = this.dataSource
      .createQueryBuilder()
      .select('wt.workspaceId', 'workspaceId')
      .addSelect('unnest(http.tech)', 'tech') // Unnest the 'tech' array
      .from(HttpResponse, 'http')
      .leftJoin('http.assetService', 'assetService')
      .leftJoin('assetService.asset', 'asset')
      .leftJoin('asset.target', 'target')
      .leftJoin('target.workspaceTargets', 'wt')
      .where('wt.workspaceId IN (:...workspaceIds)', { workspaceIds });

    // Main query to count distinct technologies for each workspaceId
    return this.dataSource
      .createQueryBuilder()
      .select('sq."workspaceId"', 'workspaceId')
      .addSelect('COUNT(DISTINCT sq.tech)', 'count') // Count distinct technologies
      .from(`(${subQuery.getQuery()})`, 'sq')
      .setParameters(subQuery.getParameters())
      .groupBy('sq."workspaceId"')
      .getRawMany<{ workspaceId: string; count: string }>();
  }

  /**
   * Retrieves the count of unique ports for each workspace.
   * Uses a subquery to unnest the ports array and count distinct values.
   * @param workspaceIds An array of workspace IDs.
   * @returns An array of objects containing the workspaceId and unique port count.
   */
  async getPortCounts(workspaceIds: string[]) {
    // Subquery to unnest the 'ports' array from Port and link to workspaceId
    const subQuery = this.dataSource
      .createQueryBuilder()
      .select('wt.workspaceId', 'workspaceId')
      .addSelect('assetService.port', 'port')
      .from(AssetService, 'assetService')
      .leftJoin('assetService.asset', 'asset')
      .leftJoin('asset.target', 'target')
      .leftJoin('target.workspaceTargets', 'wt')
      .where('wt.workspaceId IN (:...workspaceIds)', { workspaceIds });

    // Main query to count distinct ports for each workspaceId
    return this.dataSource
      .createQueryBuilder()
      .select('sq."workspaceId"', 'workspaceId')
      .addSelect('COUNT(DISTINCT sq.port)', 'count') // Count distinct ports
      .from(`(${subQuery.getQuery()})`, 'sq')
      .setParameters(subQuery.getParameters())
      .groupBy('sq."workspaceId"')
      .getRawMany<{ workspaceId: string; count: string }>();
  }

  /**
   * Calculates statistics for specified workspaces without saving them to the database.
   * - Retrieves counts for assets, targets, vulnerabilities, technologies, and ports for each workspace using concurrent queries.
   * - Aggregates the data into Statistic objects.
   * @param workspaceIds Array of workspace IDs to calculate statistics for
   * @returns An array of Statistic objects with calculated data
   */
  async calculateStatistics(workspaceIds: string[]): Promise<Statistic[]> {
    if (workspaceIds.length === 0) {
      // No workspace IDs provided, no statistics to calculate
      return [];
    }

    // Fetch counts for each data type concurrently using Promise.all
    const [
      assetCounts,
      targetCounts,
      vulnerabilityCounts,
      techCounts,
      portCounts,
    ] = await Promise.all([
      this.getAssetCounts(workspaceIds),
      this.getTargetCounts(workspaceIds),
      this.getVulnerabilityCounts(workspaceIds),
      this.getTechCounts(workspaceIds),
      this.getPortCounts(workspaceIds),
    ]);

    // Initialize a Map to store statistics for each workspace
    const statisticsMap = new Map<string, Statistic>();

    // Initialize default statistic objects for each workspace
    for (const id of workspaceIds) {
      const statistic = new Statistic();
      statistic.workspace = { id } as Workspace; // Assign workspace
      statistic.assets = 0;
      statistic.targets = 0;
      statistic.vuls = 0;
      statistic.criticalVuls = 0;
      statistic.highVuls = 0;
      statistic.mediumVuls = 0;
      statistic.lowVuls = 0;
      statistic.infoVuls = 0;
      statistic.techs = 0;
      statistic.ports = 0;
      statistic.score = 0; // Initialize score to 0
      statisticsMap.set(id, statistic);
    }

    // Update asset counts in the statistics Map
    assetCounts.forEach((row) => {
      const stat = statisticsMap.get(row.workspaceId);
      if (stat) stat.assets = Number(row.count);
    });

    // Update target counts in the statistics Map
    targetCounts.forEach((row) => {
      const stat = statisticsMap.get(row.workspaceId);
      if (stat) stat.targets = Number(row.count);
    });

    // Update vulnerability counts and categorize by severity
    vulnerabilityCounts.forEach((row) => {
      const stat = statisticsMap.get(row.workspaceId);
      if (stat) {
        stat.vuls += Number(row.count); // Total vulnerabilities
        switch (row.severity) {
          case 'critical':
            stat.criticalVuls = Number(row.count);
            break;
          case 'high':
            stat.highVuls = Number(row.count);
            break;
          case 'medium':
            stat.mediumVuls = Number(row.count);
            break;
          case 'low':
            stat.lowVuls = Number(row.count);
            break;
          case 'info':
            stat.infoVuls = Number(row.count);
            break;
        }
      }
    });

    // Update technology counts in the statistics Map
    techCounts.forEach((row) => {
      const stat = statisticsMap.get(row.workspaceId);
      if (stat) stat.techs = Number(row.count);
    });

    // Update port counts in the statistics Map
    portCounts.forEach((row) => {
      const stat = statisticsMap.get(row.workspaceId);
      if (stat) stat.ports = Number(row.count);
    });

    // Calculate scores for each workspace
    const alpha = 0.3; // asset weight
    const beta = 0.7; // vuln weight

    for (const [, stat] of statisticsMap) {
      const {
        criticalVuls,
        highVuls,
        mediumVuls,
        lowVuls,
        infoVuls,
        assets: totalAssets,
      } = stat;

      // Only calculate score if there are assets to avoid division by zero
      if (totalAssets > 0) {
        // Total risk score of vulnerabilities
        const vulRisk =
          criticalVuls * 5 +
          highVuls * 3 +
          mediumVuls * 2 +
          lowVuls * 1 +
          infoVuls * 0.5;

        // Normalize risk to 0-10 scale according to workspace size
        const Rvuln = Math.min(10, vulRisk / totalAssets);

        // Risk according to asset scale (more assets = higher potential risk)
        const Rasset = Math.min(10, totalAssets / 100); // example: above 10 assets then max risk is 10

        // Total calculation
        const totalScore = Math.max(0, 10 - (alpha * Rasset + beta * Rvuln));

        // Ensure score is exactly 10 when no vulnerabilities and assets exist
        let finalScore: number;
        if (vulRisk === 0) {
          finalScore = 10;
        } else {
          finalScore = Math.round(totalScore * 10) / 10;
        }

        // If the score is a whole number (like 10.0, 9.0), return as integer
        stat.score =
          Math.round(finalScore) === finalScore
            ? Math.round(finalScore)
            : finalScore;
      } else {
        // If no assets, set score to maximum (best security score)
        stat.score = 10;
      }
    }

    // Convert the Map to an array and return
    return Array.from(statisticsMap.values());
  }

  /**
   * Retrieves all workspace IDs from the database.
   * @returns An array of workspace IDs
   */
  async getWorkspaceIds(): Promise<string[]> {
    const workspaces = await this.dataSource
      .getRepository(Workspace)
      .find({ select: ['id'] });
    return workspaces.map((workspace) => workspace.id);
  }

  /**
   * Saves an array of Statistic objects to the database.
   * @param statistics An array of Statistic objects to save
   */
  async saveStatistics(statistics: Statistic[]): Promise<void> {
    await this.dataSource.getRepository(Statistic).save(statistics);
  }

  /**
   * Handles the cron task to calculate and store statistics.
   * - Fetches all workspaces.
   * - Retrieves counts for assets, targets, vulnerabilities, technologies, and ports for each workspace.
   * - Aggregates the data and saves it to the statistics table.
   */
  async calculateAndStoreStatistics() {
    const workspaceIds = await this.getWorkspaceIds();
    const statistics = await this.calculateStatistics(workspaceIds);
    if (statistics.length > 0) {
      await this.saveStatistics(statistics);
    }
  }
}
