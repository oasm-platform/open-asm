import {
  BullMQName,
  CronSchedule,
  JobRunType,
  JobStatus,
  Severity,
} from '@/common/enums/enum';
import type { SeverityCountsDto } from '@/modules/projects/dto/project-assets.dto';
import type { WeeklyNewVulnerabilitiesDto } from '@/modules/projects/dto/project-results.dto';
import { RUN_STATUS_SQL, SEVERITY_RANK_SQL } from '@/modules/projects/provenance';
import {
  approvedVulnerabilityCondition,
  fixedVulnerabilityCondition,
  openVulnerabilityCondition,
} from '@/modules/vulnerabilities/open-vulnerability';
import { getManyResponse } from '@/utils/getManyResponse';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import {
  type GetTargetChangesQueryDto,
  type GetTargetRunsQueryDto,
  InsightLevel,
  type NameCountDto,
  type ScanProgressDto,
  type TargetChangeDto,
  TargetChangeKind,
  type TargetInsightDto,
  TargetInsightKind,
  type TargetIssueRefDto,
  type TargetOverviewDto,
  type TargetProjectRefDto,
  type TargetRunDto,
  type TargetsSummaryDto,
  type TargetTopVulnerabilityDto,
} from './dto/target-overview.dto';
import { Target } from './entities/target.entity';

const SEVERITIES = Object.values(Severity);

/** Days after which a target that was not discovered again counts as stale. */
export const STALE_DAYS = 30;
/** Days before expiry a TLS certificate is flagged. */
const TLS_EXPIRY_DAYS = 30;
/** Rows per exposure list. */
const EXPOSURE_LIMIT = 6;

/** Assets of the target `$1` (a uuid). */
const TARGET_ASSETS = `SELECT id FROM assets WHERE "targetId" = $1::uuid`;

/**
 * Runs that touched the target: they have a job on one of its assets, or
 * recorded it in their scope (a run whose first jobs are not created yet).
 */
const TARGET_RUNS = `
  SELECT DISTINCT j."jobHistoryId" AS id
    FROM jobs j JOIN assets a ON a.id = j."assetId"
   WHERE a."targetId" = $1::uuid AND j."jobHistoryId" IS NOT NULL
  UNION
  SELECT jh.id FROM job_histories jh
   WHERE jh.scope -> 'targetIds' @> jsonb_build_array($1::uuid::text)`;

/** A run still to finish, among those of the last week. */
const ACTIVE_RUN_SQL = `(NOT jh."isCompleted"
  AND jh."createdAt" > LOCALTIMESTAMP - interval '7 days'
  AND ${RUN_STATUS_SQL} IN ('${JobStatus.PENDING}', '${JobStatus.IN_PROGRESS}'))`;

/** `count` rows of (severity, count) → a full severity record. */
export function toSeverityCounts(
  rows: Array<{ severity: string; count: number | string }>,
): SeverityCountsDto {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const row of rows) {
    const key = (SEVERITIES as string[]).includes(row.severity)
      ? (row.severity as keyof SeverityCountsDto)
      : 'info';
    counts[key] += Number(row.count);
  }
  return counts;
}

/** Days since `date`, rounded down; null when there is none. */
function daysSince(date: Date | null | undefined, now = Date.now()): number | null {
  if (!date) return null;
  return Math.floor((now - new Date(date).getTime()) / 86_400_000);
}

/**
 * What a target needs attention for, worst first. Pure, so the rules are
 * tested without a database.
 */
