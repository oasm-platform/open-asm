import type { WrapperType } from '@/common/types/app.types';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import {
  type GetManyBaseResponseDto,
  SortOrder,
} from '@/common/dtos/get-many-base.dto';
import {
  BullMQName,
  DismissReason,
  IssueLinkResourceType,
  IssueStatus,
  JobRunType,
  Severity,
  TargetType,
  ToolCategory,
  VulnerabilityAnalyzeStatus,
  VulnerabilityDetectionStatus,
  VulnerabilityEventType,
  VulnerabilityReviewStatus,
  VulnerabilitySourceKind,
} from '@/common/enums/enum';
import { getManyResponse } from '@/utils/getManyResponse';
import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Inject,
  forwardRef,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { DataSource, In, Repository } from 'typeorm';
import { AgentsCompletionsService } from '../agents/agents.completions';
import { User } from '../auth/entities/user.entity';
import { JobsRegistryService } from '../jobs-registry/jobs-registry.service';
import { WorkflowRunnerService } from '../jobs-registry/workflow-runner.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Target } from '../targets/entities/target.entity';
import { ToolsService } from '../tools/tools.service';
import { WorkflowsService } from '../workflows/workflows.service';
import { normalizeInput, orderedJobEntries } from '../workflows/workflow-graph';
import type {
  GetVulnerabilitiesStatisticsQueryDto,
  GetVulnerabilitiesStatisticsResponseDto,
} from './dto/get-vulnerability-statistics.dto';
import type { GetVulnerabilitiesQueryDto } from './dto/get-vulnerability.dto';
import type {
  GetVulnerabilityActivityQueryDto,
  VulnerabilityActivityDto,
} from './dto/vulnerability-activity.dto';
import type {
  ClaimFixResponseDto,
  ReopenVulnerabilitiesResponseDto,
  VulnerabilityDetailDto,
  VulnerabilityDismissalInfoDto,
  VulnerabilityListItemDto,
  VulnerabilityOpenIssueDto,
  VulnerabilityProjectSightingDto,
  VulnerabilitySourceSummaryDto,
  VulnerabilityTimelineResponseDto,
  VulnerabilityUserRefDto,
} from './dto/vulnerability-response.dto';
import {
  PROVENANCE_SQL,
  REFERENCE_RUN_JOIN,
  VulnerabilityProvenance,
} from '../projects/provenance';
import { VulnerabilityDismissal } from './entities/vulnerability-dismissal.entity';
import { VulnerabilityEvent } from './entities/vulnerability-event.entity';
import { Vulnerability } from './entities/vulnerability.entity';
import { openVulnerabilityCondition } from './open-vulnerability';
import { compileVulnerabilityFilter } from './vulnerability-filter';
import {
  insertInChunks,
  loadVulnerabilitySettings,
} from './vulnerability-lifecycle';
import { vulnerabilityStatusCondition } from './vulnerability-status';

const DAY_MS = 24 * 60 * 60 * 1000;

const ALL_SEVERITIES: Severity[] = [
  Severity.INFO,
  Severity.LOW,
  Severity.MEDIUM,
  Severity.HIGH,
  Severity.CRITICAL,
];

/** Sort columns that may be NULL: their NULLs go last either way. */
const NULLABLE_SORT_COLUMNS = new Set([
  'dueAt',
  'firstDetectedDate',
  'lastSeenDate',
  'fixedAt',
  'cvssScore',
  'epssScore',
]);

const OPEN_DETECTION_STATUSES = new Set<VulnerabilityDetectionStatus>([
  VulnerabilityDetectionStatus.NEW,
  VulnerabilityDetectionStatus.ACTIVE,
  VulnerabilityDetectionStatus.RESURFACED,
]);

/** A dismissal as responses expose it (the user as id/name/image only). */
function toDismissalInfo(
  dismissal: VulnerabilityDismissal | null | undefined,
): VulnerabilityDismissalInfoDto | null {
  if (!dismissal) return null;
  return {
    reason: dismissal.reason,
    comment: dismissal.comment ?? null,
    expiresAt: dismissal.expiresAt ?? null,
    createdAt: dismissal.createdAt,
    user: dismissal.user
      ? {
          id: dismissal.user.id,
          name: dismissal.user.name,
          image: dismissal.user.image ?? null,
        }
      : null,
  };
}

@Injectable()
export class VulnerabilitiesService {
  private readonly logger = new Logger(VulnerabilitiesService.name);

