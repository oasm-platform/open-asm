import { TIMELINE_LOOKBACK_DAYS } from '@/common/constants/app.constants';
import { GetManyBaseResponseDto } from '@/common/dtos/get-many-base.dto';
import { JobRunType, JobStatus, ToolCategory } from '@/common/enums/enum';
import { NotFoundError } from '@/common/errors/domain.errors';
import { getManyResponse } from '@/common/utils/get-many-response.util';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository, SelectQueryBuilder } from 'typeorm';
import { resolveToolCategory } from '../tools/tool-categories';
import { ToolsService } from '../tools/tools.service';
import {
  WorkflowContent,
  WorkflowJob,
} from '../workflows/entities/workflow.entity';
import {
  normalizeNeeds,
  orderedJobEntries,
  RunStepStatus,
  type WorkflowStepDefinition,
} from '../workflows/workflow-graph';
import { GetManyJobHistoriesRequestDto } from './dto/get-many-job-histories.dto';
import {
  JobHistoryDetailResponseDto,
  ToolWithStatusDto,
  WorkflowStepStatusDto,
} from './dto/job-history-detail.dto';
import { JobHistoryWorkflowResponseDto } from './dto/job-history-workflow.dto';
import { JobHistoryResponseDto } from './dto/job-history.dto';
import {
  JobTimelineItem,
  JobTimelineQueryResult,
  JobTimelineResponseDto,
} from './dto/jobs-registry.dto';
import { JobErrorLog } from './entities/job-error-log.entity';
import { JobHistory } from './entities/job-history.entity';
import { Job } from './entities/job.entity';

/**
 * Key order of one job, matching the workflow templates. See
 * `orderWorkflowContent`.
 */
const orderJob = (job: WorkflowStepDefinition): WorkflowJob => ({
  ...(job.name ? { name: job.name } : {}),
  run: job.run,
  ...(job.category ? { category: job.category as ToolCategory } : {}),
  // Authored `needs` may be a single string (legacy array form); the
  // definition is always stored canonical.
  ...(normalizeNeeds(job.needs).length ? { needs: normalizeNeeds(job.needs) } : {}),
  ...(job.allowFailure !== undefined
    ? { allowFailure: job.allowFailure }
    : {}),
  ...(job.config ? { config: job.config } : {}),
  ...(job.configProfileId ? { configProfileId: job.configProfileId } : {}),
});

/**
 * Sortable columns for JobHistory, whitelisted to prevent SQL injection via
 * ORDER BY interpolation.
 */
const JOB_HISTORY_SORTABLE_COLUMNS: string[] = [
  'id',
  'createdAt',
  'updatedAt',
  'jobHistoryName',
  'jobRunType',
];

/**
 * A run's status rolled up from its jobs. Kept as one string because the same
 * expression backs both the SELECT and the status filter (HAVING).
 */
const JOB_HISTORY_STATUS_SQL = `CASE
          WHEN COUNT(*) FILTER (WHERE job.status = '${JobStatus.CANCELLED}') > 0
               AND COUNT(*) FILTER (WHERE job.status IN ('${JobStatus.PENDING}', '${JobStatus.IN_PROGRESS}')) = 0
            THEN '${JobStatus.CANCELLED}'
          WHEN COUNT(*) FILTER (WHERE job.status = '${JobStatus.FAILED}') > 0 THEN '${JobStatus.FAILED}'
          WHEN COUNT(*) FILTER (WHERE job.status = '${JobStatus.IN_PROGRESS}') > 0 THEN '${JobStatus.IN_PROGRESS}'
          WHEN COUNT(*) FILTER (WHERE job.status = '${JobStatus.COMPLETED}') = COUNT(*) AND COUNT(*) > 0 THEN '${JobStatus.COMPLETED}'
          WHEN COUNT(*) FILTER (WHERE job.status = '${JobStatus.SKIPPED}') = COUNT(*) AND COUNT(*) > 0 THEN '${JobStatus.SKIPPED}'
          ELSE '${JobStatus.PENDING}'
        END`;

/**
 * Read side of jobs and runs: the jobs timeline, the run list with its
 * rolled-up status, a run's detail (steps, tools, ETA, failure reason) and
 * its workflow definition. Writes nothing.
 */