export function buildTargetInsights(input: {
  openCritical: number;
  tlsExpiring: number;
  newAssets: number;
  lastRun: Pick<TargetRunDto, 'id' | 'status'> | null;
  lastDiscoveredAt: Date | null;
  scanSchedule: CronSchedule | null;
  now?: number;
}): TargetInsightDto[] {
  const insights: TargetInsightDto[] = [];
  if (input.openCritical > 0) {
    insights.push({
      kind: TargetInsightKind.CRITICAL_OPEN,
      level: InsightLevel.CRITICAL,
      count: input.openCritical,
    });
  }
  if (input.lastRun?.status === JobStatus.FAILED) {
    insights.push({
      kind: TargetInsightKind.LAST_RUN_FAILED,
      level: InsightLevel.WARNING,
      runId: input.lastRun.id,
    });
  }
  if (input.tlsExpiring > 0) {
    insights.push({
      kind: TargetInsightKind.TLS_EXPIRING,
      level: InsightLevel.WARNING,
      count: input.tlsExpiring,
      days: TLS_EXPIRY_DAYS,
    });
  }
  const days = daysSince(input.lastDiscoveredAt, input.now);
  if (days !== null && days >= STALE_DAYS) {
    insights.push({
      kind: TargetInsightKind.STALE_SCAN,
      level: InsightLevel.WARNING,
      days,
    });
  }
  if (input.newAssets > 0) {
    insights.push({
      kind: TargetInsightKind.NEW_ASSETS,
      level: InsightLevel.INFO,
      count: input.newAssets,
      days: 7,
    });
  }
  if (!input.scanSchedule || input.scanSchedule === CronSchedule.DISABLED) {
    insights.push({ kind: TargetInsightKind.NO_SCHEDULE, level: InsightLevel.INFO });
  }
  return insights;
}

/** Overview, runs and changes of one target, plus the workspace summary. */
@Injectable()
export class TargetOverviewService {
  private readonly logger = new Logger(TargetOverviewService.name);

  constructor(
    @InjectRepository(Target)
    private readonly repo: Repository<Target>,
    private readonly dataSource: DataSource,
    @InjectQueue(BullMQName.ASSETS_DISCOVERY_SCHEDULE)
    private readonly scheduleQueue: Queue,
  ) {}

  private async findTargetOrFail(id: string, workspaceId: string): Promise<Target> {
    const target = await this.repo.findOneBy({ id, workspaceId });
    if (!target) throw new NotFoundException('Target not found');
    return target;
  }

  /** When the scan schedule of the target fires next; null when unscheduled. */
  async nextScanAt(target: Pick<Target, 'jobId' | 'scanSchedule'>): Promise<Date | null> {
    if (!target.jobId || !target.scanSchedule || target.scanSchedule === CronSchedule.DISABLED) {
      return null;
    }
    try {
      const scheduler = await this.scheduleQueue.getJobScheduler(target.jobId);
      return scheduler?.next ? new Date(scheduler.next) : null;
    } catch (error) {
      this.logger.warn(`Could not read the scan schedule ${target.jobId}: ${String(error)}`);
      return null;
    }
  }

