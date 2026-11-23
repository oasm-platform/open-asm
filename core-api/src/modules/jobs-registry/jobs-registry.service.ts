import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { GetManyBaseResponseDto } from '@/common/dtos/get-many-base.dto';
import { JOB_INSERT_CHUNK } from '@/common/constants/app.constants';
import { BullMQName, EventTriggerType, JobPriority, JobStatus, ToolCategory, WorkerType } from '@/common/enums/enum';
import bindingCommand from '@/common/utils/binding-command.util';
import { getManyResponse } from '@/common/utils/get-many-response.util';
import { InjectQueue } from '@nestjs/bullmq';
import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { DataSource, DeepPartial, EntityManager, Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { ConnectorRegistryService } from '../connectors/connector-registry.service';
import { StorageService } from '../storage/storage.service';
import { ToolConfigProfilesService } from '../tools/tool-config-profiles.service';
import {
  getSensitiveFields,
  maskProfile,
} from '../tools/validators/tool-config-profiles.crypto';
import { resolveToolCategory } from '../tools/tool-categories';
import { resolveStepInputs } from '../tools/tool-io';
import { resolveToolTargetTypes } from '../tools/tool-target-types';
import { builtInTools } from '../tools/tools-provider/built-in-tools';
import { ToolsService } from '../tools/tools.service';
import { planStepInputs } from './step-inputs';
import { StepScopeLoader } from './step-scope.loader';
import { withStepSkipped } from '../workflows/workflow-graph';
import { WorkerStreamRegistry } from '../workers/worker-stream-registry.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { GetManyJobsRequestDto } from './dto/get-many-jobs.dto';
import { JobListItemDto } from './dto/job-list-item.dto';
import { BaseResultDto, CreateJobs, UpdateResultDto } from './dto/jobs-registry.dto';
import { JobErrorLog } from './entities/job-error-log.entity';
import { JobHistory } from './entities/job-history.entity';
import { Job } from './entities/job.entity';
import { isNotFound } from '@/common/errors/error-checks';
import { InvalidInputError, NotFoundError } from '@/common/errors/domain.errors';

/**
 * Sortable columns for Job, whitelisted to prevent SQL injection via
 * ORDER BY interpolation (client-supplied column names are never trusted).
 */
const JOB_SORTABLE_COLUMNS: string[] = [
  'id',
  'createdAt',
  'updatedAt',
  'completedAt',
  'pickJobAt',
  'priority',
  'status',
  'category',
  'workerId',
  'retryCount',
];

/** Platform-set config keys: from TemplatesService.run and claim-time signing only. */
const TEMPLATE_CONFIG_KEYS = ['customTemplateIds', 'customTemplates'];

function withoutTemplateKeys(
  config: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!config || !TEMPLATE_CONFIG_KEYS.some((key) => key in config)) return config;
  const rest = { ...config };
  for (const key of TEMPLATE_CONFIG_KEYS) delete rest[key];
  return rest;
}

@Injectable()
export class JobsRegistryService {
  /** Loads the assets, services and URLs a step's jobs are planned over. */
  private readonly stepScope: StepScopeLoader;