@Injectable()
export class JobHistoryQueryService {
  constructor(
    @InjectRepository(Job) private readonly repo: Repository<Job>,
    @InjectRepository(JobHistory)
    private readonly jobHistoryRepo: Repository<JobHistory>,
    @InjectRepository(JobErrorLog)
    private readonly jobErrorLogRepo: Repository<JobErrorLog>,
    private readonly dataSource: DataSource,
    private readonly toolsService: ToolsService,
  ) {}

  /**
   * Retrieves a timeline of jobs grouped by tool name and target
   *
   * Scoped to the last {@link TIMELINE_LOOKBACK_DAYS} days because the window
   * passes below process every row they are handed while the result is capped
   * at 15 groups.
   *
   * @returns A promise that resolves to a JobTimelineResponseDto containing the timeline data
   */
  public async getJobsTimeline(
    workspaceId: string,
  ): Promise<JobTimelineResponseDto> {
    // Execute the raw SQL query based on the provided example
    const result: JobTimelineQueryResult[] = await this.dataSource.query(
      `
      with grouped as (
        select
          tools.name,
          tools.description as tool_description,
          jobs.category as tool_category,
          assets.value as asset_value,
          targets.value as target,
          targets.id as target_id,
          jobs.status,
          jobs."createdAt",
          jobs."updatedAt",
          jobs."completedAt",
          jobs."jobHistoryId",
          -- check if a new group should start
          case
            when lag(tools.name) over (partition by jobs."jobHistoryId" order by jobs."createdAt" desc) = tools.name
             and lag(jobs.category) over (partition by jobs."jobHistoryId" order by jobs."createdAt" desc) = jobs.category
             and lag(targets.value) over (partition by jobs."jobHistoryId" order by jobs."createdAt" desc) = targets.value
            then 0 else 1
          end as is_new_group
        from jobs
        join assets on jobs."assetId" = assets.id
        join tools on jobs."toolId" = tools.id
        join targets on assets."targetId" = targets.id
        where targets."workspaceId" = $1
          -- Bound the window-function inputs to recent history: the two
          -- window passes below process every row they are given, and only the
          -- newest 15 groups are ever returned.
          and jobs."createdAt" > now() - make_interval(days => $2)
        order by jobs."createdAt" desc
      ),
      grouped_with_id as (
        select *,
               sum(is_new_group) over (partition by "jobHistoryId" order by "createdAt" desc) as grp_id
        from grouped
      )
      select
        name,
        target,
        target_id,
        "jobHistoryId",
        min("createdAt") as start_time,
        max(COALESCE("completedAt", "updatedAt")) as end_time,
        string_agg(status::text, ', ') as statuses,
        max(tool_description) as description,
        tool_category,
        EXTRACT(EPOCH FROM (max(COALESCE("completedAt", "updatedAt")) - min("createdAt"))) as duration_seconds
      from grouped_with_id
      group by grp_id, name, tool_category, target, target_id, "jobHistoryId"
      order by "jobHistoryId", min("createdAt") desc
      limit 15;
    `,
      [workspaceId, TIMELINE_LOOKBACK_DAYS],
    );

    // Map the raw SQL results to our DTO format
    const timelineItems: JobTimelineItem[] = result.map(
      (item: JobTimelineQueryResult) => {
        // Determine the overall status based on the statuses string
        let status = JobStatus.PENDING;
        if (item.statuses.includes(JobStatus.IN_PROGRESS)) {
          status = JobStatus.IN_PROGRESS;
        } else if (item.statuses.includes(JobStatus.FAILED)) {
          status = JobStatus.FAILED;
        } else if (item.statuses.includes(JobStatus.COMPLETED)) {
          status = JobStatus.COMPLETED;
        }

        return {
          name: item.name,
          target: item.target,
          targetId: item.target_id,
          jobHistoryId: item?.jobHistoryId,
          startTime: item.start_time,
          endTime: item.end_time,
          status: status,
          description: item.description,
          toolCategory: item.tool_category,
          duration: Math.round(item.duration_seconds),
        };
      },
    );

    return { data: timelineItems };
  }