  async overview(id: string, workspaceId: string): Promise<TargetOverviewDto> {
    const target = await this.findTargetOrFail(id, workspaceId);
    const q = <T>(sql: string, params: unknown[] = [id]) =>
      this.dataSource.query<T>(sql, params);

    const [
      assets,
      services,
      open,
      fresh,
      fixed,
      weekly,
      top,
      ports,
      technologies,
      statusCodes,
      tls,
      projects,
      issues,
      lastRuns,
      activeRuns,
      nextScanAt,
    ] = await Promise.all([
      q<Array<{ total: number; recent: number }>>(
        `SELECT COUNT(*) FILTER (WHERE "isEnabled")::int AS total,
                COUNT(*) FILTER (WHERE "isEnabled" AND "createdAt" > LOCALTIMESTAMP - interval '7 days')::int AS recent
           FROM assets WHERE "targetId" = $1::uuid`,
      ),
      q<Array<{ total: number; recent: number; ports: number }>>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE s."createdAt" > LOCALTIMESTAMP - interval '7 days')::int AS recent,
                COUNT(DISTINCT s.port)::int AS ports
           FROM asset_services s WHERE s."assetId" IN (${TARGET_ASSETS})`,
      ),
      q<Array<{ severity: string; count: number }>>(
        `SELECT v.severity, COUNT(*)::int AS count FROM vulnerabilities v
          WHERE v."assetId" IN (${TARGET_ASSETS}) AND ${openVulnerabilityCondition('v')}
          GROUP BY v.severity`,
      ),
      q<Array<{ count: number }>>(
        `SELECT COUNT(*)::int AS count FROM vulnerabilities v
          WHERE v."assetId" IN (${TARGET_ASSETS}) AND ${openVulnerabilityCondition('v')}
            AND v."createdAt" > LOCALTIMESTAMP - interval '7 days'`,
      ),
      q<Array<{ count: number }>>(
        `SELECT COUNT(*)::int AS count FROM vulnerabilities v
          WHERE v."assetId" IN (${TARGET_ASSETS}) AND ${fixedVulnerabilityCondition('v')}
            AND v."fixedAt" > now() - interval '7 days'`,
      ),
      q<WeeklyNewVulnerabilitiesDto[]>(
        `SELECT to_char(w.week, 'YYYY-MM-DD') AS week,
                ${SEVERITIES.map(
                  (s) => `COUNT(v.id) FILTER (WHERE v.severity = '${s}')::int AS ${s}`,
                ).join(', ')}
           FROM generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') AS w(week)
           LEFT JOIN vulnerabilities v
             ON v."assetId" IN (${TARGET_ASSETS}) AND ${approvedVulnerabilityCondition('v')}
            AND date_trunc('week', v."createdAt") = w.week
          GROUP BY w.week ORDER BY w.week`,
      ),
      q<TargetTopVulnerabilityDto[]>(
        `SELECT v.id, v.name, v.severity, a.value AS "assetValue", v."cveId", v."createdAt"
           FROM vulnerabilities v JOIN assets a ON a.id = v."assetId"
          WHERE a."targetId" = $1::uuid AND ${openVulnerabilityCondition('v')}
          ORDER BY ${SEVERITY_RANK_SQL} DESC, v."createdAt" DESC LIMIT 5`,
      ),
      q<NameCountDto[]>(
        `SELECT s.port::text AS name, COUNT(*)::int AS count
           FROM asset_services s WHERE s."assetId" IN (${TARGET_ASSETS})
          GROUP BY s.port ORDER BY count DESC, s.port LIMIT ${EXPOSURE_LIMIT}`,
      ),
      q<NameCountDto[]>(
        `SELECT t.name, COUNT(DISTINCT t."assetServiceId")::int AS count
           FROM http_response_technologies t JOIN asset_services s ON s.id = t."assetServiceId"
          WHERE s."assetId" IN (${TARGET_ASSETS})
          GROUP BY t.name ORDER BY count DESC, t.name LIMIT ${EXPOSURE_LIMIT}`,
      ),
      q<NameCountDto[]>(
        `SELECT c."statusCode"::text AS name, COUNT(DISTINCT c."assetServiceId")::int AS count
           FROM http_status_codes c JOIN asset_services s ON s.id = c."assetServiceId"
          WHERE c."isPrimary" AND c."statusCode" > 0 AND s."assetId" IN (${TARGET_ASSETS})
          GROUP BY c."statusCode" ORDER BY count DESC, c."statusCode" LIMIT ${EXPOSURE_LIMIT}`,
      ),
      q<Array<{ count: number }>>(
        `SELECT COUNT(*)::int AS count FROM (
           SELECT DISTINCT ON (c."assetServiceId") c."notAfter"
             FROM tls_certificates c JOIN asset_services s ON s.id = c."assetServiceId"
            WHERE s."assetId" IN (${TARGET_ASSETS}) AND c."notAfter" IS NOT NULL
            ORDER BY c."assetServiceId", c."createdAt" DESC
         ) latest WHERE latest."notAfter" < now() + interval '${TLS_EXPIRY_DAYS} days'`,
      ),
      q<TargetProjectRefDto[]>(
        `SELECT p.id, p.name, p."hexColor", COUNT(*)::int AS assets
           FROM project_assets pa JOIN projects p ON p.id = pa."projectId"
          WHERE pa."assetId" IN (${TARGET_ASSETS}) AND p."archivedAt" IS NULL
          GROUP BY p.id, p.name, p."hexColor" ORDER BY assets DESC, p.name LIMIT 6`,
      ),
      q<TargetIssueRefDto[]>(
        `SELECT i.id, i.no, i.title, i.status, i.priority FROM issues i
          WHERE i."workspaceId" = $2 AND i.status IN ('open', 'in_progress')
            AND EXISTS (
              SELECT 1 FROM issue_links l WHERE l."issueId" = i.id AND (
                   (l."resourceType" = 'target' AND l."resourceId" = $1::uuid)
                OR (l."resourceType" = 'asset' AND l."resourceId" IN (${TARGET_ASSETS}))
                OR (l."resourceType" = 'vulnerability' AND l."resourceId" IN (
                      SELECT v.id FROM vulnerabilities v WHERE v."assetId" IN (${TARGET_ASSETS})))))
          ORDER BY i."createdAt" DESC LIMIT 5`,
        [id, workspaceId],
      ),
      this.runRows(id, { limit: 1, offset: 0 }),
      this.runRows(id, { limit: 5, offset: 0, active: true }),
      this.nextScanAt(target),
    ]);

    const openVulnerabilities = toSeverityCounts(open);
    const lastRun = lastRuns[0] ?? null;
    const newAssets = assets[0]?.recent ?? 0;

    return {
      totalAssets: assets[0]?.total ?? 0,
      newAssets,
      totalServices: services[0]?.total ?? 0,
      newServices: services[0]?.recent ?? 0,
      openPorts: services[0]?.ports ?? 0,
      openVulnerabilities,
      newVulnerabilities: fresh[0]?.count ?? 0,
      fixedVulnerabilities: fixed[0]?.count ?? 0,
      nextScanAt,
      lastRun,
      activeRuns,
      weekly,
      topVulnerabilities: top,
      exposure: { ports, technologies, statusCodes },
      insights: buildTargetInsights({
        openCritical: openVulnerabilities.critical,
        tlsExpiring: tls[0]?.count ?? 0,
        newAssets,
        lastRun,
        lastDiscoveredAt: target.lastDiscoveredAt,
        scanSchedule: target.scanSchedule,
      }),
      projects,
      issues,
    };
  }

  /** Runs that scanned the target, newest first. */
  async runs(id: string, workspaceId: string, query: GetTargetRunsQueryDto) {
    await this.findTargetOrFail(id, workspaceId);
    const limit = Number(query.limit);
    const offset = (Number(query.page) - 1) * limit;
    const activeSql = query.active ? `AND ${ACTIVE_RUN_SQL}` : '';
    const [[{ total }], data] = await Promise.all([
      this.dataSource.query<Array<{ total: number }>>(
        `SELECT COUNT(*)::int AS total FROM job_histories jh
          WHERE jh.id IN (${TARGET_RUNS}) ${activeSql}`,
        [id],
      ),
      this.runRows(id, { limit, offset, active: query.active }),
    ]);
    return getManyResponse({ query, data, total });
  }

  private async runRows(
    targetId: string,
    { limit, offset, active }: { limit: number; offset: number; active?: boolean },
  ): Promise<TargetRunDto[]> {
    const rows = await this.dataSource.query<Array<Record<string, unknown>>>(
      `SELECT jh.id, jh."createdAt", jh."updatedAt", jh."isCompleted", jh."jobRunType",
              jh."projectId", p.name AS "projectName",
              COALESCE(w.name, jh."jobHistoryName", '') AS "workflowName",
              ${RUN_STATUS_SQL} AS status,
              stats.total AS "jobsTotal", stats.done AS "jobsDone",
              stats.failed AS "jobsFailed", stats.running AS "jobsRunning",
              (SELECT t.name FROM jobs cj JOIN assets ca ON ca.id = cj."assetId"
                 JOIN tools t ON t.id = cj."toolId"
                WHERE cj."jobHistoryId" = jh.id AND ca."targetId" = $1::uuid
                  AND cj.status = '${JobStatus.IN_PROGRESS}'
                ORDER BY cj."pickJobAt" DESC NULLS LAST LIMIT 1) AS "currentTool",
              (SELECT COUNT(*)::int FROM vulnerabilities v
                WHERE v."jobHistoryId" = jh.id AND v."assetId" IN (${TARGET_ASSETS})) AS "newVulnerabilities"
         FROM job_histories jh
         LEFT JOIN workflows w ON w.id = jh."workflowId"
         LEFT JOIN projects p ON p.id = jh."projectId"
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE j.status IN ('${JobStatus.COMPLETED}', 'skipped'))::int AS done,
                  COUNT(*) FILTER (WHERE j.status = '${JobStatus.FAILED}')::int AS failed,
                  COUNT(*) FILTER (WHERE j.status = '${JobStatus.IN_PROGRESS}')::int AS running
             FROM jobs j JOIN assets a ON a.id = j."assetId"
            WHERE j."jobHistoryId" = jh.id AND a."targetId" = $1::uuid
         ) stats ON true
        WHERE jh.id IN (${TARGET_RUNS}) ${active ? `AND ${ACTIVE_RUN_SQL}` : ''}
        ORDER BY jh."createdAt" DESC
        LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
      [targetId],
    );
    return rows.map((row) => ({
      id: row.id as string,
      createdAt: row.createdAt as Date,
      updatedAt: row.updatedAt as Date,
      isCompleted: Boolean(row.isCompleted),
      status: row.status as JobStatus,
      jobRunType: row.jobRunType as JobRunType,
      workflowName: (row.workflowName as string | null) ?? '',
      projectId: (row.projectId as string | null) ?? null,
      projectName: (row.projectName as string | null) ?? null,
      jobsTotal: Number(row.jobsTotal ?? 0),
      jobsDone: Number(row.jobsDone ?? 0),
      jobsFailed: Number(row.jobsFailed ?? 0),
      jobsRunning: Number(row.jobsRunning ?? 0),
      currentTool: (row.currentTool as string | null) ?? null,
      newVulnerabilities: Number(row.newVulnerabilities ?? 0),
    }));
  }

  /**
   * What appeared on the target, newest first, a page at a time: assets,
   * services and vulnerabilities found, and vulnerabilities a scan confirmed
   * fixed. Rows that share a time are ordered by kind then id, so pages never
   * overlap or skip a row.
   */
  async changes(id: string, workspaceId: string, query: GetTargetChangesQueryDto) {
    await this.findTargetOrFail(id, workspaceId);
    const limit = Number(query.limit);
    const offset = (Number(query.page) - 1) * limit;
    // Each kind needs at most the rows up to the end of the page.
    const take = offset + limit;
    const sources: Record<TargetChangeKind, { select: string; from: string; at: string }> = {
      [TargetChangeKind.ASSET]: {
        select: `'asset' AS kind, a."createdAt" AS at, a.id, a.value AS label,
                 NULL::varchar AS "assetValue", NULL::varchar AS severity`,
        from: `assets a WHERE a."targetId" = $1::uuid AND NOT a."isPrimary"`,
        at: 'a."createdAt"',
      },
      [TargetChangeKind.SERVICE]: {
        select: `'service' AS kind, s."createdAt" AS at, s.id, s.value AS label,
                 a.value AS "assetValue", NULL::varchar AS severity`,
        from: `asset_services s JOIN assets a ON a.id = s."assetId" WHERE a."targetId" = $1::uuid`,
        at: 's."createdAt"',
      },
      [TargetChangeKind.VULNERABILITY]: {
        select: `'vulnerability' AS kind, v."createdAt" AS at, v.id, v.name AS label,
                 a.value AS "assetValue", v.severity`,
        from: `vulnerabilities v JOIN assets a ON a.id = v."assetId"
               WHERE a."targetId" = $1::uuid AND ${approvedVulnerabilityCondition('v')}`,
        at: 'v."createdAt"',
      },
      [TargetChangeKind.FIXED]: {
        select: `'fixed' AS kind, v."fixedAt"::timestamp AS at, v.id, v.name AS label,
                 a.value AS "assetValue", v.severity`,
        from: `vulnerabilities v JOIN assets a ON a.id = v."assetId"
               WHERE a."targetId" = $1::uuid AND ${fixedVulnerabilityCondition('v')}
                 AND v."fixedAt" IS NOT NULL`,
        at: 'v."fixedAt"',
      },
    };
    const kinds = query.kind ? [query.kind] : Object.values(TargetChangeKind);
    const [[{ total }], rows] = await Promise.all([
      this.dataSource.query<Array<{ total: number }>>(
        `SELECT (${kinds
          .map((kind) => `(SELECT COUNT(*) FROM ${sources[kind].from})`)
          .join(' + ')})::int AS total`,
        [id],
      ),
      this.dataSource.query<TargetChangeDto[]>(
        `SELECT * FROM (${kinds
          .map(
            (kind) =>
              `(SELECT ${sources[kind].select} FROM ${sources[kind].from}
                 ORDER BY ${sources[kind].at} DESC, id LIMIT ${take})`,
          )
          .join(' UNION ALL ')}) changes
          ORDER BY at DESC, kind, id LIMIT ${limit} OFFSET ${offset}`,
        [id],
      ),
    ]);
    const data = rows.map((row) => ({
      ...row,
      assetValue: row.assetValue ?? null,
      severity: row.severity ?? null,
    }));
    return getManyResponse({ query, data, total });
  }

  /**
   * Adds to a page of the target list what the overview shows in brief: open
   * vulnerabilities by severity, progress of the runs still going, the next
   * scheduled scan and the projects. One query per field for the whole page,
   * kept out of the aggregated list query so they cannot skew its counts.
   */
  async withListDetails<T extends { id: string }>(
    rows: T[],
  ): Promise<
    Array<
      T & {
        openVulnerabilities: SeverityCountsDto;
        scanProgress: ScanProgressDto | null;
        nextScanAt: Date | null;
        projects: TargetProjectRefDto[];
      }
    >
  > {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const q = <R>(sql: string) => this.dataSource.query<R>(sql, [ids]);
    const [vulns, progress, projects, schedules] = await Promise.all([
      q<Array<{ targetId: string; severity: string; count: number }>>(
        `SELECT a."targetId", v.severity, COUNT(*)::int AS count
           FROM vulnerabilities v JOIN assets a ON a.id = v."assetId"
          WHERE a."targetId" = ANY($1::uuid[]) AND ${openVulnerabilityCondition('v')}
          GROUP BY a."targetId", v.severity`,
      ),
      q<Array<{ targetId: string; done: number; total: number }>>(
        `WITH active AS (
           SELECT DISTINCT a."targetId", j."jobHistoryId"
             FROM jobs j JOIN assets a ON a.id = j."assetId"
            WHERE a."targetId" = ANY($1::uuid[]) AND j."jobHistoryId" IS NOT NULL
              AND j.status IN ('${JobStatus.PENDING}', '${JobStatus.IN_PROGRESS}')
         )
         SELECT active."targetId", COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE j.status NOT IN ('${JobStatus.PENDING}', '${JobStatus.IN_PROGRESS}'))::int AS done
           FROM active
           JOIN jobs j ON j."jobHistoryId" = active."jobHistoryId"
           JOIN assets a ON a.id = j."assetId" AND a."targetId" = active."targetId"
          GROUP BY active."targetId"`,
      ),
      q<Array<TargetProjectRefDto & { targetId: string }>>(
        `SELECT a."targetId", p.id, p.name, p."hexColor", COUNT(*)::int AS assets
           FROM project_assets pa
           JOIN assets a ON a.id = pa."assetId"
           JOIN projects p ON p.id = pa."projectId"
          WHERE a."targetId" = ANY($1::uuid[]) AND p."archivedAt" IS NULL
          GROUP BY a."targetId", p.id, p.name, p."hexColor"
          ORDER BY assets DESC, p.name`,
      ),
      q<Array<Pick<Target, 'id' | 'jobId' | 'scanSchedule'>>>(
        `SELECT id, "jobId", "scanSchedule" FROM targets WHERE id = ANY($1::uuid[])`,
      ),
    ]);
    const nextScans = new Map(
      await Promise.all(
        schedules.map(async (row) => [row.id, await this.nextScanAt(row)] as const),
      ),
    );
    const progressBy = new Map(progress.map((row) => [row.targetId, row]));
    return rows.map((row) => ({
      ...row,
      openVulnerabilities: toSeverityCounts(
        vulns.filter((v) => v.targetId === row.id),
      ),
      scanProgress: progressBy.has(row.id)
        ? {
            done: progressBy.get(row.id)!.done,
            total: progressBy.get(row.id)!.total,
          }
        : null,
      nextScanAt: nextScans.get(row.id) ?? null,
      projects: projects
        .filter((p) => p.targetId === row.id)
        .map(({ id, name, hexColor, assets }) => ({ id, name, hexColor, assets })),
    }));
  }

  /** Counts behind the strip above the target list. */
  async summary(workspaceId: string): Promise<TargetsSummaryDto> {
    const q = <T>(sql: string) => this.dataSource.query<T>(sql, [workspaceId]);
    const workspaceAssets = `SELECT a.id FROM assets a JOIN targets t ON t.id = a."targetId" WHERE t."workspaceId" = $1`;
    const [[counts], open] = await Promise.all([
      q<Array<Omit<TargetsSummaryDto, 'openVulnerabilities'>>>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE EXISTS (
                  SELECT 1 FROM jobs j JOIN assets a ON a.id = j."assetId"
                   WHERE a."targetId" = t.id AND j.status IN ('${JobStatus.PENDING}', '${JobStatus.IN_PROGRESS}')))::int AS scanning,
                COUNT(*) FILTER (WHERE EXISTS (
                  SELECT 1 FROM vulnerabilities v JOIN assets a ON a.id = v."assetId"
                   WHERE a."targetId" = t.id AND v.severity = '${Severity.CRITICAL}'
                     AND ${openVulnerabilityCondition('v')}))::int AS "withCritical",
                COUNT(*) FILTER (WHERE t."scanSchedule" IS NOT NULL
                  AND t."scanSchedule" <> '${CronSchedule.DISABLED}')::int AS scheduled,
                COUNT(*) FILTER (WHERE t."lastDiscoveredAt" IS NULL
                  OR t."lastDiscoveredAt" < LOCALTIMESTAMP - interval '${STALE_DAYS} days')::int AS stale
           FROM targets t WHERE t."workspaceId" = $1`,
      ),
      q<Array<{ severity: string; count: number }>>(
        `SELECT v.severity, COUNT(*)::int AS count FROM vulnerabilities v
          WHERE v."assetId" IN (${workspaceAssets}) AND ${openVulnerabilityCondition('v')}
          GROUP BY v.severity`,
      ),
    ]);
    return {
      total: counts?.total ?? 0,
      scanning: counts?.scanning ?? 0,
      withCritical: counts?.withCritical ?? 0,
      scheduled: counts?.scheduled ?? 0,
      stale: counts?.stale ?? 0,
      openVulnerabilities: toSeverityCounts(open),
    };
  }
}