  constructor(
    @InjectRepository(Job) public readonly repo: Repository<Job>,
    @InjectRepository(JobHistory)
    public readonly jobHistoryRepo: Repository<JobHistory>,
    @InjectRepository(JobErrorLog)
    public readonly jobErrorLogRepo: Repository<JobErrorLog>,
    private dataSource: DataSource,
    private toolsService: ToolsService,
    private storageService: StorageService,
    @InjectQueue(BullMQName.JOB_RESULT) private jobResultQueue: Queue,
    private eventEmitter: EventEmitter2,
    private workspaceService: WorkspacesService,
    private readonly connectorRegistry: ConnectorRegistryService,
    private readonly toolConfigProfilesService: ToolConfigProfilesService,
    private readonly workerStreamRegistry: WorkerStreamRegistry,
  ) {
    this.stepScope = new StepScopeLoader(dataSource);
  }
  private readonly logger = new Logger(JobsRegistryService.name);
  public async getManyJobs(
    workspaceId: string,
    query: GetManyJobsRequestDto,
  ): Promise<GetManyBaseResponseDto<JobListItemDto>> {
    const { limit, page, sortOrder, jobHistoryId, jobStatus } = query;
    let { sortBy } = query;

    if (!JOB_SORTABLE_COLUMNS.includes(sortBy)) {
      sortBy = 'createdAt';
    }

    const qb = this.repo
      .createQueryBuilder('job')
      // Only hydrate the tool columns the UI renders (id/name/logoUrl) —
      // selecting the full Tool entity wastes bandwidth on every list row.
      .leftJoin('job.tool', 'tool')
      .addSelect(['tool.id', 'tool.name', 'tool.logoUrl'])
      // Only hydrate the asset columns the UI renders (id/value/targetId) —
      // selecting the full Asset entity (incl. dnsRecords, target) wastes
      // bandwidth on every list row. The target join stays: it backs the
      // tenant workspaceId filter below.
      .leftJoin('job.asset', 'asset')
      .addSelect(['asset.id', 'asset.value', 'asset.targetId'])
      .leftJoin('asset.target', 'target')
      .leftJoinAndSelect('job.assetService', 'assetService')
      .leftJoinAndSelect('job.errorLogs', 'errorLogs')
      .where('1=1');

    if (jobHistoryId) {
      qb.andWhere('job.jobHistoryId = :jobHistoryId', { jobHistoryId });
    }

    // 'all' is a UI convention meaning "no status filter"
    if (jobStatus && jobStatus !== 'all') {
      qb.andWhere('job.status = :jobStatus', { jobStatus });
    }

    // Tenant scope always comes from the authenticated request context,
    // never from a client-supplied query parameter.
    qb.andWhere('target.workspaceId = :workspaceId', { workspaceId });

    qb.take(query.limit)
      .skip((page - 1) * limit)
      .orderBy(`job.${sortBy}`, sortOrder)
      .addOrderBy('job.id', 'ASC');

    const [data, total] = await qb.getManyAndCount();

    // `config` is persisted already-decrypted (see resolveConfigForJob), so it
    // must be masked before it leaves the API. The sensitive-name heuristic runs
    // over both the connector schema and the actual keys, so a connector without
    // a resolvable schema still masks instead of leaking plaintext.
    for (const job of data) {
      job.config = this.maskJobConfig(job);
    }

    return getManyResponse<JobListItemDto>({ query, data, total });
  }

  /** Returns the job config with every secret replaced by a `****…` mask. */
  private maskJobConfig(job: Job): Record<string, unknown> | null {
    const config = job.config;
    if (!config || typeof config !== 'object') return config ?? null;

    const entry = job.tool
      ? this.connectorRegistry.getConnector(job.tool.name)
      : null;
    const schemaFields = getSensitiveFields(entry?.configSchema);
    // Synthesize a schema from the real keys: isSensitiveField() only needs the
    // property name plus a truthy object value to apply the name heuristic.
    const nameFields = getSensitiveFields({
      properties: Object.fromEntries(
        Object.keys(config).map((key) => [key, {}]),
      ),
    });

    return maskProfile(config, [...new Set([...schemaFields, ...nameFields])]);
  }