  public async getManyJobHistories(
    workspaceId: string,
    query: GetManyJobHistoriesRequestDto,
  ): Promise<GetManyBaseResponseDto<JobHistoryResponseDto>> {
    const { limit, page, sortOrder, search, jobStatus, jobRunType } = query;
    const { createdFrom, createdTo } = query;
    let { sortBy } = query;

    if (!JOB_HISTORY_SORTABLE_COLUMNS.includes(sortBy)) {
      sortBy = 'createdAt';
    }

    // Filters for the paged query. The status rollup is an aggregate, so it
    // cannot be a WHERE and rides in HAVING; the free-text/run-type/date bounds
    // are plain WHERE. `total` no longer needs its own pass — see the
    // COUNT(*) OVER () note below.
    const applyFilters = (qb: SelectQueryBuilder<JobHistory>) => {
      if (search) {
        qb.andWhere(
          '(jobHistory.jobHistoryName ILIKE :search OR workflow.name ILIKE :search)',
          { search: `%${search}%` },
        );
      }
      if (jobRunType && jobRunType !== 'all') {
        qb.andWhere('jobHistory.jobRunType = :jobRunType', { jobRunType });
      }
      if (createdFrom) {
        qb.andWhere('jobHistory.createdAt >= :createdFrom', {
          createdFrom: new Date(createdFrom),
        });
      }
      if (createdTo) {
        // The client sends a date, not an instant: include the whole end day.
        const end = new Date(createdTo);
        end.setHours(23, 59, 59, 999);
        qb.andWhere('jobHistory.createdAt <= :createdTo', { createdTo: end });
      }
      // 'all' is a UI convention meaning "no status filter".
      if (jobStatus && jobStatus !== 'all') {
        qb.having(`${JOB_HISTORY_STATUS_SQL} = :jobStatus`, { jobStatus });
      }
    };

    // Define interface for raw query result
    interface RawJobHistoryResult {
      id: string;
      createdAt: Date;
      updatedAt: Date;
      totalJobs: string; // COUNT returns string in some databases
      completedJobs: string;
      failedJobs: string;
      status: JobStatus;
      workflowName: string;
      jobHistoryName: string;
      jobRunType: JobRunType;
      // Row count of the grouped result set, repeated on every row.
      total: string;
    }

    // Aggregate totalJobs and status directly over the joined job rows.
    // The jobs relation is already inner-joined, so correlated subqueries
    // per row are unnecessary.
    //
    // `total` rides along as a window function instead of a second query:
    // COUNT(*) OVER () is evaluated after GROUP BY and HAVING (so it sees the
    // same filtered groups the page is drawn from) but before ORDER BY/LIMIT
    // and OFFSET, so it is exactly the number of rows a full result set would
    // have. The old approach re-ran the entire aggregate a second time just to
    // count rows, doubling the cost of the busiest console page.
    const qb = this.jobHistoryRepo
      .createQueryBuilder('jobHistory')
      .innerJoin('jobHistory.jobs', 'job')
      .innerJoin('job.asset', 'jAsset')
      .innerJoin('jAsset.target', 'jTarget')
      .innerJoin('jTarget.workspace', 'workspace')
      .leftJoin('jobHistory.workflow', 'workflow')
      .where('workspace.id = :workspaceId', { workspaceId })
      .select([
        '"jobHistory".id as "id"',
        '"jobHistory"."createdAt" as "createdAt"',
        '"jobHistory"."jobHistoryName" as "jobHistoryName"',
        '"jobHistory"."updatedAt" as "updatedAt"',
        '"workflow"."name" as "workflowName"',
        '"jobHistory"."jobRunType" as "jobRunType"',
        'COUNT(job.id) as "totalJobs"',
        `${JOB_HISTORY_STATUS_SQL} as "status"`,
        `COUNT(*) FILTER (WHERE job.status = '${JobStatus.COMPLETED}') as "completedJobs"`,
        `COUNT(*) FILTER (WHERE job.status = '${JobStatus.FAILED}') as "failedJobs"`,
        'COUNT(*) OVER () as "total"',
      ])
      .groupBy('jobHistory.id')
      .addGroupBy('workflow.name')
      .orderBy(`jobHistory.${sortBy}`, sortOrder)
      .addOrderBy('jobHistory.id', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit);

    applyFilters(qb);

    const rawResults = await qb.getRawMany<RawJobHistoryResult>();

    // The window counts the filtered groups, so an empty page means no rows
    // matched at all rather than a missing count.
    const total =
      rawResults.length > 0 ? parseInt(rawResults[0].total, 10) : 0;

    // Transform raw results to match the response DTO structure
    const transformedData = rawResults.map((raw) => {
      const totalJobs = parseInt(raw.totalJobs, 10) || 0;
      const completedJobs = parseInt(raw.completedJobs, 10) || 0;
      const failedJobs = parseInt(raw.failedJobs, 10) || 0;
      return {
        id: raw.id,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
        totalJobs,
        completedJobs,
        failedJobs,
        progress:
          totalJobs > 0
            ? Math.round(((completedJobs + failedJobs) / totalJobs) * 100)
            : 0,
        status: raw.status,
        workflowName: raw.workflowName,
        jobHistoryName: raw.jobHistoryName,
        jobRunType: raw.jobRunType,
      };
    });

    return getManyResponse({ query, data: transformedData, total });
  }