  constructor(
    @InjectRepository(Vulnerability)
    private vulnerabilitiesRepository: Repository<Vulnerability>,
    @InjectRepository(VulnerabilityDismissal)
    private dismissRepo: Repository<VulnerabilityDismissal>,
    @InjectQueue(BullMQName.VULNERABILITY_ANALYSIS)
    private vulnerabilityAnalysisQueue: Queue,
    private jobRegistryService: JobsRegistryService,
    private toolsService: ToolsService,
    private workflowService: WorkflowsService,
    // agents ↔ vulnerabilities import each other (tools ↔ analysis).
    @Inject(forwardRef(() => AgentsCompletionsService))
    private agentsCompletionsService: WrapperType<AgentsCompletionsService>,
    private notificationsService: NotificationsService,
    @InjectRepository(Target)
    private targetRepository: Repository<Target>,
    private workflowRunnerService: WorkflowRunnerService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Initiates a vulnerability scan for the given targets. Host targets
   * (DOMAIN, CIDR, IP) run the nuclei step of `vulnerability_scan_basic`,
   * once per web service discovery found (else once per host); Git
   * organization targets run the whole `repository_scan` workflow.
   *
   * @param targetIds - The IDs of the targets to scan.
   * @returns A message indicating the scan has started.
   */
  public async scan(targetIds: string[], workspaceId: string) {
    const targets = await this.targetRepository.find({
      where: { id: In(targetIds), workspaceId },
      select: { id: true, type: true, value: true },
    });
    if (targets.length === 0) {
      throw new NotFoundException('No targets found in the workspace.');
    }

    const gitOrgTargets = targets.filter((t) => t.type === TargetType.GIT_ORG);
    const hostTargetIds = targets
      .filter((t) => t.type !== TargetType.GIT_ORG)
      .map((t) => t.id);

    // Resolve every workflow first so a missing one fails before anything is
    // dispatched.
    const hostWorkflow = hostTargetIds.length
      ? await this.findScanWorkflow('vulnerability_scan_basic.yaml', workspaceId)
      : null;
    const repositoryWorkflow = gitOrgTargets.length
      ? await this.findScanWorkflow('repository_scan.yaml', workspaceId)
      : null;

    if (hostWorkflow) {
      const tools = await this.toolsService.getToolByNames({
        names: ['nuclei'],
      });
      // Dependency order, not stored order: `content.jobs` is a map and jsonb
      // does not preserve its key order, so "the first job" is only meaningful
      // when it is derived from the graph.
      const job = orderedJobEntries(hostWorkflow.content.jobs)[0]?.[1];
      await this.jobRegistryService.createNewJob({
        tool: tools[0],
        workflow: hostWorkflow,
        targetIds: hostTargetIds,
        priority: tools[0].priority,
        workspaceId,
        config: job?.config,
        configProfileId: job?.configProfileId,
        category: job?.category as ToolCategory | undefined,
        // What nuclei takes, as a workflow run would: the template's
        // `input: [web, host]` scans every live web service, not just the host.
        input: normalizeInput(job?.input),
      });
    }

    if (repositoryWorkflow) {
      // Every step (secrets, dependencies…) runs, not just the first one.
      await this.workflowRunnerService.startRun({
        workflow: repositoryWorkflow,
        workspaceId,
        jobName:
          gitOrgTargets.length === 1
            ? `${repositoryWorkflow.name} - ${gitOrgTargets[0].value}`
            : `${repositoryWorkflow.name} - ${gitOrgTargets.length} targets`,
        jobRunType: JobRunType.MANUAL,
        targetIds: gitOrgTargets.map((t) => t.id),
      });
    }

    return { message: `Scanning ${targets.length} target(s)...` };
  }

  private async findScanWorkflow(filePath: string, workspaceId: string) {
    const workflow = await this.workflowService.workflowRepository.findOne({
      where: { workspace: { id: workspaceId }, filePath },
    });
    if (!workflow) {
      throw new NotFoundException(
        `Scanning workflow ${filePath} not found in the workspace.`,
      );
    }
    return workflow;
  }

  /**
   * Lists the workspace's vulnerabilities. `status` defaults to open; every
   * status but pending_review/rejected implies an approved finding, so AI
   * proposals never show up as findings. Each row carries its dismissal, a
   * compact source summary and the issue still tracking it.
   */
  async getVulnerabilities(
    query: GetVulnerabilitiesQueryDto,
    workspaceId: string,
  ): Promise<GetManyBaseResponseDto<VulnerabilityListItemDto>> {
    const {
      limit,
      page,
      sortOrder,
      targetIds,
      q,
      status,
      severity,
      createdFrom,
      createdTo,
      tags,
      targetId,
      filter,
      overdue,
      discoveredBy,
      projectId,
      provenance,
      jobHistoryId,
    } = query;

    const { sortBy } = query;

    const queryBuilder = this.vulnerabilitiesRepository
      .createQueryBuilder('vulnerabilities')
      .leftJoin('vulnerabilities.asset', 'assets')
      .addSelect(['assets.id', 'assets.value'])
      .leftJoin('assets.target', 'targets')
      .leftJoinAndSelect('vulnerabilities.tool', 'tools')
      .leftJoinAndSelect('vulnerabilities.vulnerabilityDismissal', 'dismissal')
      .leftJoin('dismissal.user', 'dismissalUser')
      .addSelect(['dismissalUser.id', 'dismissalUser.name', 'dismissalUser.image'])
      .where('targets.workspaceId = :workspaceId', { workspaceId })
      .andWhere(vulnerabilityStatusCondition(status, 'vulnerabilities'))
      .skip((page - 1) * limit)
      .take(limit);

    // Handle severity sorting with proper order
    if (sortBy === 'severity') {
      const { select, orderBy } = this.buildSeverityOrderQuery(sortOrder);
      queryBuilder.addSelect(select, 'severity_order').orderBy(orderBy, 'ASC');
    } else {
      queryBuilder.orderBy(
        `vulnerabilities.${sortBy}`,
        sortOrder,
        NULLABLE_SORT_COLUMNS.has(sortBy) ? 'NULLS LAST' : undefined,
      );
    }

    if (targetIds) {
      queryBuilder.andWhere('targets.id IN (:...targetIds)', { targetIds });
    }

    if (targetId) {
      queryBuilder.andWhere('targets.id = :targetId', { targetId });
    }

    // Add search query if provided
    if (q) {
      queryBuilder.andWhere('"vulnerabilities"."name" ILIKE :q', {
        q: `%${q}%`,
      });
    }

    if (overdue) {
      queryBuilder
        .andWhere(openVulnerabilityCondition('vulnerabilities'))
        .andWhere('vulnerabilities.dueAt < now()');
    }

    if (Array.isArray(discoveredBy) && discoveredBy.length > 0) {
      queryBuilder.andWhere(
        'vulnerabilities.discoveredBy IN (:...discoveredBy)',
        { discoveredBy },
      );
    }

    // Filter by severity levels
    if (Array.isArray(severity) && severity.length > 0) {
      queryBuilder.andWhere('vulnerabilities.severity IN (:...severity)', {
        severity,
      });
    }

    // Date range on the first detection (an approved AI proposal is
    // "detected" when it was approved).
    if (createdFrom) {
      queryBuilder.andWhere('vulnerabilities.firstDetectedDate >= :createdFrom', {
        createdFrom: new Date(createdFrom),
      });
    }
    if (createdTo) {
      // Set time to end of day (23:59:59.999) to include the entire day
      const endDate = new Date(createdTo);
      endDate.setHours(23, 59, 59, 999);
      queryBuilder.andWhere('vulnerabilities.firstDetectedDate <= :createdTo', {
        createdTo: endDate,
      });
    }

    // Filter by tags (using overlap operator with raw SQL)
    if (Array.isArray(tags) && tags.length > 0) {
      const conditions = tags
        .map((_, i) => `:tag${i} = ANY(vulnerabilities.tags)`)
        .join(' OR ');
      const params: Record<string, string> = {};
      tags.forEach((tag, i) => {
        params[`tag${i}`] = tag;
      });
      queryBuilder.andWhere(`(${conditions})`, params);
    }

    const compiled = filter && compileVulnerabilityFilter(filter, 'vf');
    if (compiled) queryBuilder.andWhere(compiled.sql, compiled.params);

    if (projectId) {
      // Findings the project reported, narrowed to a provenance or a run.
      const conditions = ['pv."projectId" = :projectId'];
      if (provenance) conditions.push(`(${PROVENANCE_SQL}) = :provenance`);
      if (jobHistoryId) {
        conditions.push(
          '(pv."firstSeenJobHistoryId" = :jobHistoryId OR pv."lastSeenJobHistoryId" = :jobHistoryId)',
        );
      }
      queryBuilder.andWhere(
        `vulnerabilities.id IN (
          SELECT pv."vulnerabilityId" FROM project_vulnerabilities pv
            JOIN vulnerabilities v ON v.id = pv."vulnerabilityId"
            ${provenance ? REFERENCE_RUN_JOIN : ''}
           WHERE ${conditions.join(' AND ')})`,
        { projectId, provenance, jobHistoryId },
      );
    }

    const [vulnerabilities, total] = await queryBuilder.getManyAndCount();
    const ids = vulnerabilities.map((v) => v.id);
    const [sources, openIssues, sightings] = await Promise.all([
      this.sourceSummaries(ids),
      this.openIssues(ids),
      projectId
        ? this.projectSightings(projectId, ids)
        : Promise.resolve(new Map<string, VulnerabilityProjectSightingDto>()),
    ]);

    const data = vulnerabilities.map(
      (vulnerability): VulnerabilityListItemDto => ({
        ...(vulnerability as Omit<Vulnerability, 'sources'>),
        sources: sources.get(vulnerability.id) ?? [],
        dismissal: toDismissalInfo(vulnerability.vulnerabilityDismissal),
        openIssue: openIssues.get(vulnerability.id) ?? null,
        ...(projectId
          ? { projectSighting: sightings.get(vulnerability.id) ?? null }
          : {}),
      }),
    );

    return getManyResponse({ query, data, total });
  }

  /**
   * One vulnerability of the workspace, AI proposals included (a reviewer
   * opens them here), with every source and its evidence.
   */
  async getVulnerability(
    id: string,
    workspaceId: string,
  ): Promise<VulnerabilityDetailDto> {
    const vulnerability = await this.vulnerabilitiesRepository
      .createQueryBuilder('vulnerabilities')
      .leftJoin('vulnerabilities.asset', 'assets')
      .addSelect(['assets.id', 'assets.value'])
      .leftJoin('assets.target', 'targets')
      .leftJoinAndSelect('vulnerabilities.tool', 'tools')
      .leftJoinAndSelect('vulnerabilities.vulnerabilityDismissal', 'dismissal')
      .leftJoin('dismissal.user', 'user')
      .addSelect(['user.id', 'user.name', 'user.image'])
      .where('targets.workspaceId = :workspaceId', { workspaceId })
      .andWhere('vulnerabilities.id = :id', { id })
      .getOne();

    if (!vulnerability) {
      throw new NotFoundException(
        `Vulnerability with id ${id} not found in workspace`,
      );
    }

    const [sourceRows, openIssues, users] = await Promise.all([
      this.dataSource.query<Array<Record<string, unknown>>>(
        `SELECT s.id, s.kind, s."toolId", t.name AS "toolName", t."logoUrl" AS "toolLogoUrl", s."jobHistoryId",
                s."agentName", s."agentConversationId", s."toolCallIds", s.evidence,
                s."createdAt", u.id AS "userId", u.name AS "userName", u.image AS "userImage"
           FROM "vulnerability_sources" s
           LEFT JOIN "tools" t ON t.id = s."toolId"
           LEFT JOIN "users" u ON u.id = s."createdById"
          WHERE s."vulnerabilityId" = $1
          ORDER BY s."createdAt" ASC`,
        [id],
      ),
      this.openIssues([id]),
      this.userRefs(
        [vulnerability.reviewedById, vulnerability.fixClaimedById].filter(
          (v): v is string => Boolean(v),
        ),
      ),
    ]);

    return {
      ...(vulnerability as Omit<Vulnerability, 'sources'>),
      sources: sourceRows.map((row) => ({
        id: row.id as string,
        kind: row.kind as VulnerabilitySourceKind,
        tool: row.toolId
          ? {
              id: row.toolId as string,
              name: (row.toolName as string) ?? '',
              logoUrl: (row.toolLogoUrl as string | null) ?? null,
            }
          : null,
        jobHistoryId: (row.jobHistoryId as string | null) ?? null,
        agentName: (row.agentName as string | null) ?? null,
        agentConversationId: (row.agentConversationId as string | null) ?? null,
        toolCallIds: (row.toolCallIds as string[] | null) ?? null,
        evidence: (row.evidence as Record<string, unknown> | null) ?? null,
        createdBy: row.userId
          ? {
              id: row.userId as string,
              name: row.userName as string,
              image: (row.userImage as string | null) ?? null,
            }
          : null,
        createdAt: row.createdAt as Date,
      })),
      dismissal: toDismissalInfo(vulnerability.vulnerabilityDismissal),
      openIssue: openIssues.get(id) ?? null,
      reviewedByUser: vulnerability.reviewedById
        ? (users.get(vulnerability.reviewedById) ?? null)
        : null,
      fixClaimedByUser: vulnerability.fixClaimedById
        ? (users.get(vulnerability.fixClaimedById) ?? null)
        : null,
    };
  }

  /** Timeline of a finding, newest first. */
  async getVulnerabilityTimeline(
    id: string,
    workspaceId: string,
  ): Promise<VulnerabilityTimelineResponseDto> {
    await this.assertInWorkspace([id], workspaceId);
    const rows = await this.dataSource.query<Array<Record<string, unknown>>>(
      `SELECT e.id, e.type, e."fromStatus", e."toStatus", e."jobHistoryId", e.data,
              e."occurredAt", u.id AS "actorId", u.name AS "actorName", u.image AS "actorImage"
         FROM "vulnerability_events" e
         LEFT JOIN "users" u ON u.id = e."actorId"
        WHERE e."vulnerabilityId" = $1 AND e."workspaceId" = $2
        ORDER BY e."occurredAt" DESC, e."createdAt" DESC
        LIMIT 500`,
      [id, workspaceId],
    );
    return {
      data: rows.map((row) => ({
        id: row.id as string,
        type: row.type as VulnerabilityEventType,
        fromStatus: (row.fromStatus as string | null) ?? null,
        toStatus: (row.toStatus as string | null) ?? null,
        jobHistoryId: (row.jobHistoryId as string | null) ?? null,
        actor: row.actorId
          ? {
              id: row.actorId as string,
              name: row.actorName as string,
              image: (row.actorImage as string | null) ?? null,
            }
          : null,
        data: (row.data as Record<string, unknown> | null) ?? null,
        occurredAt: row.occurredAt as Date,
      })),
    };
  }

  /**
   * Timeline events of every finding in the workspace, newest first, a page
   * at a time, each with the finding, its asset and who caused it.
   */
  async getActivity(
    query: GetVulnerabilityActivityQueryDto,
    workspaceId: string,
  ): Promise<GetManyBaseResponseDto<VulnerabilityActivityDto>> {
    const params: unknown[] = [workspaceId];
    let typeFilter = '';
    if (query.types?.length) {
      params.push(query.types);
      typeFilter = ` AND e.type = ANY($${params.length}::text[])`;
    }
    // The event's own workspaceId uses its index; the target join is the
    // tenant path every finding query follows.
    const from = `FROM "vulnerability_events" e
         JOIN "vulnerabilities" v ON v.id = e."vulnerabilityId"
         JOIN "assets" a ON a.id = v."assetId"
         JOIN "targets" t ON t.id = a."targetId"`;
    const where = `WHERE e."workspaceId" = $1 AND t."workspaceId" = $1${typeFilter}`;
    const limit = Number(query.limit);
    const offset = (Number(query.page) - 1) * limit;

    const [[{ total }], rows] = await Promise.all([
      this.dataSource.query<Array<{ total: number }>>(
        `SELECT COUNT(*)::int AS total ${from} ${where}`,
        params,
      ),
      this.dataSource.query<Array<Record<string, unknown>>>(
        `SELECT e.id, e.type, e."fromStatus", e."toStatus", e."jobHistoryId", e.data,
                e."occurredAt", v.id AS "vulnerabilityId", v.name AS "vulnerabilityName",
                v.severity, a.value AS "assetValue",
                u.id AS "actorId", u.name AS "actorName", u.image AS "actorImage"
           ${from}
           LEFT JOIN "users" u ON u.id = e."actorId"
          ${where}
          ORDER BY e."occurredAt" DESC, e.id
          LIMIT ${limit} OFFSET ${offset}`,
        params,
      ),
    ]);

    return getManyResponse({
      query,
      total,
      data: rows.map((row) => ({
        id: row.id as string,
        type: row.type as VulnerabilityEventType,
        fromStatus: (row.fromStatus as string | null) ?? null,
        toStatus: (row.toStatus as string | null) ?? null,
        jobHistoryId: (row.jobHistoryId as string | null) ?? null,
        data: (row.data as Record<string, unknown> | null) ?? null,
        occurredAt: row.occurredAt as Date,
        vulnerability: {
          id: row.vulnerabilityId as string,
          name: row.vulnerabilityName as string,
          severity: row.severity as Severity,
        },
        assetValue: row.assetValue as string,
        actor: row.actorId
          ? {
              id: row.actorId as string,
              name: row.actorName as string,
              image: (row.actorImage as string | null) ?? null,
            }
          : null,
      })),
    });
  }

  /**
   * Open findings per severity, plus lifecycle counts: per detection state,
   * new in 7 days, resurfaced and fixed in 30 days, overdue, AI proposals
   * waiting for review, and mean time to remediate per severity over the
   * findings fixed in the last 90 days.
   */
  async getVulnerabilitiesStatistics(
    query: GetVulnerabilitiesStatisticsQueryDto,
    workspaceId: string,
  ): Promise<GetVulnerabilitiesStatisticsResponseDto> {
    const { targetIds, projectId } = query;
    const params: unknown[] = [workspaceId];
    let targetFilter = '';
    if (targetIds?.length) {
      params.push(targetIds);
      targetFilter = ` AND t.id = ANY($${params.length}::uuid[])`;
    }
    if (projectId) {
      params.push(projectId);
      targetFilter += ` AND v.id IN (SELECT "vulnerabilityId" FROM project_vulnerabilities WHERE "projectId" = $${params.length}::uuid)`;
    }
    const from = `FROM "vulnerabilities" v
                  JOIN "assets" a ON a.id = v."assetId"
                  JOIN "targets" t ON t.id = a."targetId"
                 WHERE t."workspaceId" = $1${targetFilter}`;
    const open = openVulnerabilityCondition('v');

    const [severityRows, counts, resurfaced, mttrRows, provenanceRows] = await Promise.all([
      this.dataSource.query<Array<{ severity: Severity; count: string }>>(
        `SELECT v.severity, COUNT(*) AS count ${from} AND ${open} GROUP BY v.severity`,
        params,
      ),
      this.dataSource.query<Array<Record<string, string>>>(
        `SELECT
           COUNT(*) FILTER (WHERE v."reviewStatus" = 'approved' AND v."detectionStatus" = 'new') AS "new",
           COUNT(*) FILTER (WHERE v."reviewStatus" = 'approved' AND v."detectionStatus" = 'active') AS "active",
           COUNT(*) FILTER (WHERE v."reviewStatus" = 'approved' AND v."detectionStatus" = 'resurfaced') AS "resurfaced",
           COUNT(*) FILTER (WHERE v."reviewStatus" = 'approved' AND v."detectionStatus" = 'fixed') AS "fixed",
           COUNT(*) FILTER (WHERE ${open} AND v."firstDetectedDate" >= now() - interval '7 days') AS "newLast7Days",
           COUNT(*) FILTER (WHERE v."reviewStatus" = 'approved' AND v."detectionStatus" = 'fixed'
                              AND v."fixedAt" >= now() - interval '30 days') AS "fixedLast30Days",
           COUNT(*) FILTER (WHERE ${open} AND v."dueAt" < now()) AS "overdue",
           COUNT(*) FILTER (WHERE v."reviewStatus" = 'pending_review') AS "pendingReview"
         ${from}`,
        params,
      ),
      this.dataSource.query<Array<{ count: string }>>(
        `SELECT COUNT(DISTINCT e."vulnerabilityId") AS count
           FROM "vulnerability_events" e
           JOIN "vulnerabilities" v ON v.id = e."vulnerabilityId"
           JOIN "assets" a ON a.id = v."assetId"
           JOIN "targets" t ON t.id = a."targetId"
          WHERE t."workspaceId" = $1${targetFilter}
            AND v."reviewStatus" = 'approved'
            AND e.type = '${VulnerabilityEventType.STATUS_CHANGED}'
            AND e."toStatus" = '${VulnerabilityDetectionStatus.RESURFACED}'
            AND e."occurredAt" >= now() - interval '30 days'`,
        params,
      ),
      this.dataSource.query<
        Array<{ severity: Severity; days: string | null; count: string }>
      >(
        `SELECT v.severity,
                AVG(EXTRACT(EPOCH FROM (v."fixedAt" - COALESCE(v."firstDetectedDate", v."createdAt"))) / 86400) AS days,
                COUNT(*) AS count
         ${from}
           AND v."reviewStatus" = 'approved'
           AND v."detectionStatus" = 'fixed'
           AND v."fixedAt" >= now() - interval '90 days'
         GROUP BY v.severity`,
        params,
      ),
      projectId
        ? this.dataSource.query<Array<{ provenance: VulnerabilityProvenance; count: string }>>(
            `SELECT ${PROVENANCE_SQL} AS provenance, COUNT(*) AS count
               FROM project_vulnerabilities pv
               JOIN vulnerabilities v ON v.id = pv."vulnerabilityId"
               JOIN assets a ON a.id = v."assetId"
               JOIN targets t ON t.id = a."targetId"
               ${REFERENCE_RUN_JOIN}
              WHERE pv."projectId" = $2::uuid AND t."workspaceId" = $1 AND ${open}
              GROUP BY 1`,
            [workspaceId, projectId],
          )
        : Promise.resolve(null),
    ]);

    const toInt = (value: unknown): number =>
      Number.parseInt(typeof value === 'number' || typeof value === 'string' ? String(value) : '0', 10) || 0;
    const severityCounts = new Map(
      severityRows.map((row) => [row.severity, toInt(row.count)]),
    );
    const mttr = new Map(mttrRows.map((row) => [row.severity, row]));
    const c = counts[0] ?? {};

    return {
      data: ALL_SEVERITIES.map((severity) => ({
        severity,
        count: severityCounts.get(severity) ?? 0,
      })),
      byDetectionStatus: {
        new: toInt(c.new),
        active: toInt(c.active),
        resurfaced: toInt(c.resurfaced),
        fixed: toInt(c.fixed),
      },
      newLast7Days: toInt(c.newLast7Days),
      resurfacedLast30Days: toInt(resurfaced[0]?.count),
      fixedLast30Days: toInt(c.fixedLast30Days),
      overdue: toInt(c.overdue),
      pendingReview: toInt(c.pendingReview),
      mttr: ALL_SEVERITIES.map((severity) => {
        const row = mttr.get(severity);
        const days = row?.days === null || row?.days === undefined
          ? null
          : Math.round(Number(row.days) * 10) / 10;
        return { severity, days, count: toInt(row?.count) };
      }),
      ...(provenanceRows
        ? {
            provenanceCounts: {
              new: toInt(provenanceRows.find((r) => r.provenance === VulnerabilityProvenance.NEW)?.count),
              recurring: toInt(
                provenanceRows.find((r) => r.provenance === VulnerabilityProvenance.RECURRING)?.count,
              ),
              notSeen: toInt(
                provenanceRows.find((r) => r.provenance === VulnerabilityProvenance.NOT_SEEN)?.count,
              ),
            },
          }
        : {}),
    };
  }

  /**
   * Builds the SQL CASE expression for severity ordering.
   *
   * @param sortOrder - The sort order ('ASC' or 'DESC').
   * @returns An object containing the select expression and order by field.
   */
  private buildSeverityOrderQuery(sortOrder: SortOrder | undefined): {
    select: string;
    orderBy: string;
  } {
    const severityCase =
      sortOrder === SortOrder.ASC
        ? `CASE vulnerabilities.severity WHEN '${Severity.INFO}' THEN 1 WHEN '${Severity.LOW}' THEN 2 WHEN '${Severity.MEDIUM}' THEN 3 WHEN '${Severity.HIGH}' THEN 4 WHEN '${Severity.CRITICAL}' THEN 5 END`
        : `CASE vulnerabilities.severity WHEN '${Severity.INFO}' THEN 5 WHEN '${Severity.LOW}' THEN 4 WHEN '${Severity.MEDIUM}' THEN 3 WHEN '${Severity.HIGH}' THEN 2 WHEN '${Severity.CRITICAL}' THEN 1 END`;

    return {
      select: severityCase,
      orderBy: 'severity_order',
    };
  }

  /**
   * Dismisses approved findings. `risk_accepted` needs an `expiresAt` within
   * the workspace's `riskAcceptMaxDays`; the other reasons take none. An
   * expired risk acceptance still on record is replaced.
   */
  async bulkDismissVulnerabilities(
    ids: string[],
    workspaceId: string,
    user: User,
    dismiss: {
      reason: VulnerabilityDismissal['reason'];
      comment?: string;
      expiresAt?: string;
    },
  ) {
    const now = new Date();
    let expiresAt: Date | null = null;
    if (dismiss.reason === DismissReason.RISK_ACCEPTED) {
      if (!dismiss.expiresAt) {
        throw new BadRequestException(
          'expiresAt is required when accepting a risk',
        );
      }
      expiresAt = new Date(dismiss.expiresAt);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now) {
        throw new BadRequestException('expiresAt must be in the future');
      }
      const settings = await loadVulnerabilitySettings(
        this.dataSource,
        workspaceId,
      );
      const max = new Date(now.getTime() + settings.riskAcceptMaxDays * DAY_MS);
      if (expiresAt > max) {
        throw new BadRequestException(
          `A risk acceptance may last at most ${settings.riskAcceptMaxDays} days`,
        );
      }
    } else if (dismiss.expiresAt) {
      throw new BadRequestException(
        'expiresAt only applies to the risk_accepted reason',
      );
    }

    const unique = [...new Set(ids)];
    const vulnerabilities = await this.assertInWorkspace(unique, workspaceId);
    const notApproved = vulnerabilities.filter(
      (v) => v.reviewStatus !== VulnerabilityReviewStatus.APPROVED,
    );
    if (notApproved.length > 0) {
      throw new BadRequestException(
        `Only approved findings can be dismissed: ${notApproved.map((v) => v.id).join(', ')}`,
      );
    }

    const existing = await this.dismissRepo.find({
      where: { vulnerabilityId: In(unique) },
    });
    const alreadyDismissed = existing.filter(
      (d) => !d.expiresAt || d.expiresAt > now,
    );
    if (alreadyDismissed.length > 0) {
      throw new BadRequestException(
        `Vulnerabilities already dismissed: ${alreadyDismissed.map((d) => d.vulnerabilityId).join(', ')}`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const expired = existing.map((d) => d.id);
      if (expired.length > 0) {
        await manager.delete(VulnerabilityDismissal, { id: In(expired) });
      }
      const dismissals = unique.map((id) =>
        manager.create(VulnerabilityDismissal, {
          vulnerabilityId: id,
          userId: user.id,
          reason: dismiss.reason,
          comment: dismiss.comment,
          expiresAt,
        }),
      );
      const saved = await manager.save(VulnerabilityDismissal, dismissals);
      await insertInChunks(
        manager,
        VulnerabilityEvent,
        unique.map((id) => ({
          vulnerabilityId: id,
          workspaceId,
          type: VulnerabilityEventType.DISMISSED,
          actorId: user.id,
          data: {
            reason: dismiss.reason,
            comment: dismiss.comment ?? null,
            expiresAt: expiresAt ? expiresAt.toISOString() : null,
          },
          occurredAt: now,
        })),
      );
      return saved;
    });
  }

