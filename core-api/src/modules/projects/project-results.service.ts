import {
  DismissReason,
  JobRunType,
  JobStatus,
  ProjectChange,
  Severity,
} from '@/common/enums/enum';
import { VulnerabilityStatus } from '@/modules/vulnerabilities/dto/get-vulnerability.dto';
import { openVulnerabilityCondition } from '@/modules/vulnerabilities/open-vulnerability';
import { getManyResponse } from '@/utils/getManyResponse';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  jobEntries,
  type WorkflowRunScope,
  type WorkflowRunStepStates,
} from '../workflows/workflow-graph';
import type { SeverityCountsDto } from './dto/project-assets.dto';
import {
  type GetProjectRunsQueryDto,
  type GetProjectVulnerabilitiesQueryDto,
  type ProjectActivityDto,
  type ProjectOverviewDto,
  type ProjectRunDto,
  type ProjectRunRefDto,
  type ProjectVulnerabilitiesResponseDto,
  type ProjectVulnerabilityDto,
  TimelineSighting,
  type VulnerabilityTimelineDto,
  type WeeklyNewVulnerabilitiesDto,
} from './dto/project-results.dto';
import { Project } from './entities/project.entity';
import { findProjectOrFail } from './project-access';
import {
  PROVENANCE_SQL,
  REFERENCE_RUN_JOIN,
  RUN_STATUS_SQL,
  SEVERITY_RANK_SQL,
  VulnerabilityProvenance,
} from './provenance';

const SEVERITIES = Object.values(Severity);

/** Entries of a project's recent activity. */
const ACTIVITY_LIMIT = 15;

/** Project audit actions the activity shows as they are. */
const LIFECYCLE_ACTIONS = ['project.created', 'project.archived', 'project.unarchived'];