  /**
   * Maps a job-status rollup (the legacy way of describing a step's progress)
   * onto the workflow step vocabulary.
   */
  private toRunStepStatus(status?: JobStatus): RunStepStatus {
    switch (status) {
      case JobStatus.IN_PROGRESS:
        return 'dispatched';
      case JobStatus.COMPLETED:
        return 'done';
      case JobStatus.FAILED:
        return 'failed';
      case JobStatus.CANCELLED:
        return 'skipped';
      default:
        return 'pending';
    }
  }

  /**
   * Loads a run with its workflow, proving workspace ownership. The check joins
   * through the workflow first: going only jobs → asset → target returns
   * nothing for histories whose jobs were all deleted, wrongly producing a 404.
   */
  private async loadJobHistoryInWorkspace(
    workspaceId: string,
    id: string,
  ): Promise<JobHistory> {
    const jobHistory = await this.jobHistoryRepo.findOne({
      where: {
        id,
      },
      relations: {
        workflow: true,
      },
    });

    if (!jobHistory) {
      throw new NotFoundError('Job history not found');
    }

    // Histories created outside a workflow (e.g. custom-template runs) have no
    // workflow, so fall back to the targets of their jobs — same check as
    // cancelJobHistory.
    const belongsToWorkspace = await this.jobHistoryRepo
      .createQueryBuilder('jobHistory')
      .leftJoin('jobHistory.workflow', 'workflow')
      .leftJoin('workflow.workspace', 'workflowWorkspace')
      .leftJoin('jobHistory.jobs', 'job')
      .leftJoin('job.asset', 'asset')
      .leftJoin('asset.target', 'target')
      .where('jobHistory.id = :id', { id })
      .andWhere(
        '(workflowWorkspace.id = :workspaceId OR target.workspaceId = :workspaceId)',
        { workspaceId },
      )
      .getExists();

    if (!belongsToWorkspace) {
      throw new NotFoundError('Job history not found in workspace');
    }

    return jobHistory;
  }

