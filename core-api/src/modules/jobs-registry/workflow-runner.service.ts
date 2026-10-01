import { EventTriggerType, JobRunType, JobStatus, ToolCategory } from '@/common/enums/enum';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, type QueryRunner } from 'typeorm';
import { Tool } from '../tools/entities/tools.entity';
import { ToolsService } from '../tools/tools.service';
import { Workflow } from '../workflows/entities/workflow.entity';
import {
  buildWorkflowGraph,
  filterGraphByAssetsDiscovery,
  planAdvance,
  reconcileStepStates,
  withStepDispatched,
  withStepFailed,
  withStepSkipped,
  type StepJobSummary,
  type WorkflowGraph,
  type WorkflowRunScope,
} from '../workflows/workflow-graph';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { JobHistory } from './entities/job-history.entity';
import { Job } from './entities/job.entity';
import { JobsRegistryService } from './jobs-registry.service';

export interface StartRunInput {
  workflow: Workflow;
  workspaceId: string;
  jobName: string;
  jobRunType?: JobRunType;
  /** Scope of an event-triggered run: every step fans out to the target's assets. */
  targetIds?: string[];
  /** Scope of an asset-group run: every step stays inside the selected assets. */
  assetIds?: string[];
}

export interface StartRunResult {
  /** `null` when the workflow had nothing runnable (all steps skipped). */
  jobHistory: JobHistory | null;
  dispatched: number;
}

/** Everything the engine needs to know about a workflow, resolved once. */
interface RunGraph {
  graph: WorkflowGraph;
  toolsByRun: Map<string, Tool>;
  /** Steps removed by the workspace assets-discovery switch. */
  droppedSteps: string[];
}

/**
 * Drives a workflow run: dispatches steps whose `needs` are satisfied and keeps
 * the run's step state (`job_histories.steps`) in sync.
 *
 * Steps without `needs` are dispatched together (parallel); a step whose
 * dependency failed is skipped, and the skip cascades. All state transitions
 * happen under a `FOR UPDATE` lock on the run row, so two jobs finishing at the
 * same instant cannot double-dispatch a step or complete a run too early.
 */
