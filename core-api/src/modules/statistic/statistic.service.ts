import { Injectable } from '@nestjs/common';
import { DataSource, LessThan, MoreThanOrEqual } from 'typeorm';
import { TlsStatisticResponseDto } from './dto/tls-statistic.dto';
import { TopPortsResponseDto } from './dto/top-ports.dto';
import { TopTechnologiesResponseDto } from './dto/top-technologies.dto';
import { TechnologyForwarderService } from '../technology/technology-forwarder.service';

import {
  DefaultWorkflow,
  EventTriggerType,
  Severity,
  TargetType,
} from '@/common/enums/enum';
import { GeoIp, GeoIpService } from '@/services/geo-ip/geo-ip.service';
import { RedisService } from '@/services/redis/redis.service';
import { OnEvent } from '@nestjs/event-emitter';
import { AssetService } from '../assets/entities/asset-services.entity';
import { AssetTag } from '../assets/entities/asset-tags.entity';
import { Asset } from '../assets/entities/assets.entity';
import { CreateJobs } from '../jobs-registry/dto/jobs-registry.dto';
import { Job } from '../jobs-registry/entities/job.entity';
import type { RunStepState } from '../workflows/workflow-graph';
import { EVENT_CATALOG } from '../event-bridge/contracts/event-catalog';
import { EventBridgeService } from '../event-bridge/publishing/event-bridge.service';
import type { WorkflowRunCompletedPayload } from '../event-bridge/contracts/event-payloads';
import { Target } from '../targets/entities/target.entity';
import { AssetLocationDto } from './dto/asset-location.dto';

import { Vulnerability } from '../vulnerabilities/entities/vulnerability.entity';
import { openVulnerabilityCondition } from '../vulnerabilities/open-vulnerability';
import { Workspace } from '../workspaces/entities/workspace.entity';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { IssuesTimelineResponseDto } from './dto/issues-timeline.dto';
import { StatisticResponseDto } from './dto/statistic.dto';
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
  services: number;
  techs: number;
}

/** How many of a run's new hosts the run-completed event names. */
const NEW_HOSTS_PREVIEW = 10;

/** How long a workspace's live numbers are shared between requests. */
const CURRENT_STATISTICS_TTL_SECONDS = 60;

/** How long a workspace's IP geolocation breakdown is reused. */
const ASSET_LOCATIONS_TTL_SECONDS = 10 * 60;

/** How far back the timelines reach. */
const TIMELINE_MONTHS = 3;

@Injectable()
export class StatisticService {
  constructor(
    private readonly dataSource: DataSource,
    private geoIpService: GeoIpService,
    private redisService: RedisService,
    private workspacesService: WorkspacesService,
    private eventBridge: EventBridgeService,
    private technologyForwarderService: TechnologyForwarderService,
  ) {}

  /**
   * Retrieves the total count of targets in a workspace directly from the database.
   *
   * @param workspaceId - The ID of the workspace.
   * @returns A promise that resolves to the total count of targets.
   */
  private async countTargets(workspaceId: string): Promise<number> {
    return this.dataSource
      .getRepository(Target)
      .count({ where: { workspaceId } });
  }

  /**
   * Retrieves the total count of assets in a workspace directly from the database.
   *
   * @param workspaceId - The ID of the workspace.
   * @returns A promise that resolves to the total count of assets.
   */
  private async countAssets(workspaceId: string): Promise<number> {
    // Repositories of Git organization targets are not part of the host
    // attack surface this number describes.
    return this.dataSource
      .getRepository(Asset)
      .createQueryBuilder('asset')
      .innerJoin('asset.target', 'target')
      .where('target.workspaceId = :workspaceId', { workspaceId })
      .andWhere('target.type != :gitOrg', { gitOrg: TargetType.GIT_ORG })
      .getCount();
  }

  /**
   * Retrieves the total count of targets in a workspace.
   *
   * @param workspaceId - The ID of the workspace.
   * @returns A promise that resolves to the total count of targets.
   */
  async getTotalTargets(workspaceId: string): Promise<number> {
    return this.countTargets(workspaceId);
  }