  public async getJobHistoryDetail(
    workspaceId: string,
    id: string,
  ): Promise<JobHistoryDetailResponseDto> {
    const jobHistory = await this.loadJobHistoryInWorkspace(workspaceId, id);

    // Tool badges and the DAG both come from the same job rows and workflow
    // definition; the code view reuses them so the three views can never drift.
    const { tools, steps } = await this.buildRunView(jobHistory, workspaceId);
    const {
      id: historyId,
      createdAt,
      updatedAt,
      workflow,
      jobHistoryName,
      jobRunType,
    } = jobHistory;

    const activeJobsCount = await this.repo.count({
      where: {
        jobHistory: { id: historyId },
        status: In([JobStatus.PENDING, JobStatus.IN_PROGRESS]),
      },
    });

    // Step progress is the source of truth for workflow runs; legacy histories
    // (no steps) fall back to the tool badges.
    const settled = new Set(['done', 'failed', 'skipped']);
    const stepsTotal = steps.length;
    const stepsDone = steps.filter((step) => settled.has(step.status)).length;
    const legacyDone = tools.filter((tool) =>
      [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED].includes(
        tool.status as JobStatus,
      ),
    ).length;
    const progress =
      stepsTotal > 0
        ? Math.round((stepsDone / stepsTotal) * 100)
        : tools.length > 0
          ? Math.round((legacyDone / tools.length) * 100)
          : 0;

    const failureReason = activeJobsCount === 0
      ? await this.findRunFailureReason(historyId)
      : null;

    return {
      id: historyId,
      workflowName: workflow?.name,
      jobHistoryName,
      createdAt,
      updatedAt,
      jobRunType,
      tools,
      steps,
      activeJobsCount,
      progress,
      stepsDone: stepsTotal > 0 ? stepsDone : legacyDone,
      stepsTotal: stepsTotal > 0 ? stepsTotal : tools.length,
      etaSeconds:
        activeJobsCount > 0 && progress > 0
          ? await this.estimateEtaSeconds(workflow?.id, historyId, progress)
          : null,
      failureReason,
    };
  }

  /** Latest error-log message for any job of the run, if one exists. */
  private async findRunFailureReason(
    historyId: string,
  ): Promise<string | null> {
    const row = await this.jobErrorLogRepo
      .createQueryBuilder('log')
      .innerJoin('log.job', 'job')
      .where('job.jobHistoryId = :historyId', { historyId })
      .orderBy('log.createdAt', 'DESC')
      .select('log.logMessage', 'message')
      .limit(1)
      .getRawOne<{ message: string }>();
    return row?.message?.trim() || null;
  }

  /**
   * Remaining time from the median duration of the last 20 completed runs of
   * the same workflow. Median rather than mean so one hung run cannot skew it.
   */
  private async estimateEtaSeconds(
    workflowId: string | undefined,
    currentId: string,
    progress: number,
  ): Promise<number | null> {
    if (!workflowId) return null;
    const rows = await this.jobHistoryRepo
      .createQueryBuilder('history')
      .innerJoin('history.workflow', 'workflow')
      .where('workflow.id = :workflowId', { workflowId })
      .andWhere('history.id != :currentId', { currentId })
      .andWhere('history.isCompleted = true')
      .andWhere("history.createdAt > NOW() - INTERVAL '90 days'")
      .select(
        'EXTRACT(EPOCH FROM (history.updatedAt - history.createdAt))',
        'seconds',
      )
      .orderBy('history.updatedAt', 'DESC')
      .limit(20)
      .getRawMany<{ seconds: string }>();

    const durations = rows
      .map((row) => Number(row.seconds))
      .filter((seconds) => Number.isFinite(seconds) && seconds > 0)
      .sort((a, b) => a - b);
    if (durations.length < 2) return null;

    const median = durations[Math.floor(durations.length / 2)];
    return Math.max(0, Math.round(median * (1 - progress / 100)));
  }

  /** A run step's category: the declared one, else its tool's default. */
  private stepCategory(
    tool: Parameters<typeof resolveToolCategory>[0] | undefined,
    declared: string | undefined,
  ): string | undefined {
    if (!tool) return declared;
    try {
      return resolveToolCategory(tool, declared).name;
    } catch {
      return declared;
    }
  }