  /**
   * Removes the dismissal of each finding (ids are VULNERABILITY ids). Every
   * id must be a dismissed finding of the workspace.
   */
  async bulkReopenVulnerabilities(
    ids: string[],
    workspaceId: string,
    user?: User,
  ): Promise<ReopenVulnerabilitiesResponseDto> {
    const unique = [...new Set(ids)];
    const dismissals = await this.dismissRepo.find({
      where: {
        vulnerabilityId: In(unique),
        vulnerability: {
          asset: {
            target: { workspaceId },
          },
        },
      },
    });

    const found = new Set(dismissals.map((d) => d.vulnerabilityId));
    const notFoundIds = unique.filter((id) => !found.has(id));
    if (notFoundIds.length > 0) {
      throw new NotFoundException(
        `Dismissed vulnerabilities not found: ${notFoundIds.join(', ')}`,
      );
    }

    const now = new Date();
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(VulnerabilityDismissal, {
        id: In(dismissals.map((d) => d.id)),
      });
      await insertInChunks(
        manager,
        VulnerabilityEvent,
        dismissals.map((d) => ({
          vulnerabilityId: d.vulnerabilityId,
          workspaceId,
          type: VulnerabilityEventType.REOPENED,
          actorId: user?.id ?? null,
          data: {
            previousReason: d.reason,
            expiresAt: d.expiresAt ? new Date(d.expiresAt).toISOString() : null,
          },
          occurredAt: now,
        })),
      );
    });
    return { reopened: dismissals.length };
  }

  /**
   * Records that a person fixed the findings. Nothing closes yet: the next
   * scan of the same scope that no longer reports a finding closes it as
   * usual, and that close notes the claim was verified. Findings no scanner
   * covers (AI, legacy) cannot be verified that way; the event says so.
   */
  async claimFix(
    vulnerabilityIds: string[],
    workspaceId: string,
    user: User,
    note?: string,
  ): Promise<ClaimFixResponseDto> {
    const unique = [...new Set(vulnerabilityIds)];
    const vulnerabilities = await this.assertInWorkspace(unique, workspaceId);
    const notOpen = vulnerabilities.filter(
      (v) =>
        v.reviewStatus !== VulnerabilityReviewStatus.APPROVED ||
        !OPEN_DETECTION_STATUSES.has(v.detectionStatus),
    );
    if (notOpen.length > 0) {
      throw new BadRequestException(
        `Only open, approved findings can be claimed fixed: ${notOpen.map((v) => v.id).join(', ')}`,
      );
    }

    const now = new Date();
    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        Vulnerability,
        { id: In(unique) },
        { fixClaimedAt: now, fixClaimedById: user.id },
      );
      await insertInChunks(
        manager,
        VulnerabilityEvent,
        vulnerabilities.map((v) => ({
          vulnerabilityId: v.id,
          workspaceId,
          type: VulnerabilityEventType.FIX_CLAIMED,
          actorId: user.id,
          data: {
            note: note ?? null,
            // The next covering scan that misses it closes it as usual.
            verification: v.scanScopeKey
              ? 'next_covering_scan'
              : 'not_verifiable_by_scan',
          },
          occurredAt: now,
        })),
      );
    });
    return { updated: unique.length };
  }

  /**
   * Loads the findings by id, scoped to the workspace; 404 naming the ids
   * that are not there.
   */
  private async assertInWorkspace(
    ids: string[],
    workspaceId: string,
  ): Promise<Vulnerability[]> {
    const vulnerabilities = await this.vulnerabilitiesRepository.find({
      where: {
        id: In(ids),
        asset: {
          target: { workspaceId },
        },
      },
    });
    const found = new Set(vulnerabilities.map((v) => v.id));
    const notFoundIds = ids.filter((id) => !found.has(id));
    if (notFoundIds.length > 0) {
      throw new NotFoundException(
        `Vulnerabilities not found: ${notFoundIds.join(', ')}`,
      );
    }
    return vulnerabilities;
  }

  /** How the project saw each finding: provenance, sightings, first and last run. */
  private async projectSightings(
    projectId: string,
    ids: string[],
  ): Promise<Map<string, VulnerabilityProjectSightingDto>> {
    if (ids.length === 0) return new Map();
    const rows = await this.dataSource.query<Array<Record<string, unknown>>>(
      `SELECT pv."vulnerabilityId" AS id, pv."timesSeen",
              pv."firstSeenJobHistoryId", pv."firstSeenAt",
              pv."lastSeenJobHistoryId", pv."lastSeenAt",
              ${PROVENANCE_SQL} AS provenance
         FROM project_vulnerabilities pv
         JOIN vulnerabilities v ON v.id = pv."vulnerabilityId"
         ${REFERENCE_RUN_JOIN}
        WHERE pv."projectId" = $1 AND pv."vulnerabilityId" = ANY($2::uuid[])`,
      [projectId, ids],
    );
    return new Map(
      rows.map((row) => [
        row.id as string,
        {
          provenance: row.provenance as VulnerabilityProvenance,
          timesSeen: Number(row.timesSeen ?? 1),
          firstSeen: {
            runId: (row.firstSeenJobHistoryId as string | null) ?? null,
            at: row.firstSeenAt as Date,
          },
          lastSeen: {
            runId: (row.lastSeenJobHistoryId as string | null) ?? null,
            at: row.lastSeenAt as Date,
          },
        },
      ]),
    );
  }

  /** Distinct (kind, tool, agent) sources per finding, for list rows. */
  private async sourceSummaries(
    ids: string[],
  ): Promise<Map<string, VulnerabilitySourceSummaryDto[]>> {
    const result = new Map<string, VulnerabilitySourceSummaryDto[]>();
    if (ids.length === 0) return result;
    const rows = await this.dataSource.query<
      Array<{
        vulnerabilityId: string;
        kind: VulnerabilitySourceKind;
        toolName: string | null;
        agentName: string | null;
      }>
    >(
      `SELECT DISTINCT s."vulnerabilityId", s.kind, t.name AS "toolName", s."agentName"
         FROM "vulnerability_sources" s
         LEFT JOIN "tools" t ON t.id = s."toolId"
        WHERE s."vulnerabilityId" = ANY($1::uuid[])`,
      [ids],
    );
    for (const row of rows) {
      const list = result.get(row.vulnerabilityId) ?? [];
      list.push({
        kind: row.kind,
        toolName: row.toolName ?? null,
        agentName: row.agentName ?? null,
      });
      result.set(row.vulnerabilityId, list);
    }
    return result;
  }

  /** The most recent not-closed issue linked to each finding. */
  private async openIssues(
    ids: string[],
  ): Promise<Map<string, VulnerabilityOpenIssueDto>> {
    const result = new Map<string, VulnerabilityOpenIssueDto>();
    if (ids.length === 0) return result;
    const rows = await this.dataSource.query<
      Array<{ resourceId: string; id: string; no: number; status: IssueStatus }>
    >(
      `SELECT DISTINCT ON (l."resourceId") l."resourceId", i.id, i.no, i.status
         FROM "issue_links" l
         JOIN "issues" i ON i.id = l."issueId"
        WHERE l."resourceType" = '${IssueLinkResourceType.VULNERABILITY}'
          AND l."resourceId" = ANY($1::uuid[])
          AND i.status IN ('${IssueStatus.OPEN}', '${IssueStatus.IN_PROGRESS}', '${IssueStatus.RESOLVED}')
        ORDER BY l."resourceId", i."createdAt" DESC`,
      [ids],
    );
    for (const row of rows) {
      result.set(row.resourceId, {
        id: row.id,
        no: Number(row.no),
        status: row.status,
      });
    }
    return result;
  }

  /** `{id, name, image}` of each user id. */
  private async userRefs(
    ids: string[],
  ): Promise<Map<string, VulnerabilityUserRefDto>> {
    const result = new Map<string, VulnerabilityUserRefDto>();
    if (ids.length === 0) return result;
    const rows = await this.dataSource.query<
      Array<{ id: string; name: string; image: string | null }>
    >(`SELECT id, name, image FROM "users" WHERE id = ANY($1::uuid[])`, [ids]);
    for (const row of rows) {
      result.set(row.id, { id: row.id, name: row.name, image: row.image ?? null });
    }
    return result;
  }

  async analyzeVulnerability(
    id: string,
    workspaceId: string,
    userId: string,
    forceRerun: boolean = false,
  ): Promise<DefaultMessageResponseDto> {
    // Lightweight query: only verify workspace, no JOINs to tool/dismissal/user/jobHistory
    const vulnerability = await this.vulnerabilitiesRepository
      .createQueryBuilder('v')
      .leftJoin('v.asset', 'asset')
      .leftJoin('asset.target', 'target')
      .leftJoin('target.workspace', 'workspace')
      .where('v.id = :id', { id })
      .andWhere('workspace.id = :workspaceId', { workspaceId })
      .getOne();

    if (!vulnerability) {
      throw new NotFoundException(`Vulnerability with id ${id} not found`);
    }

    if (!forceRerun) {
      if (vulnerability.analyzeStatus === VulnerabilityAnalyzeStatus.RUNNING) {
        throw new BadRequestException(
          'Analysis is already running for this vulnerability',
        );
      }
      if (
        vulnerability.analyzeStatus === VulnerabilityAnalyzeStatus.DONE &&
        vulnerability.analyzeResult
      ) {
        this.logger.log(
          `Vulnerability ${id} already analyzed, returning cached result`,
        );
        return {
          message: vulnerability.analyzeResult,
        };
      }
    }

    await this.vulnerabilitiesRepository.update(
      { id },
      { analyzeStatus: VulnerabilityAnalyzeStatus.RUNNING },
    );
    this.logger.log(`Starting analysis for vulnerability ${id}`);

    await this.vulnerabilityAnalysisQueue.add(id, {
      ...this.toAnalysisPayload(vulnerability),
      workspaceId,
      userId,
    });

    return {
      message: 'Analysis started',
    };
  }

  async processVulnerabilityAnalysis(
    jobId: string,
    workspaceId: string,
    userId: string,
  ): Promise<Vulnerability | undefined> {
    const vulnerability = await this.vulnerabilitiesRepository.findOne({
      where: { id: jobId },
    });

    if (!vulnerability) {
      this.logger.error(`Vulnerability with id ${jobId} not found`);
      return;
    }

    try {
      const vulnerabilityJson = JSON.stringify(
        this.toAnalysisPayload(vulnerability),
        null,
        2,
      );
      const analyzeResult = await this.agentsCompletionsService.vulAnalyze(
        vulnerabilityJson,
        workspaceId,
        userId,
      );

      const hasMarkdownStructure =
        analyzeResult.includes('###') ||
        analyzeResult.includes('##') ||
        analyzeResult.includes('#');

      if (!hasMarkdownStructure) {
        this.logger.warn(
          `AI returned non-markdown content for vulnerability ${jobId}, wrapping as error`,
        );
        const errorContent = `# Analysis Error\n\nAI returned invalid content:\n\n${analyzeResult}`;
        await this.vulnerabilitiesRepository.update(
          { id: jobId },
          {
            analyzeStatus: VulnerabilityAnalyzeStatus.FAILED,
            analyzeResult: errorContent,
          },
        );
        return;
      }

      await this.vulnerabilitiesRepository.update(
        { id: jobId },
        {
          analyzeStatus: VulnerabilityAnalyzeStatus.DONE,
          analyzeResult,
        },
      );

      this.logger.log(`Analysis completed for vulnerability ${jobId}`);

      return vulnerability;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error(
        `Analysis failed for vulnerability ${jobId}: ${errorMessage}`,
      );

      await this.vulnerabilitiesRepository.update(
        { id: jobId },
        {
          analyzeStatus: VulnerabilityAnalyzeStatus.FAILED,
          analyzeResult: `# Analysis Error\n\n**Error details:** ${errorMessage}`,
        },
      );
    }
  }

  private toAnalysisPayload(
    vulnerability: Vulnerability,
  ): Record<string, unknown> {
    return {
      id: vulnerability.id,
      name: vulnerability.name,
      description: vulnerability.description,
      synopsis: vulnerability.synopsis,
      severity: vulnerability.severity,
      tags: vulnerability.tags,
      references: vulnerability.references,
      authors: vulnerability.authors,
      affectedUrl: vulnerability.affectedUrl,
      ipAddress: vulnerability.ipAddress,
      host: vulnerability.host,
      ports: vulnerability.ports,
      cvssMetric: vulnerability.cvssMetric,
      cvssScore: vulnerability.cvssScore,
      epssScore: vulnerability.epssScore,
      vprScore: vulnerability.vprScore,
      cveId: vulnerability.cveId,
      bidId: vulnerability.bidId,
      cweId: vulnerability.cweId,
      ceaId: vulnerability.ceaId,
      iava: vulnerability.iava,
      cveUrl: vulnerability.cveUrl,
      cweUrl: vulnerability.cweUrl,
      solution: vulnerability.solution,
      extractorName: vulnerability.extractorName,
      extractedResults: vulnerability.extractedResults,
      publicationDate: vulnerability.publicationDate,
      modificationDate: vulnerability.modificationDate,
      filePath: vulnerability.filePath,
      detectionStatus: vulnerability.detectionStatus,
      fingerprint: vulnerability.fingerprint,
    };
  }

  async deleteVulnerabilityAnalysis(
    id: string,
    workspaceId: string,
  ): Promise<DefaultMessageResponseDto> {
    const vulnerability = await this.vulnerabilitiesRepository.findOne({
      where: { id },
      relations: ['asset', 'asset.target'],
    });

    if (!vulnerability) {
      throw new NotFoundException(`Vulnerability with id ${id} not found`);
    }

    // Only asset.target is loaded: compare its workspaceId column (reading
    // target.workspace, a relation never loaded here, made every call 404).
    if (vulnerability.asset?.target?.workspaceId !== workspaceId) {
      throw new NotFoundException(
        `Vulnerability with id ${id} not found in workspace`,
      );
    }

    await this.vulnerabilitiesRepository.update(
      { id },
      {
        analyzeStatus: VulnerabilityAnalyzeStatus.NOT_ANALYZED,
        analyzeResult: '',
      },
    );

    return { message: 'Analysis result deleted successfully' };
  }
}