  /**
   * Retrieves the total count of assets in a workspace.
   *
   * @param workspaceId - The ID of the workspace.
   * @returns A promise that resolves to the total count of assets.
   */
  async getTotalAssets(workspaceId: string): Promise<number> {
    return this.countAssets(workspaceId);
  }

  /**
   * Retrieves all statistics for a workspace.
   *
   * @param workspaceId - The ID of the workspace.
   * @returns A promise that resolves to an object containing all statistics.
   */
  async getStatistics(workspaceId: string): Promise<StatisticResponseDto> {
    const workspaceStats = await this.getCurrentStatistics(workspaceId);

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
   * The live numbers of a workspace. Several dashboard cards and the timeline
   * ask for them at once, and computing them is a handful of aggregate scans,
   * so concurrent and repeated reads share one result for a minute.
   */
  private async getCurrentStatistics(workspaceId: string): Promise<Statistic> {
    return this.cached(
      `statistic:current:${workspaceId}`,
      CURRENT_STATISTICS_TTL_SECONDS,
      async () => (await this.calculateStatistics([workspaceId]))[0],
    );
  }

  /**
   * Reads `key` from Redis, or computes the value and stores it for
   * `ttlSeconds`. A Redis failure only costs the cache: the value is computed
   * and served anyway.
   */
  private async cached<T>(
    key: string,
    ttlSeconds: number,
    compute: () => Promise<T>,
  ): Promise<T> {
    try {
      const hit = await this.redisService.get(key);
      if (hit) return JSON.parse(hit) as T;
    } catch {
      // Cache unavailable — compute below.
    }

    const value = await compute();
    try {
      await this.redisService.setex(key, ttlSeconds, JSON.stringify(value));
    } catch {
      // Not cached this time; the next read computes again.
    }
    return value;
  }

  /**
   * Daily statistics of a workspace over the last {@link TIMELINE_MONTHS}
   * months, oldest first, ending with the live numbers.
   */
  async getTimelineStatistics(
    workspaceId: string,
  ): Promise<TimelineResponseDto> {
    const from = new Date();
    from.setUTCHours(0, 0, 0, 0);
    from.setUTCMonth(from.getUTCMonth() - TIMELINE_MONTHS);

    const repository = this.dataSource.getRepository(Statistic);
    const workspace = { id: workspaceId };
    const [snapshots, baseline, current] = await Promise.all([
      repository.find({
        where: { workspace, createdAt: MoreThanOrEqual(from) },
        order: { createdAt: 'ASC' },
      }),
      // Snapshots are stored only when a number changes, so the last one
      // before the window holds the values the window opens with.
      repository.findOne({
        where: { workspace, createdAt: LessThan(from) },
        order: { createdAt: 'DESC' },
      }),
      this.getCurrentStatistics(workspaceId),
    ]);

    const data = StatisticService.toDailySeries(
      baseline ? [baseline, ...snapshots] : snapshots,
      from,
      current,
    );
    return { data, total: data.length };
  }

  /**
   * One point per day from `from` to today, oldest first, so a chart spaces
   * its points by real time. Each snapshot is carried forward until the next
   * one; days before the first snapshot are left out, and the last point is
   * `current`, dated now.
   */
  static toDailySeries(
    snapshots: Statistic[],
    from: Date,
    current: Statistic,
  ): Statistic[] {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const series: Statistic[] = [];
    let next = 0;
    let carried: Statistic | undefined;
    for (
      const day = new Date(from);
      day < today;
      day.setUTCDate(day.getUTCDate() + 1)
    ) {
      const dayEnd = new Date(day);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
      while (
        next < snapshots.length &&
        new Date(snapshots[next].createdAt) < dayEnd
      ) {
        carried = snapshots[next++];
      }
      if (carried) series.push(StatisticService.asTimelinePoint(carried, day));
    }
    series.push(StatisticService.asTimelinePoint(current, new Date()));
    return series;
  }

  /** A stored or live statistic as a timeline point dated `at`. */
  private static asTimelinePoint(statistic: Statistic, at: Date): Statistic {
    return {
      ...statistic,
      // Snapshots stored before Info stopped counting as open include it in
      // `vuls`; the severity columns give the same number for every point.
      vuls:
        statistic.criticalVuls +
        statistic.highVuls +
        statistic.mediumVuls +
        statistic.lowVuls,
      createdAt: new Date(at),
      updatedAt: new Date(at),
    };
  }

  /**
   * Open vulnerabilities per day of a workspace, on the same days as
   * {@link getTimelineStatistics}.
   *
   * @param workspaceId - The ID of the workspace.
   * @returns A promise that resolves to issues timeline statistics.
   */
  async getIssuesTimeline(
    workspaceId: string,
  ): Promise<IssuesTimelineResponseDto> {
    const { data } = await this.getTimelineStatistics(workspaceId);
    const points = data.map(({ vuls, createdAt }) => ({ vuls, createdAt }));

    return {
      data: points,
      total: points.length,
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
      .where('target.workspaceId = :workspaceId', { workspaceId })
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
    // Starts from the open findings instead of every asset, and ranks by the
    // worst severity first: two criticals outrank fifty lows. Info findings
    // are reported but neither ranked nor totalled, as on the open count.
    const rawResults: RawAssetVulCount[] = await this.dataSource
      .getRepository(Vulnerability)
      .createQueryBuilder('v')
      .select('asset.id', 'id')
      .addSelect('asset.value', 'value')
      .addSelect(`COUNT(*) FILTER (WHERE v.severity = 'critical')`, 'critical')
      .addSelect(`COUNT(*) FILTER (WHERE v.severity = 'high')`, 'high')
      .addSelect(`COUNT(*) FILTER (WHERE v.severity = 'medium')`, 'medium')
      .addSelect(`COUNT(*) FILTER (WHERE v.severity = 'low')`, 'low')
      .addSelect(`COUNT(*) FILTER (WHERE v.severity = 'info')`, 'info')
      .addSelect(`COUNT(*) FILTER (WHERE v.severity <> 'info')`, 'total')
      .innerJoin('v.asset', 'asset')
      .innerJoin('asset.target', 'target')
      .where('target.workspaceId = :workspaceId', { workspaceId })
      .andWhere(openVulnerabilityCondition('v'))
      .groupBy('asset.id, asset.value')
      .having(`COUNT(*) FILTER (WHERE v.severity <> 'info') > 0`)
      .orderBy('critical', 'DESC')
      .addOrderBy('high', 'DESC')
      .addOrderBy('medium', 'DESC')
      .addOrderBy('low', 'DESC')
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
    // Every IP of the workspace goes through the geo IP service, so the
    // breakdown is reused for a while instead of resolved on each visit.
    return this.cached(
      `statistic:asset-locations:${workspaceId}`,
      ASSET_LOCATIONS_TTL_SECONDS,
      async () => {
        const allIps = await this.getAllWorkspaceIps(workspaceId);
        if (allIps.length === 0) {
          return [];
        }

        const geoResults = await this.batchGeoIpLookup(allIps);

        return this.aggregateByCountry(geoResults);
      },
    );
  }

  /**
   * Fetches all unique IP addresses for a workspace across all asset services.
   */
  private async getAllWorkspaceIps(workspaceId: string): Promise<string[]> {
    const rawResults: { ip: string }[] = await this.dataSource.query(
      `SELECT DISTINCT host(io."ip") AS "ip"
       FROM "assets" a
       INNER JOIN "targets" t ON t.id = a."targetId"
       INNER JOIN "ip_observations" io
         ON io."assetId" = a.id AND io.source IN ('dns_a', 'dns_aaaa')
       WHERE t."workspaceId" = $1
         AND EXISTS (SELECT 1 FROM "asset_services" s WHERE s."assetId" = a.id)`,
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
   * @param workspaceIds An array of workspace IDs.
   * @returns An array of objects containing the workspaceId and asset count.
   */
  async getAssetCounts(filter: StatisticFilter) {
    const { workspaceIds, targetId, startDate, endDate } = filter;
    const query = this.dataSource
      .getRepository(Asset)
      .createQueryBuilder('asset')
      .leftJoin('asset.target', 'target')
      .select('target.workspaceId', 'workspaceId')
      .addSelect('COUNT(asset.id)', 'count')
      // Host assets only — repositories are counted on their own target.
      .where('target.type != :gitOrg', { gitOrg: TargetType.GIT_ORG });

    if (workspaceIds?.length) {
      query.andWhere('target.workspaceId IN (:...workspaceIds)', {
        workspaceIds,
      });
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
      .groupBy('target.workspaceId')
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
      .select('target.workspaceId', 'workspaceId')
      .addSelect('COUNT(target.id)', 'count')
      .where('1=1');

    if (workspaceIds?.length) {
      query.andWhere('target.workspaceId IN (:...workspaceIds)', {
        workspaceIds,
      });
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
      .groupBy('target.workspaceId')
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
      .leftJoin('asset.target', 'target')
      .select('target.workspaceId', 'workspaceId')
      .addSelect('vuln.severity', 'severity')
      .addSelect('COUNT(vuln.id)', 'count')
      .where(openVulnerabilityCondition('vuln'));

    if (workspaceIds?.length) {
      query.andWhere('target.workspaceId IN (:...workspaceIds)', {
        workspaceIds,
      });
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
      .groupBy('target.workspaceId, vuln.severity')
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
    // Subquery reads the normalized tech facet table, correlated to the
    // latest HttpResponse per service.
    const subQuery = this.dataSource
      .createQueryBuilder()
      .select('target.workspaceId', 'workspaceId')
      .addSelect(
        `hrt.name || CASE WHEN hrt.version IS NULL THEN '' ELSE ':' || hrt.version END`,
        'tech',
      )
      .from(AssetService, 'assetService')
      .innerJoin('assetService.asset', 'asset')
      .innerJoin('asset.target', 'target')
      .innerJoin(
        'assetService.httpResponses',
        'latest_http',
        'latest_http.id = (SELECT hr.id FROM http_responses hr WHERE hr."assetServiceId" = assetService.id ORDER BY hr."createdAt" DESC LIMIT 1)',
      )
      .innerJoin(
        'http_response_technologies',
        'hrt',
        'hrt."httpResponseId" = latest_http.id',
      )
      .where('1=1');

    if (workspaceIds?.length) {
      subQuery.andWhere('target.workspaceId IN (:...workspaceIds)', {
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
   * Hosts, services and distinct ports per workspace, in one scan of
   * asset_services. A host counts only when it exposes a service, matching
   * the host assets tab and the run-completed notification.
   */
  async getServiceFootprintCounts(filter: StatisticFilter) {
    const { workspaceIds, targetId, startDate, endDate } = filter;
    const query = this.dataSource
      .createQueryBuilder()
      .select('target.workspaceId', 'workspaceId')
      .addSelect('COUNT(DISTINCT asset.value)', 'hosts')
      .addSelect('COUNT(assetService.id)', 'services')
      .addSelect('COUNT(DISTINCT assetService.port)', 'ports')
      .from(AssetService, 'assetService')
      .innerJoin('assetService.asset', 'asset')
      .innerJoin('asset.target', 'target')
      .where('1=1');

    if (workspaceIds?.length) {
      query.andWhere('target.workspaceId IN (:...workspaceIds)', {
        workspaceIds,
      });
    }
    if (targetId) {
      query.andWhere('target.id = :targetId', { targetId });
    }
    if (startDate) {
      query.andWhere('"assetService"."createdAt" >= :startDate', {
        startDate,
      });
    }
    if (endDate) {
      query.andWhere('"assetService"."createdAt" <= :endDate', { endDate });
    }

    return query.groupBy('target.workspaceId').getRawMany<{
      workspaceId: string;
      hosts: string;
      services: string;
      ports: string;
    }>();
  }

  async getTlsStatistics(
    workspaceId: string,
  ): Promise<TlsStatisticResponseDto> {
    // One row per distinct certificate (same grouping as assets getManyTls),
    // so the dashboard counts match the TLS tab total after clicking through.
    // Grouping by (host, assetServiceId) instead would count the same cert
    // once per port/service of the host.
    const rawSubQuery = `
      SELECT DISTINCT ON (
        tc."host", tc."sni", tc."subjectDn", tc."subjectCn",
        tc."issuerDn", tc."notBefore", tc."notAfter",
        tc."tlsVersion", tc."cipher", tc."tlsConnection", tc."subjectAn"
      )
        tc."notAfter" AS not_after,
        tc."createdAt" AS created_at
      FROM "tls_certificates" tc
      INNER JOIN "asset_services" assvc ON assvc.id = tc."assetServiceId"
      INNER JOIN "assets" a ON a.id = assvc."assetId"
      INNER JOIN "targets" t ON t.id = a."targetId"
      WHERE tc."host" IS NOT NULL
        AND t."workspaceId" = :workspaceId
      ORDER BY
        tc."host", tc."sni", tc."subjectDn", tc."subjectCn",
        tc."issuerDn", tc."notBefore", tc."notAfter",
        tc."tlsVersion", tc."cipher", tc."tlsConnection", tc."subjectAn",
        tc."createdAt" DESC
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
   * Retrieves the top 10 most exposed ports for a workspace, classified as
   * standard (IANA well-known/registered, < 49152) or non-standard, plus
   * distinct port totals.
   */
  async getTopPorts(workspaceId: string): Promise<TopPortsResponseDto> {
    const baseQuery = (select: string) =>
      this.dataSource
        .createQueryBuilder()
        .select(select)
        .from(AssetService, 'assetService')
        .innerJoin('assetService.asset', 'asset')
        .innerJoin('asset.target', 'target')
        .where('target.workspaceId = :workspaceId', { workspaceId });

    const [totals, ports] = await Promise.all([
      baseQuery(
        `COUNT(DISTINCT assetService.port) AS total,
         COUNT(DISTINCT CASE WHEN assetService.port >= 49152 THEN assetService.port END) AS nonstandard`,
      ).getRawOne<{ total: string; nonstandard: string }>(),
      baseQuery(
        'assetService.port AS port, COUNT(assetService.id) AS count',
      )
        .addGroupBy('assetService.port')
        .addOrderBy('count', 'DESC')
        .addOrderBy('assetService.port', 'ASC')
        .limit(10)
        .getRawMany<{ port: string; count: string }>(),
    ]);

    return {
      totalPorts: Number(totals?.total ?? 0),
      nonstandardPorts: Number(totals?.nonstandard ?? 0),
      ports: ports.map(({ port, count }) => ({
        port: Number(port),
        count: Number(count),
        isStandard: Number(port) < 49152,
      })),
    };
  }

  /**
   * Retrieves the top 10 technologies detected on the latest HTTP response of
   * each service in a workspace, ranked by number of services running them.
   */
  async getTopTechnologies(
    workspaceId: string,
  ): Promise<TopTechnologiesResponseDto> {
    const subQuery = this.dataSource
      .createQueryBuilder()
      .select('assetService.id', 'serviceId')
      .addSelect(
        `hrt.name || CASE WHEN hrt.version IS NULL THEN '' ELSE ':' || hrt.version END`,
        'tech',
      )
      .from(AssetService, 'assetService')
      .innerJoin('assetService.asset', 'asset')
      .innerJoin('asset.target', 'target')
      .innerJoin(
        'assetService.httpResponses',
        'latest_http',
        'latest_http.id = (SELECT hr.id FROM http_responses hr WHERE hr."assetServiceId" = assetService.id ORDER BY hr."createdAt" DESC LIMIT 1)',
      )
      .innerJoin(
        'http_response_technologies',
        'hrt',
        'hrt."httpResponseId" = latest_http.id',
      )
      .where('target.workspaceId = :workspaceId', { workspaceId });

    const rawResults: { name: string; count: string }[] =
      await this.dataSource
        .createQueryBuilder()
        .select('sq.tech', 'name')
        .addSelect('COUNT(DISTINCT sq."serviceId")', 'count')
        .from(`(${subQuery.getQuery()})`, 'sq')
        .setParameters(subQuery.getParameters())
        .groupBy('sq.tech')
        .orderBy('count', 'DESC')
        .addOrderBy('sq.tech', 'ASC')
        .limit(10)
        .getRawMany();

    const techNames = rawResults.map(({ name }) => name.split(':')[0]);
    const enriched = await this.technologyForwarderService.enrichTechnologies(
      techNames,
    );
    const iconByTechName = new Map(
      enriched
        .filter((tech) => tech?.name)
        .map((tech) => [tech.name, tech.iconUrl]),
    );

    return {
      technologies: rawResults.map(({ name, count }) => ({
        name,
        count: Number(count),
        iconUrl: iconByTechName.get(name.split(':')[0]),
      })),
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
      footprintCounts,
    ] = await Promise.all([
      this.getAssetCounts({ workspaceIds, targetId }),
      this.getTargetCounts({ workspaceIds, targetId }),
      this.getVulnerabilityCounts({ workspaceIds, targetId }),
      this.getTechCounts({ workspaceIds, targetId }),
      this.getServiceFootprintCounts({ workspaceIds, targetId }),
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
        // Info findings are reported on their own, not as open vulnerabilities.
        if (row.severity !== 'info') stat.vuls += Number(row.count);
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

    // Update host-facing service and port counts in the statistics Map
    footprintCounts.forEach((row) => {
      const stat = statisticsMap.get(row.workspaceId);
      if (stat) {
        stat.services = Number(row.services);
        stat.ports = Number(row.ports);
      }
    });

    // Calculate scores for each workspace
    for (const [, stat] of statisticsMap) {
      stat.score = StatisticService.calculateSecurityScore({
        [Severity.CRITICAL]: stat.criticalVuls,
        [Severity.HIGH]: stat.highVuls,
        [Severity.MEDIUM]: stat.mediumVuls,
        [Severity.LOW]: stat.lowVuls,
        [Severity.INFO]: stat.infoVuls,
      });
    }

    // Convert the Map to an array and return
    return Array.from(statisticsMap.values());
  }

  /**
   * Security score (0–100) from open vulnerability counts. Shared formula
   * used by dashboard and report services.
   *
   * The score follows the worst findings, not the size of the attack surface
   * and not Info findings: each severity takes a penalty that grows with
   * diminishing returns up to its cap, and an open critical (or high) keeps
   * the score out of the top grade bands however few there are. With the
   * console's bands (A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, F below), an open high
   * caps the grade at B and an open critical at D.
   */
  static calculateSecurityScore(
    severityCounts: Record<Severity, number>,
  ): number {
    const critical = severityCounts[Severity.CRITICAL] || 0;
    const high = severityCounts[Severity.HIGH] || 0;
    const medium = severityCounts[Severity.MEDIUM] || 0;
    const low = severityCounts[Severity.LOW] || 0;

    // `cap` is the most a severity can take off; each further finding takes
    // `1 - decay` of what is left of it.
    const penalty = (count: number, cap: number, decay: number) =>
      cap * (1 - Math.pow(decay, count));

    let score =
      100 -
      penalty(critical, 40, 0.5) -
      penalty(high, 25, 0.7) -
      penalty(medium, 15, 0.85) -
      penalty(low, 5, 0.9);

    if (critical > 0) score = Math.min(score, 69);
    else if (high > 0) score = Math.min(score, 89);

    // Rounded down, so any open finding moves the score off 100.
    return Math.floor(score);
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
      const rows = await this.getVulnerabilityCounts(filter);
      return rows
        .filter((row) => row.severity !== 'info')
        .reduce((sum, row) => sum + Number(row.count), 0);
    }
    if (countType === 'services' || countType === 'ports') {
      const [row] = await this.getServiceFootprintCounts(filter);
      return row ? Number(row[countType]) : 0;
    }

    const methodMap = {
      assets: () => this.getAssetCounts(filter),
      targets: () => this.getTargetCounts(filter),
      techs: () => this.getTechCounts(filter),
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
    if (statistics.length === 0) return;

    const toSave = await this.filterChangedStatistics(statistics);
    if (toSave.length > 0) {
      await this.saveStatistics(toSave);
    }
  }

  /**
   * Filters statistics, keeping only those where at least one numeric field
   * differs from the latest saved record for that workspace.
   * If no previous record exists, the statistic is always kept.
   * Uses DISTINCT ON for a single-query lookup per workspace — efficient
   * even with thousands of workspaces.
   */
  private async filterChangedStatistics(
    statistics: Statistic[],
  ): Promise<Statistic[]> {
    const repo = this.dataSource.getRepository(Statistic);
    const workspaceIds = statistics.map((s) => s.workspace.id);

    if (workspaceIds.length === 0) return [];

    const latestRecords = await repo
      .createQueryBuilder('s')
      .leftJoin('s.workspace', 'workspace')
      .addSelect(['workspace.id'])
      .distinctOn(['s.workspaceId'])
      .where('s.workspaceId IN (:...workspaceIds)', { workspaceIds })
      .orderBy('s.workspaceId', 'ASC')
      .addOrderBy('s.createdAt', 'DESC')
      .getMany();

    const latestMap = new Map(latestRecords.map((r) => [r.workspace.id, r]));

    return statistics.filter((stat) => {
      const latest = latestMap.get(stat.workspace.id);
      if (!latest) return true;

      return (
        latest.assets !== stat.assets ||
        latest.targets !== stat.targets ||
        latest.vuls !== stat.vuls ||
        latest.criticalVuls !== stat.criticalVuls ||
        latest.highVuls !== stat.highVuls ||
        latest.mediumVuls !== stat.mediumVuls ||
        latest.lowVuls !== stat.lowVuls ||
        latest.infoVuls !== stat.infoVuls ||
        latest.techs !== stat.techs ||
        latest.ports !== stat.ports ||
        latest.services !== stat.services ||
        Number(latest.score) !== Number(stat.score)
      );
    });
  }

  async takeSnapshotStatisticTarget(
    targetId: string,
  ): Promise<StatisticSnapshot> {
    const [[footprint], techs] = await Promise.all([
      this.getServiceFootprintCounts({ targetId }),
      this.getTechCounts({ targetId }).then((res) =>
        res.length > 0 ? Number(res[0].count) : 0,
      ),
    ]);

    return {
      hosts: Number(footprint?.hosts ?? 0),
      ports: Number(footprint?.ports ?? 0),
      services: Number(footprint?.services ?? 0),
      techs,
    };
  }

  /**
   * Hosts a run found first on a target, counted the way the snapshot counts
   * hosts (only those exposing a service), with a sorted preview of their
   * names. Empty for a run without an id or one that predates provenance.
   */
  async newHostsOfRun(
    jobHistoryId: string | undefined,
    targetId: string,
  ): Promise<{ total: number; sample: string[] }> {
    if (!jobHistoryId) return { total: 0, sample: [] };

    const query = this.dataSource
      .getRepository(Asset)
      .createQueryBuilder('asset')
      .where('asset.jobHistoryId = :jobHistoryId', { jobHistoryId })
      .andWhere('asset.targetId = :targetId', { targetId })
      .andWhere(
        'EXISTS (SELECT 1 FROM asset_services s WHERE s."assetId" = asset.id)',
      );
    const [total, sample] = await Promise.all([
      query.getCount(),
      query
        .clone()
        .select('asset.value', 'value')
        .orderBy('asset.value', 'ASC')
        .limit(NEW_HOSTS_PREVIEW)
        .getRawMany<{ value: string }>(),
    ]);
    return { total, sample: sample.map((row) => row.value) };
  }

  @OnEvent(EventTriggerType.WORKFLOW_START)
  async handleWorkflowStart(job: CreateJobs) {
    const filePath = job.workflow?.filePath;
    if (
      filePath &&
      [
        DefaultWorkflow.DOMAIN_DISCOVERY,
        DefaultWorkflow.IP_ADDRESS_DISCOVERY,
      ].includes(filePath as DefaultWorkflow) &&
      job.targetIds
    ) {
      //Take snapshot
      await Promise.all(
        job.targetIds.map(async (targetId) => {
          const snapshotPayload =
            await this.takeSnapshotStatisticTarget(targetId);
          await this.redisService.setex(
            `snapshot:${filePath}:${targetId}`,
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

      let beforeSnapshot: StatisticSnapshot = {
        hosts: 0,
        ports: 0,
        services: 0,
        techs: 0,
      };
      try {
        const raw = await this.redisService.get(redisKey);
        if (raw) {
          beforeSnapshot = JSON.parse(raw) as StatisticSnapshot;
        }
      } catch {
        // Corrupted or missing snapshot data — proceed with empty baseline
      }
      await this.redisService.del(redisKey);
      const afterSnapshot = await this.takeSnapshotStatisticTarget(
        job.asset.target.id,
      );

      const diffs: Partial<StatisticSnapshot> = {};
      for (const key in afterSnapshot) {
        const k = key as keyof StatisticSnapshot;
        const before = beforeSnapshot[k] ?? 0;
        const after = afterSnapshot[k];
        if (after > before) {
          diffs[k] = after - before;
        }
      }

      // A run can end without executing its whole graph: a failed step skips
      // every step that needs it. "New assets discovered" would read as "the
      // scan finished", and a run that died with nothing new to report would
      // stay silent — so a run that did not finish reports itself, separately,
      // naming what never ran. (Not a new argument on the discovery message:
      // notifications already stored have no such metadata key, and a missing
      // ICU variable makes the renderer fall back to raw template text.)
      const steps = job.jobHistory?.steps ?? {};
      const idsWith = (predicate: (state: RunStepState) => boolean) =>
        Object.entries(steps)
          .filter(([, state]) => predicate(state))
          .map(([id]) => id);

      const failedSteps = idsWith((state) => state.status === 'failed');
      const blockedSteps = idsWith(
        (state) => state.status === 'skipped' && state.reason === 'blocked-by-failure',
      );
      const cancelledSteps = idsWith(
        (state) => state.status === 'skipped' && state.reason === 'run-cancelled',
      );
      const incomplete =
        failedSteps.length + blockedSteps.length + cancelledSteps.length > 0;

      const members = await this.workspacesService.getMemberOfWorkspaceByJobId(
        job.id,
      );

      // A run belongs to a workspace even when the job row carries no
      // workspaceId of its own; the membership lookup is what resolves it. The
      // event bus requires a workspace on every event, so this is also where an
      // unresolvable run is dropped rather than published with a sentinel.
      if (members.length === 0) return;

      const workspaceId = members[0].workspace.id;
      const newHosts = await this.newHostsOfRun(
        job.jobHistory?.id,
        job.asset.target.id,
      );

      // Publish the run's OUTCOME, not a notification decision. Who gets told
      // what — and in which words — is the consumers' call; this service only
      // reports what happened. Recipients are resolved downstream, which is
      // what lets a member who joins tomorrow start receiving them.
      //
      // `outcome: 'failure'` means "this run did not finish cleanly" — not "the
      // publish failed" — so a partial run is still honest to every consumer.
      await this.eventBridge.publishSafely(
        EVENT_CATALOG.workflow.run.completed,
        {
          workspaceId,
          outcome: incomplete ? 'failure' : 'success',
          resourceType: 'workflow_run',
          resourceId: job.jobHistory?.id,
          payload: {
            targetValue: job.asset.target.value,
            targetId: job.asset.target.id,
            hosts: diffs.hosts ?? 0,
            ports: diffs.ports ?? 0,
            services: diffs.services ?? 0,
            techs: diffs.techs ?? 0,
            // Empty for a clean run; consumers decide whether a non-empty
            // list warrants the "scan stopped halfway" message.
            failedSteps,
            blockedSteps,
            cancelledSteps,
            newHosts: newHosts.sample,
            newHostsTotal: newHosts.total,
          } satisfies WorkflowRunCompletedPayload,
        },
        { subject: `workspace:${workspaceId}/workflow_run:${job.id}` },
      );
    }
  }
}