  /**
   * Everything a run's views need from its workflow definition and job rows:
   * the tool badges and the DAG steps.
   */
  private async buildRunView(
    jobHistory: JobHistory,
    workspaceId: string,
  ): Promise<{ tools: ToolWithStatusDto[]; steps: WorkflowStepStatusDto[] }> {
  // Query tool statuses computed from actual jobs in this history
  // Uses CASE/COUNT pattern from targets.service.ts L472-475
  const rawToolStatuses = await this.repo
    .createQueryBuilder('job')
    .select([
      'job.toolId as "toolId"',
      `CASE
        WHEN COUNT(CASE WHEN job.status = '${JobStatus.CANCELLED}' THEN 1 END) > 0
             AND COUNT(CASE WHEN job.status IN ('${JobStatus.PENDING}', '${JobStatus.IN_PROGRESS}') THEN 1 END) = 0 THEN '${JobStatus.CANCELLED}'
        WHEN COUNT(CASE WHEN job.status = '${JobStatus.IN_PROGRESS}' THEN 1 END) > 0 THEN '${JobStatus.IN_PROGRESS}'
        WHEN COUNT(CASE WHEN job.status = '${JobStatus.PENDING}' THEN 1 END) > 0 THEN '${JobStatus.PENDING}'
        WHEN COUNT(CASE WHEN job.status = '${JobStatus.FAILED}' THEN 1 END) > 0 THEN '${JobStatus.FAILED}'
        WHEN COUNT(CASE WHEN job.status = '${JobStatus.COMPLETED}' THEN 1 END) > 0 THEN '${JobStatus.COMPLETED}'
        ELSE '${JobStatus.PENDING}'
      END as "status"`,
    ])
    .where('job.jobHistoryId = :historyId', { historyId: jobHistory.id })
    .groupBy('job.toolId')
    .getRawMany<{ toolId: string; status: JobStatus }>();

  // Build a lookup map: toolId → computed status
  const toolStatusMap = new Map<string, JobStatus>();
  rawToolStatuses.forEach((row) => toolStatusMap.set(row.toolId, row.status));

  // Jobs a worker is executing, per step (tool + category). A dispatched step
  // only has its jobs created: until a worker picks one up it is queued.
  // Failures are counted here too: the engine records them on the step only
  // once the step drains, so a running step reads them live.
  const rawRunning = await this.repo
    .createQueryBuilder('job')
    .select('job.toolId', 'toolId')
    .addSelect('job.category', 'category')
    .addSelect(
      `COUNT(*) FILTER (WHERE job.status = '${JobStatus.IN_PROGRESS}')`,
      'running',
    )
    .addSelect(
      `COUNT(*) FILTER (WHERE job.status = '${JobStatus.FAILED}')`,
      'failed',
    )
    .where('job.jobHistoryId = :historyId', { historyId: jobHistory.id })
    .groupBy('job.toolId')
    .addGroupBy('job.category')
    .getRawMany<{
      toolId: string;
      category: string;
      running: string;
      failed?: string;
    }>();
  const runningByStep = new Map<string, number>();
  const failedByStep = new Map<string, number>();
  rawRunning.forEach((row) => {
    runningByStep.set(`${row.toolId}:${row.category}`, Number(row.running ?? 0));
    failedByStep.set(`${row.toolId}:${row.category}`, Number(row.failed ?? 0));
  });

  // Map tools from workflow content with their computed status.
  // Only id/name/logoUrl/status are exposed — the UI renders nothing else
  // from these records, so the rest of the Tool entity is omitted to save
  // bandwidth (the full entity is only resolved server-side for matching).
  const instaledTools = await this.toolsService.getInstalledTools(
    {},
    workspaceId,
  );
  // Index installed tools by name once. The old `.find()` inside `.map()`
  // rescanned the whole installed-tool list for every workflow step, making
  // this O(steps x tools). First match wins, matching the previous behaviour.
  const installedToolsByName = new Map<
    string,
    (typeof instaledTools.data)[number]
  >();
  for (const tool of instaledTools.data) {
    if (!installedToolsByName.has(tool.name)) {
      installedToolsByName.set(tool.name, tool);
    }
  }

  // Dependency order, not stored order: `content` is jsonb and Postgres does
  // not preserve the map's key order.
  const workflowJobs = orderedJobEntries(jobHistory.workflow?.content.jobs);

  const tools = workflowJobs
    .map(([, job]) => installedToolsByName.get(job.run))
    .filter((tool): tool is NonNullable<typeof tool> => tool !== undefined)
    // One entry per tool, even when several steps run it in different categories.
    .filter((tool, index, all) => all.findIndex((t) => t.id === tool.id) === index)
    .map((tool) => ({
      id: tool.id,
      name: tool.name,
      logoUrl: tool.logoUrl,
      // Undefined when the tool has no job rows in this history (e.g. all
      // jobs deleted) — the UI renders no badge instead of a misleading
      // "pending".
      status: toolStatusMap.get(tool.id!),
    }));

  // Post-process: if a tool at a later index has completed, mark earlier
  // pending tools as skipped — the workflow clearly moved past them.
  let hasCompletedAhead = false;
  for (let i = tools.length - 1; i >= 0; i--) {
    if (tools[i].status === JobStatus.COMPLETED) {
      hasCompletedAhead = true;
    } else if (tools[i].status === JobStatus.PENDING && hasCompletedAhead) {
      tools[i].status = JobStatus.SKIPPED;
    }
  }

  // Steps as the workflow engine recorded them: which ones ran in parallel,
  // which are waiting on `needs`, and why a step never ran. Runs created
  // before the engine have no persisted state (`steps = {}`) and fall back to
  // the status derived from their job rows so old run pages keep working.
  const persistedSteps = jobHistory.steps ?? {};
  const hasPersistedState = Object.keys(persistedSteps).length > 0;
  const steps: WorkflowStepStatusDto[] = workflowJobs.map(([id, job]) => {
    const tool = installedToolsByName.get(job.run);
    const state = persistedSteps[id];
    const derived = tool ? toolStatusMap.get(tool.id!) : undefined;
    const category = this.stepCategory(tool, job.category);
    const running = tool ? runningByStep.get(`${tool.id}:${category}`) : 0;
    // A finished step keeps what the engine recorded: its jobs may since have
    // been retried or pruned.
    const failed =
      state?.status === 'dispatched' && tool
        ? failedByStep.get(`${tool.id}:${category}`) || undefined
        : state?.failed;
    return {
      id,
      name: job.name ?? id,
      run: job.run,
      category,
      needs: normalizeNeeds(job.needs),
      status: state?.status ?? this.toRunStepStatus(derived),
      reason: state?.reason,
      jobs: state?.jobs ?? 0,
      failed,
      running: running || undefined,
      toolId: tool?.id,
      logoUrl: tool?.logoUrl,
      dispatchedAt: state?.dispatchedAt
        ? new Date(state.dispatchedAt)
        : undefined,
      finishedAt: state?.finishedAt ? new Date(state.finishedAt) : undefined,
    };
  });

  if (!hasPersistedState) {
    let completedAhead = false;
    for (let i = steps.length - 1; i >= 0; i--) {
      if (steps[i].status === 'done') {
        completedAhead = true;
      } else if (steps[i].status === 'pending' && completedAhead) {
        steps[i].status = 'skipped';
      }
    }
  }

    return { tools, steps };
  }