  /**
   * Creates jobs for given tools and targets, linked to a jobHistory.
   * @param tools list of tools to run
   * @param targets list of targets to scan
   * @param workflow optional workflow to link
   */
  public async createNewJob({
    tool,
    targetIds,
    workspaceId,
    assetIds,
    assetServiceIds,
    workflow,
    jobHistory: existingJobHistory,
    priority,
    isSaveRawResult,
    jobName,
    isPublishEvent,
    jobRunType,
    configProfileId,
    config: inlineConfig,
    category,
    customTemplateIds,
    input,
  }: CreateJobs,
  {
    manager,
  }: {
    /**
     * Writes the jobs on this transaction instead of committing them on their
     * own; the caller then owns `notifyJobsAvailable` after its commit.
     */
    manager?: EntityManager;
  } = {}): Promise<Job[]> {
    // A workflow's inline config is author-controlled and never schema-checked:
    // template keys there would run templates the author cannot read, or seed
    // a shared connector cache. Only the explicit customTemplateIds may set them.
    const config = withoutTemplateKeys(inlineConfig);
    if (!tool) {
      throw new Error('Tool is required for creating a job');
    }

    // Throws for a category the tool does not declare — the step fails with that message.
    const categorySpec = resolveToolCategory(tool, category);
    const jobCategory = categorySpec.name;

    // Detect connector jobs: Tool.name IS the connector slug
    const connectorEntry = this.connectorRegistry.getConnector(tool.name);
    const isConnector = !!connectorEntry?.image;

    // Resolve merged final config for connector jobs.
    // Catches both assertProfileOwnership (orphan profile) and
    // resolveConfigForJob errors, persisting FAILED job + error log
    // so the job-log UI surfaces the failure, then rethrows.
    let mergedConfig: Record<string, unknown> | undefined;
    if (isConnector) {
      try {
        // Validate configProfileId belongs to same workspace AND tool
        if (configProfileId) {
          await this.toolConfigProfilesService.assertProfileOwnership(
            workspaceId,
            configProfileId,
            tool.id!,
          );
        }

        mergedConfig = await this.toolConfigProfilesService.resolveConfigForJob(
          workspaceId,
          tool.id!,
          { config, configProfileId },
        );

        // If no config resolved but tool requires config (has schema), fail fast.
        if (!mergedConfig && (!config || Object.keys(config).length === 0)) {
          const entry = this.connectorRegistry.getConnector(tool.name);
          const schema = entry?.configSchema;
          if (schema) {
            throw new InvalidInputError(
              `missing/default profile for connector "${tool.name}": tool requires configuration but no profile was provided or found`,
            );
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `[config-profile] ${tool.name}: ${message} (profileId=${configProfileId ?? 'none'}, workspace=${workspaceId})`,
        );
        await this.persistFailedConfigJob({
          tool,
          category: jobCategory,
          workflow,
          jobHistory: existingJobHistory,
          jobRunType,
          jobName,
          configProfileId,
          config,
          workspaceId,
          message,
        });
        throw error;
      }
      if (customTemplateIds?.length) {
        mergedConfig = { ...mergedConfig, customTemplateIds };
      }
    }

    if (
      priority &&
      (priority < JobPriority.CRITICAL || priority > JobPriority.BACKGROUND)
    ) {
      priority = tool.priority || JobPriority.BACKGROUND;
    } else if (!priority) {
      priority = tool.priority || JobPriority.BACKGROUND;
    }
    // Step 1: create job history
    let jobHistory: JobHistory;

    if (existingJobHistory) {
      jobHistory = existingJobHistory;
    } else {
      jobHistory = this.jobHistoryRepo.create({
        workflow,
        jobRunType,
        jobHistoryName: jobName,
      });
      await this.jobHistoryRepo.save(jobHistory);
      this.eventEmitter.emit(EventTriggerType.WORKFLOW_START, {
        tool,
        targetIds,
        workspaceId,
        assetIds,
        workflow,
        jobHistory,
        priority,
        isSaveRawResult,
        jobName,
        isPublishEvent,
        jobRunType,
      });
    }

    const jobRepo = this.dataSource.getRepository(Job);
    const jobsToInsert: Job[] = [];
    // Stored with its secrets encrypted; decrypted again at dispatch.
    const storedConfig = isConnector
      ? await this.toolConfigProfilesService.sealJobConfig(
          workspaceId,
          tool.name,
          mergedConfig ?? config,
        )
      : null;

    // Which jobs to create: the step's input kinds (its own `input`, else
    // the category's) over the run's scope. A tool only ever receives assets
    // of the target types it declares, so a host scanner never sees a
    // repository (and vice versa). A step with nothing to take creates no job
    // and is skipped. See step-inputs.ts.
    const inputs = resolveStepInputs(tool.name, categorySpec, input);
    const loaded = await this.stepScope.load(inputs, {
      targetIds,
      assetIds,
      assetServiceIds,
      workspaceId,
      targetTypes: resolveToolTargetTypes(categorySpec),
    });
    const defaultCommand = builtInTools.find(
      (t) => t.name === tool.name,
    )?.command;

    for (const planned of planStepInputs(inputs, loaded.scope)) {
      const assetService = planned.serviceId
        ? loaded.services.get(planned.serviceId)
        : undefined;
      jobsToInsert.push(
        jobRepo.create({
          id: randomUUID(),
          asset: loaded.assets.get(planned.assetId),
          assetService,
          jobName: tool.name,
          status: JobStatus.PENDING,
          category: jobCategory,
          tool,
          priority: priority ?? 4,
          jobHistory,
          command: isConnector
            ? undefined
            : bindingCommand(defaultCommand ?? '', planned.commandValues),
          inputs: isConnector ? planned.connectorInputs : null,
          configProfileId: isConnector ? configProfileId : undefined,
          config: storedConfig,
          isSaveRawResult: isSaveRawResult ?? false,
          isPublishEvent,
        } as DeepPartial<Job>),
      );
    }

    // Step 4: save all jobs
    if (jobsToInsert.length > 0) {
      if (manager) {
        // The caller's transaction commits these jobs and announces them. A
        // savepoint keeps a failed insert from aborting that transaction.
        await manager.transaction((savepoint) =>
          this.insertJobs(savepoint.getRepository(Job), jobsToInsert),
        );
      } else {
        await this.insertJobs(jobRepo, jobsToInsert);
        this.notifyJobsAvailable(workspaceId);
      }
    }

    return jobsToInsert;
  }

  /** Inserts in chunks: one statement for a big step overflows bind parameters. */
  private async insertJobs(repo: Repository<Job>, jobs: Job[]): Promise<void> {
    for (let start = 0; start < jobs.length; start += JOB_INSERT_CHUNK) {
      // Entities, not partials: their relations are already loaded rows, and
      // insert() writes just their ids. TypeORM's partial type rejects them.
      await repo.insert(
        jobs.slice(start, start + JOB_INSERT_CHUNK) as QueryDeepPartialEntity<Job>[],
      );
    }
  }

  /**
   * Persists a FAILED job row + JobErrorLog when connector config resolution
   * fails (e.g. orphan configProfileId). The job references no asset — it
   * exists so the job-log UI surfaces the dispatch failure. Linked to a
   * JobHistory (created if absent) for workflow grouping.
   */
  private async persistFailedConfigJob(args: {
    tool: CreateJobs['tool'];
    category: ToolCategory;
    workflow: CreateJobs['workflow'];
    jobHistory?: CreateJobs['jobHistory'];
    jobRunType: CreateJobs['jobRunType'];
    jobName: CreateJobs['jobName'];
    configProfileId: CreateJobs['configProfileId'];
    config: CreateJobs['config'];
    workspaceId?: string;
    message: string;
  }): Promise<Job> {
    const {
      tool,
      category,
      workflow,
      jobHistory: existingJobHistory,
      jobRunType,
      jobName,
      configProfileId,
      config,
      workspaceId,
      message,
    } = args;

    let jobHistory = existingJobHistory;
    if (!jobHistory) {
      jobHistory = this.jobHistoryRepo.create({
        workflow,
        jobRunType,
        jobHistoryName: jobName,
      });
      await this.jobHistoryRepo.save(jobHistory);
    }

    const jobRepo = this.dataSource.getRepository(Job);
    const failedJob = jobRepo.create({
      id: randomUUID(),
      status: JobStatus.FAILED,
      category,
      tool,
      priority: tool.priority ?? JobPriority.BACKGROUND,
      jobHistory,
      configProfileId,
      // The job never runs, so a config that cannot be sealed is dropped.
      config: workspaceId
        ? await this.toolConfigProfilesService
            .sealJobConfig(workspaceId, tool.name, config)
            .catch(() => null)
        : null,
      completedAt: new Date(),
    } as DeepPartial<Job>);
    await jobRepo.save(failedJob);

    await this.jobErrorLogRepo.save({
      job: failedJob,
      logMessage: `[config-profile] ${tool.name}: ${message} (profileId=${configProfileId ?? 'none'}, workspace=${workspaceId ?? 'unknown'})`,
      payload: JSON.stringify({
        tool: tool.name,
        configProfileId: configProfileId ?? null,
        workspaceId: workspaceId ?? null,
        reason: message,
      }),
    });

    return failedJob;
  }

  /**
   * Updates the result of a job with the given worker ID.
   * @param workerId the ID of the worker that ran the job
   * @param dto the data transfer object containing the result of the job
   * @returns an object with the worker ID and result of the job
   */
  public async updateResult(
    workerId: string,
    dto: UpdateResultDto,
  ): Promise<{ jobId: string; queueId: string }> {
    const fileName = `${dto.jobId}-${Date.now()}.json`;
    const { path: resultRef } = await this.storageService.uploadFile(
      fileName,
      Buffer.from(JSON.stringify(dto.data)),
      'job-results',
    );

    const bullJob = await this.jobResultQueue.add(
      BullMQName.JOB_RESULT,
      {
        workerId,
        jobId: dto.jobId,
        resultRef,
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );

    return { jobId: bullJob.id ?? '', queueId: bullJob.queueName };
  }

  /**
   * Updates the result of a job by category.
   * @param workerId the ID of the worker that ran the job
   * @param dto the category-specific result data
   * @param category the tool category
   * @returns an object with the worker ID and result of the job
   */
  public async updateResultByCategory(
    workerId: string,
    dto: BaseResultDto,
    category: ToolCategory,
  ): Promise<{ jobId: string; queueId: string }> {
    const fileName = `${dto.jobId}-${Date.now()}.json`;
    const { path: resultRef } = await this.storageService.uploadFile(
      fileName,
      Buffer.from(JSON.stringify(dto)),
      'job-results',
    );

    const bullJob = await this.jobResultQueue.add(
      BullMQName.JOB_RESULT,
      {
        workerId,
        jobId: dto.jobId,
        resultRef,
        category,
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );

    return { jobId: bullJob.id ?? '', queueId: bullJob.queueName };
  }

  /**
   * Fails a job its claimer must not run (see `secretReleaseDenial`). Like
   * `handleJobError`, only an IN_PROGRESS job changes, so a cancel wins.
   */
  public async failUndispatchableJob(
    jobId: string,
    reason: string,
  ): Promise<void> {
    await this.repo.update(
      { id: jobId, status: JobStatus.IN_PROGRESS },
      { status: JobStatus.FAILED },
    );
    await this.jobErrorLogRepo.save({
      job: { id: jobId } as Job,
      logMessage: reason,
      payload: '{}',
    });
  }

  public async handleJobError(dto: UpdateResultDto, job: Job, error: Error) {
    // Conditional write, mirroring the success path: a job that was cancelled
    // (or re-run) while this failure was in flight must KEEP that outcome. A
    // worker legitimately reports an error when its execution is torn down by a
    // cancellation, so an unconditional save here would turn every user cancel
    // into a failure.
    const failed = await this.repo.update(
      { id: job.id, status: JobStatus.IN_PROGRESS },
      {
        status: JobStatus.FAILED,
        retryCount: job.retryCount + 1,
      },
    );

    if (!failed.affected) {
      this.logger.warn(
        `Job ${job.id} left IN_PROGRESS before its failure was applied; keeping its current status`,
      );
    }

    // Deduplicate error logs - only create new log if message differs from last error
    const lastErrorLog = await this.jobErrorLogRepo.findOne({
      where: { jobId: job.id },
      order: { createdAt: 'DESC' },
    });

    if (!lastErrorLog || lastErrorLog.logMessage !== error.message) {
      await this.jobErrorLogRepo.save({
        job,
        logMessage: error.message,
        payload: JSON.stringify(dto.data),
      });
    }
  }

  /**
   * Find job for update
   * @param workerId
   * @param jobId
   * @returns
   */
  public async findJobForUpdate(workerId: string, jobId: string) {
    return this.repo.findOne({
      where: {
        workerId,
        id: jobId,
        status: JobStatus.IN_PROGRESS,
      },
      // Runs once per result: the run row is enough (`id` for the engine,
      // `projectId` for provenance). Its workflow, content included, is not.
      relations: {
        asset: {
          target: true,
        },
        jobHistory: true,
        tool: true,
        assetService: true,
      },
    });
  }

  /**
   * Verifies that a job exists and belongs to the specified workspace
   * @param jobId the ID of the job to verify
   * @param workspaceId the ID of the workspace to check against
   * @returns the job if it exists and belongs to the workspace
   * @throws NotFoundException if job not found in workspace
   */
  private async verifyJobBelongsToWorkspace(
    jobId: string,
    workspaceId: string,
  ): Promise<Job> {
    try {
      const job = await this.repo
        .createQueryBuilder('job')
        .innerJoin('job.asset', 'asset')
        .innerJoin('asset.target', 'target')
        .innerJoin('target.workspace', 'workspace')
        .where('job.id = :jobId', { jobId })
        .andWhere('workspace.id = :workspaceId', { workspaceId })
        .getOne();

      if (!job) {
        throw new NotFoundError('Job not found in workspace');
      }

      return job;
    } catch (error) {
      // If it's already a NotFoundException, re-throw it
      if (isNotFound(error)) {
        throw error;
      }
      // For other errors (like database errors), re-throw them as-is
      throw error;
    }
  }

  public async reRunJob(
    workspaceId: string,
    jobId: string,
  ): Promise<{ message: string }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // Verify job exists and belongs to workspace
      const job = await this.verifyJobBelongsToWorkspace(jobId, workspaceId);

      // Update job status, clear workerId, and increment retryCount
      job.status = JobStatus.PENDING;
      job.workerId = undefined;
      job.retryCount = job.retryCount + 1;

      await queryRunner.manager.save(job);

      await queryRunner.commitTransaction();
      this.notifyJobsAvailable(workspaceId);

      return { message: 'Job re-run successfully' };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Nudge workers that can claim in this workspace to pull now instead of
   * waiting out their idle poll. Fire-and-forget: the jobs are already saved,
   * and a lost hint only delays pickup by one poll interval. Public for
   * callers that commit jobs on their own transaction (`createNewJob` with a
   * manager): they call it once the jobs are committed.
   */
  public notifyJobsAvailable(workspaceId: string | undefined): void {
    if (!workspaceId) return;
    this.workerStreamRegistry
      .publishJobsAvailable(workspaceId)
      .catch((error: unknown) =>
        this.logger.warn(
          `Failed to publish jobs-available for workspace ${workspaceId}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        ),
      );
  }

  public async cancelJob(
    workspaceId: string,
    jobId: string,
  ): Promise<DefaultMessageResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // Verify job exists and belongs to workspace
      const job = await this.verifyJobBelongsToWorkspace(jobId, workspaceId);

      // Update job status to cancelled.
      // Capture the execution owner BEFORE the overwrite: a job that was
      // in_progress is being executed right now, and this id is the only way to
      // reach the worker holding that execution.
      const workerId = job.workerId;
      const wasRunning = job.status === JobStatus.IN_PROGRESS;
      job.status = JobStatus.CANCELLED;

      await queryRunner.manager.save(job);

      await queryRunner.commitTransaction();

      // Flipping the DB status alone stops nothing: the connector container
      // keeps running until its own timeout. Ask the owning worker to stop via
      // its bidirectional stream. Publication is best-effort — the cancel itself
      // already succeeded, and an unreachable stream only means the scan stops on
      // its timeout instead.
      if (wasRunning && workerId) {
        try {
          await this.workerStreamRegistry.publishCancel({
            workerId,
            jobId,
            reason: 'cancelled by user',
          });
        } catch (error) {
          this.logger.warn(
            `Failed to publish cancel for job ${jobId} to worker ${workerId}: ${
              error instanceof Error ? error.message : 'unknown error'
            }`,
          );
        }
      }

      return { message: 'Job cancelled successfully' };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Cancels a whole run: every job of the history becomes CANCELLED, so the run
   * and the tools it spans all report the same thing the user just did. The run
   * status itself is derived from its jobs (see getManyJobHistories).
   */
  public async cancelJobHistory(
    workspaceId: string,
    jobHistoryId: string,
  ): Promise<DefaultMessageResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // Histories created outside a workflow have no workspace relation, so the
      // tenant check falls back to the targets of their jobs. A missing history
      // simply fails this check.
      const belongsToWorkspace = await queryRunner.manager
        .createQueryBuilder(JobHistory, 'jobHistory')
        .leftJoin('jobHistory.workflow', 'workflow')
        .leftJoin('workflow.workspace', 'workflowWorkspace')
        .leftJoin('jobHistory.jobs', 'job')
        .leftJoin('job.asset', 'asset')
        .leftJoin('asset.target', 'target')
        .where('jobHistory.id = :jobHistoryId', { jobHistoryId })
        .andWhere(
          '(workflowWorkspace.id = :workspaceId OR target.workspaceId = :workspaceId)',
          { workspaceId },
        )
        .getExists();

      if (!belongsToWorkspace) {
        throw new NotFoundError('Job history not found in workspace');
      }

      // Capture which jobs are executing right now BEFORE the bulk update: only
      // those need a stop signal, and their worker id disappears once the status
      // is flipped.
      const running = await queryRunner.manager
        .createQueryBuilder(Job, 'job')
        .select('job.id', 'jobId')
        .addSelect('job.workerId', 'workerId')
        .where('job."jobHistoryId" = :jobHistoryId', { jobHistoryId })
        .andWhere('job.status = :status', { status: JobStatus.IN_PROGRESS })
        .andWhere('job.workerId IS NOT NULL')
        .getRawMany<{ jobId: string; workerId: string }>();

      // Every job of the run reports cancelled, matching what the user did —
      // a run is cancelled as a whole, so leaving some jobs "completed" made
      // the tool and group statuses disagree with the run. completedAt is kept
      // for jobs that had already finished, so their duration stays real.
      const result = await queryRunner.manager
        .createQueryBuilder()
        .update(Job)
        .set({
          status: JobStatus.CANCELLED,
          completedAt: () => 'COALESCE("completedAt", now())',
        })
        .where('"jobHistoryId" = :jobHistoryId', { jobHistoryId })
        .execute();

      // Close the run out. `isCompleted` is the engine's hard stop: without it a
      // straggler job result could dispatch another step of a run the user just
      // cancelled. Steps that never ran get an explicit reason so the run detail
      // view does not show them as still pending.
      const history = await queryRunner.manager.findOne(JobHistory, {
        where: { id: jobHistoryId },
      });
      if (history) {
        let steps = history.steps ?? {};
        for (const [stepName, stepState] of Object.entries(steps)) {
          if (
            stepState.status === 'pending' ||
            stepState.status === 'dispatched'
          ) {
            steps = withStepSkipped(steps, stepName, 'run-cancelled');
          }
        }
        await queryRunner.manager.update(
          JobHistory,
          { id: jobHistoryId },
          { steps, isCompleted: true },
        );
      }

      await queryRunner.commitTransaction();

      // Stop whatever is still executing. One event per job, all published after
      // the commit so a worker never tears down work the database still records
      // as running. Best-effort per job — a dead stream falls back to timeout.
      for (const { jobId, workerId } of running ?? []) {
        try {
          await this.workerStreamRegistry.publishCancel({
            workerId,
            jobId,
            reason: 'run cancelled by user',
          });
        } catch (error) {
          this.logger.warn(
            `Failed to publish cancel for job ${jobId} to worker ${workerId}: ${
              error instanceof Error ? error.message : 'unknown error'
            }`,
          );
        }
      }

      return {
        message: `Cancelled run: ${result.affected ?? 0} job(s) stopped`,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  public async deleteJob(
    workspaceId: string,
    jobId: string,
  ): Promise<DefaultMessageResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // Verify job exists and belongs to workspace
      const job = await this.verifyJobBelongsToWorkspace(jobId, workspaceId);

      // Delete the job
      await queryRunner.manager.remove(job);

      await queryRunner.commitTransaction();

      return { message: 'Job deleted successfully' };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