@Injectable()
export class WorkflowRunnerService {
  private readonly logger = new Logger(WorkflowRunnerService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly jobsRegistryService: JobsRegistryService,
    private readonly toolsService: ToolsService,
    private readonly workspaceService: WorkspacesService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Starts a run for a workflow: creates its single `JobHistory`, snapshots the
   * run scope, emits `WORKFLOW_START` (once per run) and dispatches every root
   * step.
   */
  public async startRun(input: StartRunInput): Promise<StartRunResult> {
    const context = await this.buildRunGraph(input.workflow, input.workspaceId);
    if (context.graph.steps.length === 0) {
      this.logger.warn(
        `Workflow ${input.workflow.id} has no runnable steps; nothing was dispatched`,
      );
      return { jobHistory: null, dispatched: 0 };
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    let jobHistory: JobHistory;
    try {
      jobHistory = queryRunner.manager.create(JobHistory, {
        workflow: input.workflow,
        jobRunType: input.jobRunType,
        jobHistoryName: input.jobName,
        isCompleted: false,
        steps: {},
        scope: this.buildScope(input.targetIds, input.assetIds),
      });
      await queryRunner.manager.save(jobHistory);
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    // Exactly one start event per run — the statistics snapshot listener keys
    // off it and would otherwise overwrite its own baseline.
    this.eventEmitter.emit(EventTriggerType.WORKFLOW_START, {
      workflow: input.workflow,
      workspaceId: input.workspaceId,
      targetIds: input.targetIds,
      assetIds: input.assetIds,
      jobHistory,
      jobName: input.jobName,
      jobRunType: input.jobRunType,
    });

    const { dispatched } = await this.advance(jobHistory.id, context);
    return { jobHistory, dispatched };
  }

  /**
   * Called when one job of a run reaches a terminal state. Never throws: a
   * failure here must not turn a completed job into a failed one — the next
   * completion retries the advance.
   */
  public async onJobTerminal(job: Job): Promise<void> {
    const jobHistoryId = job?.jobHistory?.id;
    if (!jobHistoryId) return;

    try {
      await this.advance(jobHistoryId);
    } catch (error) {
      this.logger.error(
        `Failed to advance run ${jobHistoryId} after job ${job?.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** Recomputes the run and dispatches whatever became ready. */
  public async advanceRun(jobHistoryId: string): Promise<void> {
    await this.advance(jobHistoryId);
  }

  private async advance(
    jobHistoryId: string,
    prebuilt?: RunGraph,
  ): Promise<{ dispatched: number; completed: boolean }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let completionJob: Job | null = null;
    let dispatched = 0;
    let completed = false;

    try {
      const jobHistory = await queryRunner.manager
        .createQueryBuilder(JobHistory, 'job_history')
        // `FOR NO KEY UPDATE`, not `FOR UPDATE`: dispatching a step inserts job
        // rows whose FK check takes a FOR KEY SHARE lock on this very row, and
        // FOR UPDATE conflicts with it — that deadlocks the two connections
        // against each other. NO KEY UPDATE still serializes concurrent advances,
        // and the lock-table alias has to be lowercase (unquoted SQL folds it).
        .setLock('for_no_key_update', undefined, ['job_history'])
        .leftJoinAndSelect('job_history.workflow', 'workflow')
        .leftJoinAndSelect('workflow.workspace', 'workspace')
        .where('job_history.id = :id', { id: jobHistoryId })
        .getOne();

      if (!jobHistory?.workflow) {
        await queryRunner.rollbackTransaction();
        return { dispatched: 0, completed: false };
      }
      // A finished (or cancelled) run must never be advanced again.
      if (jobHistory.isCompleted) {
        await queryRunner.rollbackTransaction();
        return { dispatched: 0, completed: true };
      }

      const workflow = jobHistory.workflow;
      const workspaceId = workflow.workspace?.id ?? '';
      const context =
        prebuilt ?? (await this.buildRunGraph(workflow, workflow.workspace?.id));
      const scope: WorkflowRunScope = jobHistory.scope ?? {};

      const summaries = await this.summarizeStepJobs(queryRunner, jobHistoryId);
      let state = reconcileStepStates(
        context.graph,
        jobHistory.steps ?? {},
        summaries,
      );
      for (const dropped of context.droppedSteps) {
        state = withStepSkipped(state, dropped, 'assets-discovery-off');
      }

      let isComplete = false;
      // Each pass turns at least one pending step terminal, so this terminates
      // in at most (number of steps + 1) passes.
      for (let pass = 0; pass <= context.graph.steps.length; pass++) {
        const plan = planAdvance(context.graph, state);
        for (const skip of plan.skip) {
          state = withStepSkipped(state, skip.id, skip.reason);
        }
        if (plan.dispatch.length === 0) {
          isComplete = plan.isComplete;
          break;
        }

        for (const step of plan.dispatch) {
          const tool = context.toolsByRun.get(step.run);
          if (!tool) {
            this.logger.warn(
              `Step "${step.name}" (${step.run}) failed: tool not found for workspace ${workspaceId || 'unknown'}`,
            );
            state = withStepFailed(state, step.id);
            continue;
          }

          try {
            const jobs = await this.jobsRegistryService.createNewJob({
              tool,
              config: step.config,
              configProfileId: step.configProfileId,
              // Every step of a run reuses the scope captured at start, so a
              // subdomain step's newly discovered assets are picked up by the
              // next step while an asset-group run stays inside its selection.
              targetIds: scope.targetIds,
              assetIds: scope.assetIds,
              workflow,
              jobHistory,
              priority: tool.priority,
              workspaceId,
            });

            if (jobs.length === 0) {
              state = withStepSkipped(state, step.id, 'no-inputs');
            } else {
              state = withStepDispatched(state, step.id, jobs.length);
              dispatched += jobs.length;
            }
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            this.logger.warn(
              `Step "${step.name}" (${step.run}) failed to dispatch: ${message}`,
            );
            state = withStepFailed(state, step.id);
          }
        }
      }

      const activeJobs = await queryRunner.manager
        .createQueryBuilder(Job, 'job')
        .where('job."jobHistoryId" = :id', { id: jobHistoryId })
        .andWhere('job.status IN (:...statuses)', {
          statuses: [JobStatus.PENDING, JobStatus.IN_PROGRESS],
        })
        .getCount();

      const shouldComplete = isComplete && activeJobs === 0;

      await queryRunner.manager.update(
        JobHistory,
        { id: jobHistoryId },
        {
          steps: state,
          isCompleted: shouldComplete || jobHistory.isCompleted,
        },
      );

      if (shouldComplete) {
        completionJob = await this.loadCompletionJob(queryRunner, jobHistoryId);
      }

      await queryRunner.commitTransaction();
      completed = shouldComplete;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    // Emitted after the commit so listeners never read uncommitted state.
    if (completionJob) {
      this.eventEmitter.emit(EventTriggerType.WORKFLOW_END, completionJob);
    }

    return { dispatched, completed };
  }

  /**
   * Resolves the run graph: parses the workflow, drops the SUBDOMAINS steps when
   * the workspace has assets discovery disabled, and loads the tools so the
   * caller can dispatch without another round trip.
   */
  private async buildRunGraph(
    workflow: Workflow,
    workspaceId?: string,
  ): Promise<RunGraph> {
    const fullGraph = buildWorkflowGraph(workflow.content);

    const runNames = [...new Set(fullGraph.steps.map((step) => step.run))];
    const tools =
      runNames.length > 0
        ? await this.toolsService.getToolByNames({ names: runNames })
        : [];
    const toolsByRun = new Map<string, Tool>();
    for (const tool of tools) {
      if (tool.name) toolsByRun.set(tool.name, tool);
    }

    let isAssetsDiscovery = true;
    if (workspaceId) {
      const config =
        await this.workspaceService.getWorkspaceConfigValue(workspaceId);
      isAssetsDiscovery = config.isAssetsDiscovery;
    }
    if (isAssetsDiscovery) {
      return { graph: fullGraph, toolsByRun, droppedSteps: [] };
    }

    const categories = new Map<string, ToolCategory>();
    for (const [name, tool] of toolsByRun) {
      if (tool.category) categories.set(name, tool.category);
    }

    const graph = filterGraphByAssetsDiscovery(fullGraph, false, categories);
    const kept = new Set(graph.steps.map((step) => step.id));
    return {
      graph,
      toolsByRun,
      droppedSteps: fullGraph.steps
        .filter((step) => !kept.has(step.id))
        .map((step) => step.id),
    };
  }

  private buildScope(
    targetIds?: string[],
    assetIds?: string[],
  ): WorkflowRunScope {
    const scope: WorkflowRunScope = {};
    if (targetIds?.length) scope.targetIds = targetIds;
    if (assetIds?.length) scope.assetIds = assetIds;
    return scope;
  }

  /** Per-tool job rollup of the run, used to reconcile each step's state. */
  private async summarizeStepJobs(
    queryRunner: QueryRunner,
    jobHistoryId: string,
  ): Promise<StepJobSummary[]> {
    const rows = await queryRunner.manager
      .createQueryBuilder(Job, 'job')
      .innerJoin('job.tool', 'tool')
      .select('tool.name', 'tool')
      .addSelect('COUNT(*)', 'total')
      .addSelect(`MAX(job."completedAt")`, 'lastCompletedAt')
      .addSelect(
        `COUNT(*) FILTER (WHERE job.status = '${JobStatus.PENDING}')`,
        'pending',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE job.status = '${JobStatus.IN_PROGRESS}')`,
        'inProgress',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE job.status = '${JobStatus.COMPLETED}')`,
        'completed',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE job.status = '${JobStatus.FAILED}')`,
        'failed',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE job.status = '${JobStatus.CANCELLED}')`,
        'cancelled',
      )
      .where('job."jobHistoryId" = :id', { id: jobHistoryId })
      .groupBy('tool.name')
      .getRawMany<Record<string, string | Date>>();

    return rows.map((row) => {
      const lastCompletedAt = row['lastCompletedAt'];
      return {
        tool: String(row['tool']),
        total: Number(row['total'] ?? 0),
        pending: Number(row['pending'] ?? 0),
        inProgress: Number(row['inProgress'] ?? 0),
        completed: Number(row['completed'] ?? 0),
        failed: Number(row['failed'] ?? 0),
        cancelled: Number(row['cancelled'] ?? 0),
        // pg hands timestamptz back as a Date; keep the summary a plain string.
        lastCompletedAt:
          lastCompletedAt instanceof Date
            ? lastCompletedAt.toISOString()
            : lastCompletedAt,
      };
    });
  }

  /** The job payload carried by `WORKFLOW_END` (statistics snapshot diff). */
  private async loadCompletionJob(
    queryRunner: QueryRunner,
    jobHistoryId: string,
  ): Promise<Job | null> {
    return queryRunner.manager
      .createQueryBuilder(Job, 'job')
      .leftJoinAndSelect('job.asset', 'asset')
      .leftJoinAndSelect('asset.target', 'target')
      .leftJoinAndSelect('job.jobHistory', 'jobHistory')
      .leftJoinAndSelect('jobHistory.workflow', 'workflow')
      .where('job.jobHistoryId = :id', { id: jobHistoryId })
      .orderBy('job.createdAt', 'DESC')
      .getOne();
  }
}
