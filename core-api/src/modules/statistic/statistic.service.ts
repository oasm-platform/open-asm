import { Injectable } from '@nestjs/common';
import { DataSource, MoreThanOrEqual } from 'typeorm';

import { TlsStatisticResponseDto } from './dto/tls-statistic.dto';

import {
  DefaultWorkflow,
  EventTriggerType,
  NotificationScope,
  NotificationType,
  Severity,
} from '@/common/enums/enum';
import { GeoIp, GeoIpService } from '@/services/geo-ip/geo-ip.service';
import { AssetLocationDto } from './dto/asset-location.dto';
import { RedisService } from '@/services/redis/redis.service';
import { OnEvent } from '@nestjs/event-emitter';
import { AssetService } from '../assets/entities/asset-services.entity';
import { AssetTag } from '../assets/entities/asset-tags.entity';
import { Asset } from '../assets/entities/assets.entity';
import { CreateJobs } from '../jobs-registry/dto/jobs-registry.dto';
import { Job } from '../jobs-registry/entities/job.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Target } from '../targets/entities/target.entity';
import { WorkspaceTarget } from '../targets/entities/workspace-target.entity';
import { Vulnerability } from '../vulnerabilities/entities/vulnerability.entity';
import { Workspace } from '../workspaces/entities/workspace.entity';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { IssuesTimelineResponseDto } from './dto/issues-timeline.dto';
import {
  GetStatisticQueryDto,
  StatisticResponseDto,
} from './dto/statistic.dto';
import { TimelineResponseDto } from './dto/timeline.dto';
import { TopAssetVulnerabilities } from './dto/top-assets-vulnerabilities.dto';
import { TopTagAsset } from './dto/top-tags-assets.dto';
import { Statistic } from './entities/statistic.entity';

interface RawTlsStatistic {
  alreadyExpired: string;
  expireInAMonth: string;
  expireIn3Months: string;
  wontExpireAnytimeSoon: string;
  newCertificatesDiscovered: string;
}

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

interface StatisticFilter {
  workspaceIds?: string[];
  targetId?: string;
  startDate?: Date;
  endDate?: Date;
}

interface StatisticSnapshot {
  hosts: number;
  ports: number;
  techs: number;
}