/** `count` rows of (severity, count) → a full severity record. */
function severityCounts(
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

/** A step that is finished as far as the run cares (done, nothing to scan). */
function isStepFinished(state: { status?: string; reason?: string }): boolean {
  return (
    state.status === 'done' ||
    (state.status === 'skipped' &&
      (state.reason === 'no-inputs' || state.reason === 'assets-discovery-off'))
  );
}

function scopeSize(scope: WorkflowRunScope | null | undefined): number {
  return scope?.assetIds?.length ?? scope?.targetIds?.length ?? 0;
}

/** What the project found: overview, runs and vulnerabilities with provenance. */
@Injectable()
export class ProjectResultsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    private readonly dataSource: DataSource,
  ) {}

  async overview(
    projectId: string,
    workspaceId: string,
  ): Promise<ProjectOverviewDto> {
    await findProjectOrFail(this.projectRepo, projectId, workspaceId);
    const q = <T>(sql: string, params: unknown[] = [projectId]) =>
      this.dataSource.query<T>(sql, params);

    const [assets, workflows, open, fresh, freshRuns, lastRun, weekly, activity] =
      await Promise.all([
        q<Array<{ total: number; recent: number }>>(
          `SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE "createdAt" > LOCALTIMESTAMP - interval '7 days')::int AS recent
             FROM project_assets WHERE "projectId" = $1`,
        ),
        q<Array<{ count: number }>>(
          `SELECT COUNT(*)::int AS count FROM project_workflows WHERE "projectId" = $1`,
        ),
        q<Array<{ severity: string; count: number }>>(
          `SELECT v.severity, COUNT(*)::int AS count
             FROM project_vulnerabilities pv JOIN vulnerabilities v ON v.id = pv."vulnerabilityId"
            WHERE pv."projectId" = $1 AND ${openVulnerabilityCondition('v')}
            GROUP BY v.severity`,
        ),
        q<Array<{ count: number }>>(
          `SELECT COUNT(*)::int AS count
             FROM project_vulnerabilities pv JOIN vulnerabilities v ON v.id = pv."vulnerabilityId"
            WHERE pv."projectId" = $1 AND pv."firstSeenAt" > now() - interval '7 days'
              AND ${openVulnerabilityCondition('v')}`,
        ),
        q<ProjectRunRefDto[]>(
          `${this.runRefSelect()}
            WHERE jh.id IN (
              SELECT DISTINCT pv."firstSeenJobHistoryId" FROM project_vulnerabilities pv
               WHERE pv."projectId" = $1 AND pv."firstSeenAt" > now() - interval '7 days'
            )
            ORDER BY jh."createdAt" DESC LIMIT 5`,
        ),
        q<ProjectRunRefDto[]>(
          `${this.runRefSelect()} WHERE jh."projectId" = $1 ORDER BY jh."createdAt" DESC LIMIT 1`,
        ),
        q<Array<WeeklyNewVulnerabilitiesDto>>(
          `SELECT to_char(w.week, 'YYYY-MM-DD') AS week,
                  ${SEVERITIES.map(
                    (s) => `COUNT(v.id) FILTER (WHERE v.severity = '${s}')::int AS ${s}`,
                  ).join(', ')}
             FROM generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') AS w(week)
             LEFT JOIN project_vulnerabilities pv
               ON pv."projectId" = $1 AND date_trunc('week', pv."firstSeenAt") = w.week
             LEFT JOIN vulnerabilities v ON v.id = pv."vulnerabilityId"
            GROUP BY w.week ORDER BY w.week`,
        ),
        this.activity(projectId, workspaceId),
      ]);

    return {
      totalAssets: assets[0]?.total ?? 0,
      newAssets: assets[0]?.recent ?? 0,
      workflows: workflows[0]?.count ?? 0,
      openVulnerabilities: severityCounts(open),
      newVulnerabilities: fresh[0]?.count ?? 0,
      newVulnerabilityRuns: freshRuns,
      lastRun: lastRun[0] ?? null,
      weekly,
      activity,
    };
  }

  /** Runs of the project, newest first, with what each found. */
  async runs(
    projectId: string,
    workspaceId: string,
    query: GetProjectRunsQueryDto,
  ) {
    await findProjectOrFail(this.projectRepo, projectId, workspaceId);
    const params: unknown[] = [projectId];
    const where = ['jh."projectId" = $1'];
    if (query.projectWorkflowId) {
      params.push(query.projectWorkflowId);
      where.push(`jh."projectWorkflowId" = $${params.length}`);
    }
    if (query.jobRunType) {
      params.push(query.jobRunType);
      where.push(`jh."jobRunType" = $${params.length}`);
    }
    const whereSql = where.join(' AND ');
    const limit = Number(query.limit);
    const offset = (Number(query.page) - 1) * limit;

    const [[{ total }], rows] = await Promise.all([
      this.dataSource.query<Array<{ total: number }>>(
        `SELECT COUNT(*)::int AS total FROM job_histories jh WHERE ${whereSql}`,
        params,
      ),
      this.dataSource.query<Array<Record<string, unknown>>>(
        `SELECT jh.id, jh."createdAt", jh."updatedAt", jh."isCompleted", jh."jobRunType",
                jh."projectWorkflowId", jh.steps, jh.scope,
                w.name AS "workflowName", w.content AS "workflowContent", tr.type AS "triggerType",
                tr.event AS "triggerEvent", jh."causedByRunId", cw.name AS "causedByWorkflowName",
                ${RUN_STATUS_SQL} AS status,
                (SELECT COUNT(*)::int FROM project_vulnerabilities pv
                  WHERE pv."projectId" = jh."projectId" AND pv."firstSeenJobHistoryId" = jh.id) AS "newVulnerabilities",
                (SELECT COUNT(*)::int FROM project_vulnerabilities pv
                  WHERE pv."projectId" = jh."projectId" AND pv."lastSeenJobHistoryId" = jh.id
                    AND pv."firstSeenJobHistoryId" IS DISTINCT FROM jh.id) AS "recurringVulnerabilities"
           FROM job_histories jh
           LEFT JOIN workflows w ON w.id = jh."workflowId"
           LEFT JOIN project_workflow_triggers tr ON tr.id = jh."triggerId"
           LEFT JOIN job_histories cause ON cause.id = jh."causedByRunId"
           LEFT JOIN workflows cw ON cw.id = cause."workflowId"
          WHERE ${whereSql}
          ORDER BY jh."createdAt" DESC
          LIMIT ${limit} OFFSET ${offset}`,
        params,
      ),
    ]);

    const data: ProjectRunDto[] = rows.map((row) => {
      const steps = Object.values(
        (row.steps as WorkflowRunStepStates | null) ?? {},
      ) as Array<{ status?: string; reason?: string }>;
      const content = row.workflowContent as { jobs?: unknown } | null;
      return {
        id: row.id as string,
        createdAt: row.createdAt as Date,
        updatedAt: row.updatedAt as Date,
        isCompleted: Boolean(row.isCompleted),
        status: row.status as JobStatus,
        jobRunType: row.jobRunType as JobRunType,
        projectWorkflowId: (row.projectWorkflowId as string | null) ?? null,
        workflowName: (row.workflowName as string | null) ?? '',
        triggerType: (row.triggerType as ProjectRunDto['triggerType']) ?? null,
        triggerEvent: (row.triggerEvent as ProjectRunDto['triggerEvent']) ?? null,
        causedByRunId: (row.causedByRunId as string | null) ?? null,
        causedByWorkflowName: (row.causedByWorkflowName as string | null) ?? null,
        scopeSize: scopeSize(row.scope as WorkflowRunScope | null),
        stepsTotal: Math.max(
          jobEntries(content?.jobs as never).length,
          steps.length,
        ),
        stepsDone: steps.filter(isStepFinished).length,
        stepsFailed: steps.filter((state) => state.status === 'failed').length,
        newVulnerabilities: Number(row.newVulnerabilities ?? 0),
        recurringVulnerabilities: Number(row.recurringVulnerabilities ?? 0),
      };
    });
    return getManyResponse({ query, data, total });
  }

  /**
   * The project's vulnerabilities with provenance computed at read time
   * against each one's reference run. Counts per provenance and severity come
   * with the page so the filter chips stay accurate.
   */
  async vulnerabilities(
    projectId: string,
    workspaceId: string,
    query: GetProjectVulnerabilitiesQueryDto,
  ): Promise<ProjectVulnerabilitiesResponseDto> {
    await findProjectOrFail(this.projectRepo, projectId, workspaceId);
    const params: unknown[] = [projectId];
    const where: string[] = [];
    const add = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    if (query.status === VulnerabilityStatus.OPEN || !query.status) {
      where.push(openVulnerabilityCondition('v'));
    } else if (query.status === VulnerabilityStatus.DISMISSED) {
      where.push(
        `EXISTS (SELECT 1 FROM vulnerability_dismissals vd WHERE vd."vulnerabilityId" = v.id)`,
      );
    }
    if (query.search) {
      const term = add(`%${query.search}%`);
      where.push(
        `(v.name ILIKE ${term} OR a.value ILIKE ${term} OR array_to_string(v."cveId", ' ') ILIKE ${term})`,
      );
    }
    if (query.assetId) where.push(`v."assetId" = ${add(query.assetId)}`);
    if (query.jobHistoryId) {
      const run = add(query.jobHistoryId);
      where.push(
        `(pv."firstSeenJobHistoryId" = ${run} OR pv."lastSeenJobHistoryId" = ${run})`,
      );
    }
    if (query.projectWorkflowId) {
      const binding = add(query.projectWorkflowId);
      where.push(
        `(ls."projectWorkflowId" = ${binding} OR EXISTS (SELECT 1 FROM job_histories fs WHERE fs.id = pv."firstSeenJobHistoryId" AND fs."projectWorkflowId" = ${binding}))`,
      );
    }
    const rows = this.vulnerabilityRowsSql(where);

    // Each query binds only the filters it applies: the counts leave out
    // their own dimension, and Postgres refuses a parameter left unused.
    const filtered = (severity: boolean, provenance: boolean) => {
      const bound = [...params];
      const conditions = ['true'];
      if (severity && query.severity?.length) {
        bound.push(query.severity);
        conditions.push(`severity = ANY($${bound.length}::text[])`);
      }
      if (provenance && query.provenance) {
        bound.push(query.provenance);
        conditions.push(`provenance = $${bound.length}`);
      }
      return { where: conditions.join(' AND '), params: bound };
    };
    const listed = filtered(true, true);
    const forProvenance = filtered(true, false);
    const forSeverity = filtered(false, true);
    const limit = Number(query.limit);
    const offset = (Number(query.page) - 1) * limit;

    const [items, byProvenance, bySeverity] = await Promise.all([
      this.dataSource.query<Array<Record<string, unknown>>>(
        `WITH r AS (${rows})
         SELECT * FROM r
          WHERE ${listed.where}
          ORDER BY rank DESC, "lastSeenAt" DESC, id
          LIMIT ${limit} OFFSET ${offset}`,
        listed.params,
      ),
      this.dataSource.query<Array<{ provenance: VulnerabilityProvenance; count: number }>>(
        `WITH r AS (${rows})
         SELECT provenance, COUNT(*)::int AS count FROM r WHERE ${forProvenance.where}
          GROUP BY provenance`,
        forProvenance.params,
      ),
      this.dataSource.query<Array<{ severity: string; count: number }>>(
        `WITH r AS (${rows})
         SELECT severity, COUNT(*)::int AS count FROM r WHERE ${forSeverity.where}
          GROUP BY severity`,
        forSeverity.params,
      ),
    ]);

    const countOf = (p: VulnerabilityProvenance) =>
      byProvenance.find((row) => row.provenance === p)?.count ?? 0;
    const countAll = byProvenance.reduce((sum, row) => sum + row.count, 0);
    const total = query.provenance
      ? countOf(query.provenance)
      : countAll;
    const page = getManyResponse({
      query,
      data: items.map((row) => this.toVulnerabilityDto(row)),
      total,
    });
    return {
      ...page,
      hasNextPage: page.hasNextPage ?? false,
      provenanceCounts: {
        all: countAll,
        new: countOf(VulnerabilityProvenance.NEW),
        recurring: countOf(VulnerabilityProvenance.RECURRING),
        notSeen: countOf(VulnerabilityProvenance.NOT_SEEN),
      },
      severityCounts: severityCounts(bySeverity),
    };
  }

  /**
   * The project runs since a vulnerability was first seen that scanned its
   * asset with the reporting tool, each marked seen or missed. Only the first
   * and last sightings are stored, so a run between them is `seen` when the
   * sighting count says every such run reported it, `unknown` otherwise.
   */
  async timeline(
    projectId: string,
    workspaceId: string,
    vulnerabilityId: string,
  ): Promise<VulnerabilityTimelineDto> {
    await findProjectOrFail(this.projectRepo, projectId, workspaceId);
    const [row] = await this.dataSource.query<Array<Record<string, unknown>>>(
      this.vulnerabilityRowsSql(['v.id = $2']),
      [projectId, vulnerabilityId],
    );
    if (!row) {
      throw new NotFoundException(
        `Vulnerability "${vulnerabilityId}" not found in this project`,
      );
    }
    const vulnerability = this.toVulnerabilityDto(row);

    const runs: Array<{ id: string; createdAt: Date; workflowName: string | null }> =
      await this.dataSource.query(
        `SELECT jh.id, jh."createdAt", w.name AS "workflowName"
           FROM job_histories jh
           LEFT JOIN workflows w ON w.id = jh."workflowId"
          WHERE jh."projectId" = $1
            AND (jh.id = ANY($4::uuid[]) OR EXISTS (
                  SELECT 1 FROM jobs j
                   WHERE j."jobHistoryId" = jh.id AND j."assetId" = $2
                     AND j."toolId" = $3 AND j.status = 'completed'))
          ORDER BY jh."createdAt" ASC`,
        [
          projectId,
          row.assetId,
          row.toolId,
          [vulnerability.firstSeen.runId, vulnerability.lastSeen.runId].filter(
            Boolean,
          ),
        ],
      );

    const first = runs.findIndex((run) => run.id === vulnerability.firstSeen.runId);
    const last = runs.findIndex((run) => run.id === vulnerability.lastSeen.runId);
    const from = first >= 0 ? first : 0;
    const between = last >= from ? last - from + 1 : 0;
    const allSeen = between > 0 && vulnerability.timesSeen >= between;

    return {
      vulnerability,
      runs: runs.slice(from).map((run, offset) => {
        const index = from + offset;
        const sighting =
          index === first || index === last
            ? TimelineSighting.SEEN
            : last >= 0 && index > last
              ? TimelineSighting.MISSED
              : allSeen
                ? TimelineSighting.SEEN
                : TimelineSighting.UNKNOWN;
        return {
          id: run.id,
          createdAt: run.createdAt,
          workflowName: run.workflowName ?? '',
          sighting,
        };
      }),
    };
  }

  /** One row per project vulnerability, with provenance and sort rank. */
  private vulnerabilityRowsSql(where: string[]): string {
    return `SELECT v.id, v.name, v.severity, v."cveId", v."affectedUrl", v."assetId", v."toolId",
                   a.value AS "assetValue", tool.name AS "toolName",
                   CASE WHEN EXISTS (SELECT 1 FROM vulnerability_dismissals vd WHERE vd."vulnerabilityId" = v.id)
                        THEN 'dismissed' ELSE 'open' END AS status,
                   pv."timesSeen", pv."firstSeenJobHistoryId", pv."firstSeenAt",
                   pv."lastSeenJobHistoryId", pv."lastSeenAt",
                   ${PROVENANCE_SQL} AS provenance,
                   ${SEVERITY_RANK_SQL} AS rank
              FROM project_vulnerabilities pv
              JOIN vulnerabilities v ON v.id = pv."vulnerabilityId"
              JOIN assets a ON a.id = v."assetId"
              LEFT JOIN tools tool ON tool.id = v."toolId"
              ${REFERENCE_RUN_JOIN}
             WHERE pv."projectId" = $1${where.map((w) => ` AND ${w}`).join('')}`;
  }

  private toVulnerabilityDto(row: Record<string, unknown>): ProjectVulnerabilityDto {
    return {
      id: row.id as string,
      name: row.name as string,
      severity: row.severity as Severity,
      cveId: (row.cveId as string[] | null) ?? null,
      affectedUrl: (row.affectedUrl as string | null) ?? null,
      assetId: row.assetId as string,
      assetValue: row.assetValue as string,
      toolName: (row.toolName as string | null) ?? null,
      status: row.status as VulnerabilityStatus,
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
    };
  }

  private runRefSelect(): string {
    return `SELECT jh.id, jh."createdAt", COALESCE(w.name, '') AS "workflowName",
                   jh."jobRunType", ${RUN_STATUS_SQL} AS status
              FROM job_histories jh LEFT JOIN workflows w ON w.id = jh."workflowId"`;
  }

  /**
   * What happened to the project's assets, vulnerabilities and workflows,
   * newest first: runs (with what they found); the project's creation,
   * archiving, and the `project.updated` events that moved assets in or out
   * or changed a workflow; and vulnerabilities people dismissed.
   * Configuration (settings, triggers, a rule edit that moved no asset) stays
   * in the audit log.
   */
  private async activity(
    projectId: string,
    workspaceId: string,
  ): Promise<ProjectActivityDto[]> {
    const [runs, audits, dismissed] = await Promise.all([
      this.dataSource.query<Array<Record<string, unknown>>>(
        `SELECT jh.id, jh."createdAt", jh."jobRunType", jh.scope, w.name AS "workflowName",
                tr.event AS "triggerEvent", ${RUN_STATUS_SQL} AS status,
                (SELECT COUNT(*)::int FROM project_vulnerabilities pv
                  WHERE pv."projectId" = jh."projectId" AND pv."firstSeenJobHistoryId" = jh.id) AS "newVulnerabilities",
                (SELECT COUNT(*)::int FROM project_vulnerabilities pv
                  WHERE pv."projectId" = jh."projectId" AND pv."lastSeenJobHistoryId" = jh.id
                    AND pv."firstSeenJobHistoryId" IS DISTINCT FROM jh.id) AS "recurringVulnerabilities"
           FROM job_histories jh LEFT JOIN workflows w ON w.id = jh."workflowId"
           LEFT JOIN project_workflow_triggers tr ON tr.id = jh."triggerId"
          WHERE jh."projectId" = $1
          ORDER BY jh."createdAt" DESC LIMIT ${ACTIVITY_LIMIT}`,
        [projectId],
      ),
      this.dataSource.query<Array<Record<string, unknown>>>(
        `SELECT action, "occurredAt", "actorName", metadata
           FROM audit_events
          WHERE "workspaceId" = $1 AND "resourceType" = 'project' AND "resourceId" = $2
            AND outcome = 'success'
            AND (action = ANY($3::text[])
                 OR (action = 'project.updated' AND (
                       metadata->>'change' = ANY($4::text[])
                    OR (metadata->>'change' = ANY($5::text[])
                        AND (COALESCE((metadata->>'added')::int, 0) > 0
                             OR COALESCE((metadata->>'removed')::int, 0) > 0)))))
          ORDER BY "occurredAt" DESC LIMIT ${ACTIVITY_LIMIT}`,
        [
          workspaceId,
          projectId,
          LIFECYCLE_ACTIONS,
          [
            ProjectChange.WORKFLOW_ADDED,
            ProjectChange.WORKFLOW_UPDATED,
            ProjectChange.WORKFLOW_REMOVED,
          ],
          [
            ProjectChange.ASSETS_ADDED,
            ProjectChange.ASSETS_DISCOVERED,
            ProjectChange.ASSETS_REMOVED,
            ProjectChange.SCOPE,
          ],
        ],
      ),
      this.dataSource.query<Array<Record<string, unknown>>>(
        `SELECT MAX(d."createdAt") AS at, d.reason, u.name AS "actorName", COUNT(*)::int AS count
           FROM vulnerability_dismissals d
           JOIN project_vulnerabilities pv
             ON pv."vulnerabilityId" = d."vulnerabilityId" AND pv."projectId" = $1
           LEFT JOIN users u ON u.id = d."userId"
          GROUP BY date_trunc('minute', d."createdAt"), d.reason, d."userId", u.name
          ORDER BY at DESC LIMIT ${ACTIVITY_LIMIT}`,
        [projectId],
      ),
    ]);

    const items: ProjectActivityDto[] = [
      ...runs.map(
        (run): ProjectActivityDto => ({
          kind: 'run',
          at: run.createdAt as Date,
          ref: run.id as string,
          runStatus: run.status as string,
          workflowName: (run.workflowName as string | null) ?? '',
          jobRunType: run.jobRunType as string,
          ...(run.triggerEvent ? { triggerEvent: run.triggerEvent as string } : {}),
          newVulnerabilities: Number(run.newVulnerabilities ?? 0),
          recurringVulnerabilities: Number(run.recurringVulnerabilities ?? 0),
          scopeSize: scopeSize(run.scope as WorkflowRunScope | null),
        }),
      ),
      ...audits.map((audit): ProjectActivityDto => {
        // As the projects controller and service write it.
        const metadata = (audit.metadata ?? {}) as {
          change?: ProjectChange;
          added?: number;
          removed?: number;
          workflow?: string;
        };
        return {
          kind: 'audit',
          at: audit.occurredAt as Date,
          ref: audit.action as string,
          actorName: (audit.actorName as string | null) ?? undefined,
          ...(metadata.change ? { change: metadata.change } : {}),
          ...(metadata.added !== undefined ? { added: Number(metadata.added) } : {}),
          ...(metadata.removed !== undefined ? { removed: Number(metadata.removed) } : {}),
          ...(metadata.workflow ? { workflowName: metadata.workflow } : {}),
        };
      }),
      ...dismissed.map(
        (row): ProjectActivityDto => ({
          kind: 'dismissed',
          at: row.at as Date,
          ref: 'dismissed',
          count: Number(row.count),
          reason: row.reason as DismissReason,
          actorName: (row.actorName as string | null) ?? undefined,
        }),
      ),
    ];
    return items
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, ACTIVITY_LIMIT);
  }
}