  /**
   * The definition in the order every workflow template is written in: name,
   * on, jobs — jobs by dependency order, each job by name/run/needs/config.
   * Postgres jsonb does not preserve key order (nor does the map it is
   * written from), so the code view would otherwise print them shuffled.
   * ponytail: hand-rolled key lists; add a key here when the templates grow one.
   */
  private orderWorkflowContent(content?: WorkflowContent): WorkflowContent | undefined {
    if (!content) return undefined;

    const jobs: [string, WorkflowJob][] = orderedJobEntries(
      content.jobs,
    ).map(([id, job]) => [id, orderJob(job)]);

    return {
      name: content.name,
      ...(content.on ? { on: content.on } : {}),
      jobs: Object.fromEntries(jobs),
    };
  }

  /**
   * The workflow definition of one run, as stored when the run was created:
   * the jsonb content for machines, the same content serialized to YAML for
   * the code view, plus the step state of this particular run.
   */
  public async getJobHistoryWorkflow(
    workspaceId: string,
    id: string,
  ): Promise<JobHistoryWorkflowResponseDto> {
    const jobHistory = await this.loadJobHistoryInWorkspace(workspaceId, id);
    const { steps } = await this.buildRunView(jobHistory, workspaceId);
    const content = this.orderWorkflowContent(jobHistory.workflow?.content);

    return {
      id: jobHistory.id,
      jobHistoryName: jobHistory.jobHistoryName,
      workflowId: jobHistory.workflow?.id,
      workflowName: jobHistory.workflow?.name,
      content,
      steps,
    };
  }
}