@Injectable()
export class StatisticService {
  constructor(
    private readonly dataSource: DataSource,
    private geoIpService: GeoIpService,
    private redisService: RedisService,
    private workspacesService: WorkspacesService,
    private notificationsService: NotificationsService,
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
   * Retrieves all statistics for a workspace.
   *
   * @param query - The query parameters containing workspaceId.
   * @returns A promise that resolves to an object containing all statistics.
   */
  async getStatistics(
    query: GetStatisticQueryDto,
  ): Promise<StatisticResponseDto> {
    const statistics = await this.calculateStatistics([query.workspaceId]);

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
      services: workspaceStats.services,
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
      .leftJoin('v.vulnerabilityDismissal', 'dismissal')
      .innerJoin('asset.target', 'target')
      .innerJoin('target.workspaceTargets', 'workspaceTarget')
      .where('workspaceTarget.workspace.id = :workspaceId', { workspaceId })
      .andWhere('dismissal.vulnerabilityId IS NULL')
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
   * Retrieves the top 10 countries by IP count for a workspace.
   * Fetches all unique IPs, batches them to the geo IP service, then aggregates by country.
   */
  async getAssetLocations(workspaceId: string): Promise<AssetLocationDto[]> {
    const allIps = await this.getAllWorkspaceIps(workspaceId);
    if (allIps.length === 0) {
      return [];
    }

    const geoResults = await this.batchGeoIpLookup(allIps);

    return this.aggregateByCountry(geoResults);
  }

  /**
   * Fetches all unique IP addresses for a workspace across all asset services.
   */
  private async getAllWorkspaceIps(workspaceId: string): Promise<string[]> {
    const rawResults: { ip: string }[] = await this.dataSource.query(
      `SELECT DISTINCT ipa."ip"
       FROM "asset_services" assvc
       INNER JOIN "assets" a ON a.id = assvc."assetId"
       INNER JOIN "targets" t ON t.id = a."targetId"
       INNER JOIN "workspace_targets" wt ON wt."targetId" = t.id
       INNER JOIN "ip_assets_view" ipa ON ipa."assetId" = a.id
       WHERE wt."workspaceId" = $1 AND ipa."ip" IS NOT NULL`,
      [workspaceId],
    );

    return rawResults.map((r) => r.ip);
  }

  /**
   * Batches IP addresses in groups of 100 and fetches geo IP data for each batch.
   */
  private async batchGeoIpLookup(ips: string[]): Promise<GeoIp[]> {
    const batchSize = 100;
    const allGeoIps: GeoIp[] = [];

    for (let i = 0; i < ips.length; i += batchSize) {
      const batch = ips.slice(i, i + batchSize);
      const geoIps = await this.geoIpService.getGeoIp(batch);
      allGeoIps.push(...geoIps);
    }

    return allGeoIps;
  }

  /**
   * Aggregates geo IP results by country code, counts occurrences,
   * sorts by count descending, and returns the top 10.
   */
  private aggregateByCountry(geoIps: GeoIp[]): AssetLocationDto[] {
    const countryCountMap = new Map<
      string,
      { country: string; count: number }
    >();

    for (const geo of geoIps) {
      if (!geo.countryCode) continue;

      const existing = countryCountMap.get(geo.countryCode);
      if (existing) {
        existing.count += 1;
      } else {
        countryCountMap.set(geo.countryCode, {
          country: geo.country || 'Unknown',
          count: 1,
        });
      }
    }

    return Array.from(countryCountMap.entries())
      .map(([countryCode, data]) => ({
        countryCode,
        country: data.country,
        count: data.count,
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Retrieves the count of assets for each workspace.
   * Only includes assets that are not error pages.
   * @param workspaceIds An array of workspace IDs.
   * @returns An array of objects containing the workspaceId and asset count.
   */
  async getAssetCounts(filter: StatisticFilter) {
    const { workspaceIds, targetId, startDate, endDate } = filter;
    const query = this.dataSource
      .getRepository(Asset)
      .createQueryBuilder('asset')
      .leftJoin('asset.target', 'target')
      .leftJoin('target.workspaceTargets', 'wt')
      .select('wt.workspaceId', 'workspaceId')
      .addSelect('COUNT(asset.id)', 'count')
      .where('1=1');

    if (workspaceIds?.length) {
      query.andWhere('wt.workspaceId IN (:...workspaceIds)', { workspaceIds });
    }
    if (targetId) {
      query.andWhere('target.id = :targetId', { targetId });
    }
    if (startDate) {
      query.andWhere('asset.createdAt >= :startDate', { startDate });
    }
    if (endDate) {
      query.andWhere('asset.createdAt <= :endDate', { endDate });
    }

    return query
      .groupBy('wt.workspaceId')
      .getRawMany<{ workspaceId: string; count: string }>();
  }

  /**
   * Retrieves the count of targets for each workspace.
   * @param workspaceIds An array of workspace IDs.
   * @returns An array of objects containing the workspaceId and target count.
   */
  async getTargetCounts(filter: StatisticFilter) {
    const { workspaceIds, targetId, startDate, endDate } = filter;
    const query = this.dataSource
      .getRepository(Target)
      .createQueryBuilder('target')
      .leftJoin('target.workspaceTargets', 'wt')
      .select('wt.workspaceId', 'workspaceId')
      .addSelect('COUNT(target.id)', 'count')
      .where('1=1');

    if (workspaceIds?.length) {
      query.andWhere('wt.workspaceId IN (:...workspaceIds)', { workspaceIds });
    }
    if (targetId) {
      query.andWhere('target.id = :targetId', { targetId });
    }
    if (startDate) {
      query.andWhere('target.createdAt >= :startDate', { startDate });
    }
    if (endDate) {
      query.andWhere('target.createdAt <= :endDate', { endDate });
    }

    return query
      .groupBy('wt.workspaceId')
      .getRawMany<{ workspaceId: string; count: string }>();
  }

  /**
   * Retrieves the count of vulnerabilities for each workspace, grouped by severity.
   * @param workspaceIds An array of workspace IDs.
   * @returns An array of objects containing the workspaceId, severity, and vulnerability count.
   */
  async getVulnerabilityCounts(filter: StatisticFilter) {
    const { workspaceIds, targetId, startDate, endDate } = filter;
    const query = this.dataSource
      .getRepository(Vulnerability)
      .createQueryBuilder('vuln')
      .leftJoin('vuln.asset', 'asset')
      .leftJoin('vuln.vulnerabilityDismissal', 'dismissal')
      .leftJoin('asset.target', 'target')
      .leftJoin('target.workspaceTargets', 'wt')
      .select('wt.workspaceId', 'workspaceId')
      .addSelect('vuln.severity', 'severity')
      .addSelect('COUNT(vuln.id)', 'count')
      .where('1=1')
      .andWhere('dismissal.vulnerabilityId IS NULL');

    if (workspaceIds?.length) {
      query.andWhere('wt.workspaceId IN (:...workspaceIds)', { workspaceIds });
    }
    if (targetId) {
      query.andWhere('target.id = :targetId', { targetId });
    }
    if (startDate) {
      query.andWhere('vuln.createdAt >= :startDate', { startDate });
    }
    if (endDate) {
      query.andWhere('vuln.createdAt <= :endDate', { endDate });
    }

    return query
      .groupBy('wt.workspaceId, vuln.severity')
      .getRawMany<{ workspaceId: string; severity: string; count: string }>();
  }

  /**
   * Retrieves the count of unique technologies for each workspace.
   * Uses a subquery to unnest the technology array and count distinct values.
   * @param workspaceIds An array of workspace IDs.
   * @returns An array of objects containing the workspaceId and unique technology count.
   */
  async getTechCounts(filter: StatisticFilter) {
    const { workspaceIds, targetId, startDate, endDate } = filter;
    // Subquery to unnest the 'tech' array from latest HttpResponse and link to workspaceId
    const subQuery = this.dataSource
      .createQueryBuilder()
      .select('wt.workspaceId', 'workspaceId')
      .addSelect('unnest(latest_http.tech)', 'tech') // Unnest the 'tech' array from latest response
      .from(AssetService, 'assetService')
      .innerJoin('assetService.asset', 'asset')
      .innerJoin('asset.target', 'target')
      .innerJoin('target.workspaceTargets', 'wt')
      .innerJoin(
        'assetService.httpResponses',
        'latest_http',
        'latest_http.id = (SELECT hr.id FROM http_responses hr WHERE hr."assetServiceId" = assetService.id ORDER BY hr."createdAt" DESC LIMIT 1)',
      )
      .where('1=1')
      .andWhere('latest_http.tech IS NOT NULL');

    if (workspaceIds?.length) {
      subQuery.andWhere('wt.workspaceId IN (:...workspaceIds)', {
        workspaceIds,
      });
    }
    if (targetId) {
      subQuery.andWhere('target.id = :targetId', { targetId });
    }
    if (startDate) {
      subQuery.andWhere('asset.createdAt >= :startDate', { startDate });
    }
    if (endDate) {
      subQuery.andWhere('asset.createdAt <= :endDate', { endDate });
    }

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
   * Retrieves the count of AssetService entities for each workspace.
   * @param workspaceIds An array of workspace IDs.
   * @returns An array of objects containing the workspaceId and service count.
   */
  async getServiceCounts(filter: StatisticFilter) {
    const { workspaceIds, targetId, startDate, endDate } = filter;
    // Subquery to get AssetService linked to workspaceId
    const subQuery = this.dataSource
      .createQueryBuilder()
      .select('wt.workspaceId', 'workspaceId')
      .addSelect('assetService.id', 'serviceId')
      .from(AssetService, 'assetService')
      .leftJoin('assetService.asset', 'asset')
      .leftJoin('asset.target', 'target')
      .leftJoin('target.workspaceTargets', 'wt')
      .where('1=1');

    if (workspaceIds?.length) {
      subQuery.andWhere('wt.workspaceId IN (:...workspaceIds)', {
        workspaceIds,
      });
    }
    if (targetId) {
      subQuery.andWhere('target.id = :targetId', { targetId });
    }
    if (startDate) {
      subQuery.andWhere('"assetService"."createdAt" >= :startDate', { startDate });
    }
    if (endDate) {
      subQuery.andWhere('"assetService"."createdAt" <= :endDate', { endDate });
    }

    // Main query to count distinct services for each workspaceId
    return this.dataSource
      .createQueryBuilder()
      .select('sq."workspaceId"', 'workspaceId')
      .addSelect('COUNT(DISTINCT sq."serviceId")', 'count')
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
  async getPortCounts(filter: StatisticFilter) {
    const { workspaceIds, targetId, startDate, endDate } = filter;
    // Subquery to unnest the 'ports' array from Port and link to workspaceId
    const subQuery = this.dataSource
      .createQueryBuilder()
      .select('wt.workspaceId', 'workspaceId')
      .addSelect('assetService.port', 'port')
      .from(AssetService, 'assetService')
      .leftJoin('assetService.asset', 'asset')
      .leftJoin('asset.target', 'target')
      .leftJoin('target.workspaceTargets', 'wt')
      .where('1=1');

    if (workspaceIds?.length) {
      subQuery.andWhere('wt.workspaceId IN (:...workspaceIds)', {
        workspaceIds,
      });
    }
    if (targetId) {
      subQuery.andWhere('target.id = :targetId', { targetId });
    }
    if (startDate) {
      subQuery.andWhere('"assetService"."createdAt" >= :startDate', { startDate });
    }
    if (endDate) {
      subQuery.andWhere('"assetService"."createdAt" <= :endDate', { endDate });
    }

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

  async getTlsStatistics(workspaceId: string): Promise<TlsStatisticResponseDto> {
    const rawSubQuery = `
      SELECT DISTINCT ON (hr.tls->>'host', hr."assetServiceId")
        NULLIF(hr.tls->>'not_after', '')::timestamp AS not_after,
        hr."createdAt" AS created_at
      FROM "http_responses" hr
      INNER JOIN "asset_services" assvc ON assvc.id = hr."assetServiceId"
      INNER JOIN "assets" a ON a.id = assvc."assetId"
      INNER JOIN "targets" t ON t.id = a."targetId"
      INNER JOIN "workspace_targets" wt ON wt."targetId" = t.id
      WHERE hr.tls IS NOT NULL
        AND wt."workspaceId" = :workspaceId
      ORDER BY hr.tls->>'host', hr."assetServiceId", hr."createdAt" DESC
    `;

    const result = await this.dataSource
      .createQueryBuilder()
      .select(
        `COALESCE(SUM(CASE WHEN sq.not_after < NOW() THEN 1 ELSE 0 END), 0)`,
        'alreadyExpired',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN sq.not_after >= NOW() AND sq.not_after < NOW() + INTERVAL '1 month' THEN 1 ELSE 0 END), 0)`,
        'expireInAMonth',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN sq.not_after >= NOW() + INTERVAL '1 month' AND sq.not_after < NOW() + INTERVAL '3 months' THEN 1 ELSE 0 END), 0)`,
        'expireIn3Months',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN sq.not_after >= NOW() + INTERVAL '3 months' THEN 1 ELSE 0 END), 0)`,
        'wontExpireAnytimeSoon',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN sq.created_at >= NOW() - INTERVAL '30 days' THEN 1 ELSE 0 END), 0)`,
        'newCertificatesDiscovered',
      )
      .from(`(${rawSubQuery})`, 'sq')
      .setParameter('workspaceId', workspaceId)
      .getRawOne<RawTlsStatistic>();

    if (!result) {
      return {
        alreadyExpired: 0,
        expireInAMonth: 0,
        expireIn3Months: 0,
        wontExpireAnytimeSoon: 0,
        newCertificatesDiscovered: 0,
      };
    }

    return {
      alreadyExpired: Number(result.alreadyExpired),
      expireInAMonth: Number(result.expireInAMonth),
      expireIn3Months: Number(result.expireIn3Months),
      wontExpireAnytimeSoon: Number(result.wontExpireAnytimeSoon),
      newCertificatesDiscovered: Number(result.newCertificatesDiscovered),
    };
  }

  /**
   * Calculates statistics for specified workspaces without saving them to the database.
   * - Retrieves counts for assets, targets, vulnerabilities, technologies, and ports for each workspace using concurrent queries.
   * - Aggregates the data into Statistic objects.
   * @param workspaceIds Array of workspace IDs to calculate statistics for
   * @returns An array of Statistic objects with calculated data
   */
  async calculateStatistics(
    workspaceIds: string[],
    targetId?: string,
  ): Promise<Statistic[]> {
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
      serviceCounts,
    ] = await Promise.all([
      this.getAssetCounts({ workspaceIds, targetId }),
      this.getTargetCounts({ workspaceIds, targetId }),
      this.getVulnerabilityCounts({ workspaceIds, targetId }),
      this.getTechCounts({ workspaceIds, targetId }),
      this.getPortCounts({ workspaceIds, targetId }),
      this.getServiceCounts({ workspaceIds, targetId }),
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
      statistic.services = 0;
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

    // Update service counts in the statistics Map
    serviceCounts.forEach((row) => {
      const stat = statisticsMap.get(row.workspaceId);
      if (stat) stat.services = Number(row.count);
    });

    // Calculate scores for each workspace
    for (const [, stat] of statisticsMap) {
      stat.score = StatisticService.calculateSecurityScore(
        {
          [Severity.CRITICAL]: stat.criticalVuls,
          [Severity.HIGH]: stat.highVuls,
          [Severity.MEDIUM]: stat.mediumVuls,
          [Severity.LOW]: stat.lowVuls,
          [Severity.INFO]: stat.infoVuls,
        },
        stat.assets,
      );
    }

    // Convert the Map to an array and return
    return Array.from(statisticsMap.values());
  }

  /**
   * Calculates a security score (0-10) from severity counts and asset count.
   * Shared formula used by dashboard and report services.
   */
  static calculateSecurityScore(
    severityCounts: Record<Severity, number>,
    totalAssets: number,
  ): number {
    if (totalAssets <= 0) return 10;

    const critical = severityCounts[Severity.CRITICAL] || 0;
    const high = severityCounts[Severity.HIGH] || 0;
    const medium = severityCounts[Severity.MEDIUM] || 0;
    const low = severityCounts[Severity.LOW] || 0;
    const info = severityCounts[Severity.INFO] || 0;

    const alpha = 0.3; // asset weight
    const beta = 0.7; // vuln weight

    const vulRisk = critical * 5 + high * 3 + medium * 2 + low * 1 + info * 0.5;
    const Rvuln = Math.min(10, vulRisk / totalAssets);
    const Rasset = Math.min(10, totalAssets / 100);

    if (vulRisk === 0) return 10;

    const totalScore = Math.max(0, 10 - (alpha * Rasset + beta * Rvuln));
    const finalScore = Math.round(totalScore * 10) / 10;

    return Math.round(finalScore) === finalScore
      ? Math.round(finalScore)
      : finalScore;
  }

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
      .leftJoin('target.workspaceTargets', 'wt')
      .leftJoin('wt.workspace', 'workspace')
      .select("TO_CHAR(v.createdAt, 'YYYY-MM-DD')", 'date')
      .addSelect('COUNT(*)', 'count')
      .where('workspace.id = :workspaceId', { workspaceId })
      .andWhere('v.createdAt >= :startDate', { startDate })
      .andWhere('v.createdAt <= :endDate', { endDate })
      .andWhere('v.isArchived = :isArchived', { isArchived: false })
      .groupBy("TO_CHAR(v.createdAt, 'YYYY-MM-DD')")
      .orderBy('date', 'ASC');

    if (options?.targetIds?.length) {
      qb.andWhere('target.id IN (:...targetIds)', {
        targetIds: options.targetIds,
      });
    }

    const results = await qb.getRawMany<{ date: string; count: string }>();

    // Fill in missing days with 0 counts
    const dateMap = new Map(results.map((r) => [r.date, parseInt(r.count, 10)]));
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
      .leftJoin('target.workspaceTargets', 'wt')
      .leftJoin('wt.workspace', 'workspace')
      .select('v.severity', 'severity')
      .addSelect('COUNT(*)', 'count')
      .where('workspace.id = :workspaceId', { workspaceId })
      .andWhere('v.isArchived = :isArchived', { isArchived: false });

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
      .leftJoin('target.workspaceTargets', 'wt')
      .leftJoin('wt.workspace', 'workspace')
      .select('asset.value', 'assetValue')
      .addSelect('COUNT(*)', 'totalCount')
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
      .addSelect(
        `SUM(CASE WHEN v.severity = 'info' THEN 1 ELSE 0 END)`,
        'info',
      )
      .where('workspace.id = :workspaceId', { workspaceId })
      .andWhere('v.isArchived = :isArchived', { isArchived: false })
      .groupBy('asset.value')
      .orderBy('"totalCount"', 'DESC')
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
      .addSelect(
        `SUM(CASE WHEN v.severity = 'info' THEN 1 ELSE 0 END)`,
        'info',
      )
      .addSelect('COUNT(v.id)', 'total')
      .where('workspace.id = :workspaceId', { workspaceId })
      .andWhere('v.isArchived = :isArchived', { isArchived: false })
      .groupBy('t.id')
      .addGroupBy('t.value')
      .addGroupBy('t.type')
      .having('COUNT(v.id) > 0')
      .orderBy('total', 'DESC');

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
    countType: 'assets' | 'targets' | 'vulnerabilities' | 'services' | 'ports' | 'techs',
    workspaceId: string,
    options?: { startDate?: Date; endDate?: Date },
  ): Promise<number> {
    const methodMap = {
      assets: () => this.getAssetCounts({ workspaceIds: [workspaceId], ...options }),
      targets: () => this.getTargetCounts({ workspaceIds: [workspaceId], ...options }),
      vulnerabilities: () => this.getVulnerabilityCounts({ workspaceIds: [workspaceId], ...options }),
      services: () => this.getServiceCounts({ workspaceIds: [workspaceId], ...options }),
      ports: () => this.getPortCounts({ workspaceIds: [workspaceId], ...options }),
      techs: () => this.getTechCounts({ workspaceIds: [workspaceId], ...options }),
    };

    const results = await methodMap[countType]();
    return results.length > 0 ? Number(results[0].count) : 0;
  }

  /**
   * Returns total vulnerability count (sum of all severities) for a workspace.
   * Convenience wrapper for report services.
   */
  async getTotalVulnCount(
    workspaceId: string,
    options?: { startDate?: Date; endDate?: Date },
  ): Promise<number> {
    const counts = await this.getSeverityCounts(workspaceId, options);
    return Object.values(counts).reduce((sum, count) => sum + count, 0);
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

  async takeSnapshotStatisticTarget(
    targetId: string,
  ): Promise<StatisticSnapshot> {
    const [hosts, ports, techs] = await Promise.all([
      this.getAssetCounts({ targetId }).then((res) =>
        res.length > 0 ? Number(res[0].count) : 0,
      ),
      this.getPortCounts({ targetId }).then((res) =>
        res.length > 0 ? Number(res[0].count) : 0,
      ),
      this.getTechCounts({ targetId }).then((res) =>
        res.length > 0 ? Number(res[0].count) : 0,
      ),
    ]);

    return { hosts, ports, techs };
  }

  @OnEvent(EventTriggerType.WORKFLOW_START)
  async handleWorkflowStart(job: CreateJobs) {
    if (
      job.workflow?.filePath &&
      [
        DefaultWorkflow.DOMAIN_DISCOVERY,
        DefaultWorkflow.IP_ADDRESS_DISCOVERY,
      ].includes(job.workflow.filePath as DefaultWorkflow) &&
      job.targetIds
    ) {
      //Take snapshot
      await Promise.all(
        job.targetIds.map(async (targetId) => {
          const snapshotPayload =
            await this.takeSnapshotStatisticTarget(targetId);
          await this.redisService.setex(
            `snapshot:${job.workflow.filePath}:${targetId}`,
            86400,
            JSON.stringify(snapshotPayload),
          );
        }),
      );
    }
  }

  @OnEvent(EventTriggerType.WORKFLOW_END)
  async handleWorkflowEnd(job: Job) {
    if (
      job.jobHistory?.workflow?.filePath &&
      [
        DefaultWorkflow.DOMAIN_DISCOVERY,
        DefaultWorkflow.IP_ADDRESS_DISCOVERY,
      ].includes(job.jobHistory.workflow.filePath as DefaultWorkflow) &&
      job.asset?.target?.id
    ) {
      const redisKey = `snapshot:${job.jobHistory.workflow.filePath}:${job.asset.target.id}`;

      const beforeSnapshot = await this.redisService
        .get(redisKey)
        .then((res) => JSON.parse(res || '{}') as StatisticSnapshot);
      await this.redisService.del(redisKey);
      const afterSnapshot = await this.takeSnapshotStatisticTarget(job.asset.target.id);

      const diffs: Partial<StatisticSnapshot> = {};
      for (const key in afterSnapshot) {
        const k = key as keyof StatisticSnapshot;
        const before = beforeSnapshot[k] ?? 0;
        const after = afterSnapshot[k];
        if (after > before) {
          diffs[k] = after - before;
        }
      }
      const members = await this.workspacesService.getMemberOfWorkspaceByJobId(
        job.id,
      );

      if (Object.keys(diffs).length > 0) {
        const recipientIds = members.map((m) => m.user.id);
        const workspaceId = members[0]?.workspace.id;

        if (recipientIds.length > 0) {
          await this.notificationsService.createNotification({
            recipients: recipientIds,
            scope: NotificationScope.GROUP,
            type: NotificationType.ASSET_NEW_DETECT,
            metadata: {
              hosts: String(diffs.hosts ?? 0),
              ports: String(diffs.ports ?? 0),
              tech: String(diffs.techs ?? 0),
              targetValue: job.asset.target.value,
              targetId: job.asset.target.id,
            },
            workspaceId,
          });
        }
      }
    }
  }
}
