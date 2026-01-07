import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import {
  GetManyBaseQueryParams,
  GetManyBaseResponseDto,
} from '@/common/dtos/get-many-base.dto';
import {
  BullMQName,
  JobPriority,
  JobStatus,
  ToolCategory,
  WorkerScope,
  WorkerType,
} from '@/common/enums/enum';
import { RedisService } from '@/services/redis/redis.service';
import bindingCommand from '@/utils/bindingCommand';
import { getManyResponse } from '@/utils/getManyResponse';
import { InjectQueue } from '@nestjs/bullmq';
import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { DataSource, DeepPartial, In, Repository } from 'typeorm';
import { AssetService } from '../assets/entities/asset-services.entity';
import { Asset } from '../assets/entities/assets.entity';
import { StorageService } from '../storage/storage.service';
import { Tool } from '../tools/entities/tools.entity';
import { builtInTools } from '../tools/tools-privider/built-in-tools';
import { ToolsService } from '../tools/tools.service';
import { WorkerInstance } from '../workers/entities/worker.entity';
import { GetManyJobsRequestDto } from './dto/get-many-jobs-dto';
import { JobHistoryDetailResponseDto } from './dto/job-history-detail.dto';
import { JobHistoryResponseDto } from './dto/job-history.dto';
import {
  CreateJobs,
  CreateJobsDto,
  GetManyJobsQueryParams,
  GetNextJobResponseDto,
  JobTimelineItem,
  JobTimelineQueryResult,
  JobTimelineResponseDto,
  UpdateResultDto,
} from './dto/jobs-registry.dto';
import { JobErrorLog } from './entities/job-error-log.entity';
import { JobHistory } from './entities/job-history.entity';
import { Job } from './entities/job.entity';

@Injectable()
export class JobsRegistryService {
  constructor(
    @InjectRepository(Job) public readonly repo: Repository<Job>,
    @InjectRepository(JobHistory)
    public readonly jobHistoryRepo: Repository<JobHistory>,
    @InjectRepository(JobErrorLog)
    public readonly jobErrorLogRepo: Repository<JobErrorLog>,
    private dataSource: DataSource,
    @Optional() private toolsService: ToolsService,
    private storageService: StorageService,
    private redis: RedisService,
    @InjectQueue(BullMQName.JOB_RESULT) private jobResultQueue: Queue,
  ) {}
  public async getManyJobs(
    query: GetManyJobsRequestDto,
  ): Promise<GetManyBaseResponseDto<Job>> {
    const { limit, page, sortOrder, jobHistoryId } = query;
    let { sortBy } = query;

    if (!(sortBy in Job)) {
      sortBy = 'createdAt';
    }

    const qb = this.repo
      .createQueryBuilder('job')
      .leftJoinAndSelect('job.tool', 'tool')
      .leftJoinAndSelect('job.asset', 'asset')
      .leftJoinAndSelect('asset.target', 'target')
      .leftJoinAndSelect('job.assetService', 'assetService')
      .leftJoinAndSelect('job.errorLogs', 'errorLogs')
      .where('job.jobHistoryId = :jobHistoryId', { jobHistoryId })
      .take(query.limit)
      .skip((page - 1) * limit)
      .orderBy(`job.${sortBy}`, sortOrder);

    const [data, total] = await qb.getManyAndCount();

    return getManyResponse<Job>({ query, data, total });
  }

  /**
   * Creates jobs for given tools and targets, linked to a jobHistory.
   * @param tools list of tools to run
   * @param targets list of targets to scan
   * @param workflow optional workflow to link
   */
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
    workflow,
    jobHistory: existingJobHistory,
    priority,
    isSaveRawResult,
    isPublishEvent,
  }: CreateJobs): Promise<Job[]> {
    if (!tool) {
      throw new Error('Tool is required for creating a job');
    }

    if (!tool.category) {
      throw new Error('Tool category is required for creating a job');
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
      });
      await this.jobHistoryRepo.save(jobHistory);
    }

    const jobRepo = this.dataSource.getRepository(Job);
    const jobsToInsert: Job[] = [];

    // Step 2: find appropriate data source based on tool category
    if (tool.category === ToolCategory.HTTP_PROBE) {
      // For HTTP_PROBE, use asset services
      const assetServices = await this.findAssetServicesForJob(
        targetIds,
        assetIds,
        workspaceId,
      );

      // Step 3: iterate tools and create jobs
      const defaultCommand = builtInTools.find(
        (t) => t.name === tool.name,
      )?.command;

      // Create jobs for each asset service
      for (const assetService of assetServices) {
        const job = jobRepo.create({
          id: randomUUID(),
          asset: assetService.asset, // Use the associated asset from asset service
          assetService, // Store the asset service reference
          jobName: tool.name,
          status: JobStatus.PENDING,
          category: tool.category,
          tool,
          priority: priority ?? 4,
          jobHistory,
          command: bindingCommand(defaultCommand ?? '', {
            // Use the default command template for HTTP_PROBE
            value: assetService.value,
            port: assetService.port.toString(),
          }),
          isSaveRawResult: isSaveRawResult ?? false,
          isPublishEvent,
        } as DeepPartial<Job>);

        jobsToInsert.push(job);
      }
    } else {
      // Cannot query assets for PORTS_SCANNER with assetIds
      if (tool.category === ToolCategory.PORTS_SCANNER) assetIds = [];

      // For all other categories, use regular assets
      const assets = await this.findAssetsForJob(
        targetIds,
        assetIds,
        workspaceId,
      );

      const filteredAssets = this.filterAssetsByCategory(assets, tool.category);

      // Step 3: iterate tools and create jobs
      const defaultCommand = builtInTools.find(
        (t) => t.name === tool.name,
      )?.command;

      for (const asset of filteredAssets) {
        const job = jobRepo.create({
          id: randomUUID(),
          asset,
          jobName: tool.name,
          status: JobStatus.PENDING,
          category: tool.category,
          tool,
          priority: priority ?? 4,
          jobHistory,
          command: bindingCommand(defaultCommand ?? '', {
            value: asset.value,
          }),
          isSaveRawResult: isSaveRawResult ?? false,
          isPublishEvent,
        } as DeepPartial<Job>);

        jobsToInsert.push(job);
      }
    }

    // Step 4: save all jobs
    if (jobsToInsert.length > 0) {
      await jobRepo.save(jobsToInsert);

      // Increment pending jobs counter (hybrid Redis + DB)
      await this.incrementJobHistoryCounter(jobHistory.id, jobsToInsert.length);
    }

    return jobsToInsert;
  }

  /**
   * Finds assets for job creation based on targetIds, assetIds, and workspaceId
   * @param targetIds list of target IDs to filter assets
   * @param assetIds list of asset IDs to filter assets
   * @param workspaceId workspace ID to filter assets
   * @returns Promise<Array<Asset>> list of filtered assets
   */
  private async findAssetsForJob(
    targetIds?: string[],
    assetIds?: string[],
    workspaceId?: string,
  ): Promise<Asset[]> {
    const assetsQueryBuilder = this.dataSource
      .getRepository(Asset)
      .createQueryBuilder('assets')
      .where('assets.isEnabled = true');

    if (targetIds && targetIds.length > 0) {
      assetsQueryBuilder.andWhere('assets.targetId IN (:...targetIds)', {
        targetIds,
      });
    }

    if (assetIds && assetIds.length > 0) {
      assetsQueryBuilder.andWhere('assets.id IN (:...assetIds)', {
        assetIds,
      });
    }

    if (workspaceId) {
      assetsQueryBuilder
        .innerJoin('assets.target', 'target')
        .innerJoin('target.workspaceTargets', 'workspaceTarget')
        .innerJoin('workspaceTarget.workspace', 'workspace')
        .andWhere('workspace.id = :workspaceId', { workspaceId });
    }

    return await assetsQueryBuilder.getMany();
  }

  /**
   * Finds asset services for HTTP_PROBE job creation based on targetIds, assetIds, and workspaceId
   * @param targetIds list of target IDs to filter asset services
   * @param assetIds list of asset IDs to filter asset services
   * @param workspaceId workspace ID to filter asset services
   * @returns Promise<Array<AssetService>> list of filtered asset services
   */
  private async findAssetServicesForJob(
    targetIds?: string[],
    assetIds?: string[],
    workspaceId?: string,
  ): Promise<AssetService[]> {
    const assetServicesQueryBuilder = this.dataSource
      .getRepository(AssetService)
      .createQueryBuilder('assetServices')
      .innerJoinAndSelect('assetServices.asset', 'asset')
      .where('asset.isEnabled = true');

    if (targetIds && targetIds.length > 0) {
      assetServicesQueryBuilder.andWhere('asset.targetId IN (:...targetIds)', {
        targetIds,
      });
    }

    if (assetIds && assetIds.length > 0) {
      assetServicesQueryBuilder.andWhere(
        'assetServices.assetId IN (:...assetIds)',
        {
          assetIds,
        },
      );
    }

    if (workspaceId) {
      assetServicesQueryBuilder
        .innerJoin('asset.target', 'target')
        .innerJoin('target.workspaceTargets', 'workspaceTarget')
        .innerJoin('workspaceTarget.workspace', 'workspace')
        .andWhere('workspace.id = :workspaceId', { workspaceId });
    }

    return await assetServicesQueryBuilder.getMany();
  }

  /**
   * Filters assets based on tool category
   * @param assets list of assets to filter
   * @param toolCategory the category of the tool
   * @returns filtered list of assets
   */
  private filterAssetsByCategory(
    assets: Asset[],
    toolCategory: ToolCategory,
  ): Asset[] {
    if (toolCategory === ToolCategory.SUBDOMAINS) {
      return assets.filter((asset) => asset.isPrimary);
    }
    return assets;
  }

  /**
   * Retrieves the next job associated with the given worker that has not yet
   * been started. If a job is found, it is updated with the worker's ID and
   * saved to the database. If no job is found, this function returns `null`.
   * @param workerId the ID of the worker to retrieve a job for
   * @returns the next job associated with the worker, or `null` if none is found
   */
  public async getNextJob(
    workerId: string,
  ): Promise<GetNextJobResponseDto | null> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const worker = await queryRunner.manager
        .getRepository(WorkerInstance)
        .findOne({
          where: {
            id: workerId,
          },
          relations: ['workspace', 'tool'],
        });
      if (!worker) {
        throw new NotFoundException('Worker not found');
      }

      const isBuiltInTools = worker.type === WorkerType.BUILT_IN;
      const queryBuilder = queryRunner.manager
        .createQueryBuilder(Job, 'jobs')
        .innerJoinAndSelect('jobs.asset', 'asset')
        .innerJoin('asset.target', 'target')
        .leftJoin('target.workspaceTargets', 'workspace_targets')
        .leftJoin('workspace_targets.workspace', 'workspaces')
        .leftJoin('jobs.tool', 'tool')
        .where('jobs.status = :status', { status: JobStatus.PENDING })
        .orderBy('jobs.priority', 'DESC')
        .orderBy('jobs.createdAt', 'ASC');

      if (isBuiltInTools) {
        const builtInToolsName = builtInTools.map((tool) => tool.name);
        queryBuilder.andWhere('tool.name IN (:...names)', {
          names: builtInToolsName,
        });

        if (worker.scope !== WorkerScope.CLOUD) {
          queryBuilder.andWhere('workspaces.id = :workspaceId', {
            workspaceId: worker.workspace.id,
          });
        }
      } else {
        queryBuilder.andWhere('tool.id = :toolId', { toolId: worker.tool.id });
      }

      // Only join assetService for HTTP_PROBE category jobs
      if (worker.tool?.category === ToolCategory.HTTP_PROBE) {
        queryBuilder
          .leftJoinAndSelect('jobs.assetService', 'assetService')
          .andWhere('jobs.category = :category', {
            category: ToolCategory.HTTP_PROBE,
          });
      } else {
        queryBuilder.leftJoinAndSelect('jobs.assetService', 'assetService');
      }

      const job = await queryBuilder
        .setLock('pessimistic_write', undefined, ['jobs'])
        .limit(1)
        .getOne();

      if (!job) {
        await queryRunner.rollbackTransaction();
        return null;
      }

      job.workerId = workerId;
      job.status = JobStatus.IN_PROGRESS;
      job.pickJobAt = new Date();
      await queryRunner.manager.save(job);

      if (isBuiltInTools) {
        if (!job.command) {
          await queryRunner.rollbackTransaction();
          return null;
        }
      }

      await queryRunner.commitTransaction();

      const response: GetNextJobResponseDto = {
        id: job.id,
        category: job.category,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        priority: job.priority,
        command: job.command,
        asset: job.asset.value,
      };

      return response;
    } catch (error) {
      Logger.error(
        'Error in getNextJob',
        error instanceof Error ? error : new Error(String(error)),
      );
      await queryRunner.rollbackTransaction();
      return null;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Retrieves a paginated list of jobs associated with a specified asset ID.
   *
   * @param id - The ID of the asset for which to retrieve jobs.
   * @param query - The query parameters to filter and paginate the jobs, including page, limit, sort order, job status, and worker name.
   * @returns A promise that resolves to a paginated response containing the jobs and total count.
   */
  public async getJobsByAssetId(
    assetId: string,
    query: GetManyJobsQueryParams,
  ): Promise<GetManyBaseResponseDto<Job>> {
    const { page, limit, sortOrder, jobStatus, workerName } = query;
    let { sortBy } = query;
    if (!sortBy) {
      sortBy = 'createdAt';
    }

    const qb = this.repo
      .createQueryBuilder('job')
      .leftJoin('job.asset', 'asset')
      .where('asset.id = :assetId', { assetId });

    if (jobStatus && jobStatus !== 'all') {
      qb.andWhere('job.status = :jobStatus', { jobStatus });
    }
    if (workerName && workerName !== 'all') {
      qb.andWhere('job.workerName = :workerName', { workerName });
    }
    qb.orderBy(`job.${sortBy}`, sortOrder as 'ASC' | 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [data, total] = await qb.getManyAndCount();
    return getManyResponse({ query, data, total });
  }
  /**
   * Retrieves a paginated list of jobs associated with a specified target ID.
   *
   * @param id - The ID of the target for which to retrieve jobs.
   * @param query - The query parameters to filter and paginate the jobs,
   *                including page, limit, sortOrder, jobStatus, workerName, and sortBy.
   * @returns A promise that resolves to a paginated list of jobs, including total count and pagination information.
   */
  public async getJobsByTargetId(
    targetId: string,
    query: GetManyJobsQueryParams,
  ): Promise<GetManyBaseResponseDto<Job>> {
    const { page, limit, sortOrder, jobStatus, workerName } = query;
    let { sortBy } = query;
    if (!sortBy) {
      sortBy = 'createdAt';
    }

    const qb = this.repo
      .createQueryBuilder('job')
      .leftJoin('job.asset', 'asset')
      .leftJoin('asset.target', 'target')
      .where('target.id = :targetId', { targetId });

    if (jobStatus && jobStatus !== 'all') {
      qb.andWhere('job.status = :jobStatus', { jobStatus });
    }
    if (workerName && workerName !== 'all') {
      qb.andWhere('job.workerName = :workerName', { workerName });
    }

    qb.orderBy(`job.${sortBy}`, sortOrder as 'ASC' | 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return getManyResponse({ query, data, total });
  }

  /**
   * Creates jobs for a target.
   * @param dto the data transfer object containing the target ID and tool IDs
   * @param workspaceId the workspace ID
   * @returns an object with a success message
   */
  public async createJobsForTarget(
    dto: CreateJobsDto,
    workspaceId: string,
  ): Promise<DefaultMessageResponseDto> {
    const tools = await this.toolsService.toolsRepository.find({
      where: { id: In(dto.toolIds) },
    });

    await Promise.all(
      tools.map((tool) =>
        this.createNewJob({ tool, targetIds: [dto.targetId], workspaceId }),
      ),
    );

    return {
      message: 'Jobs created successfully',
    };
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
    const { path: resultRef } = this.storageService.uploadFile(
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

  public async handleJobError(dto: UpdateResultDto, job: Job, error: Error) {
    await this.repo.save({
      ...job,
      status: JobStatus.FAILED,
      error: error.message,
      retryCount: job.retryCount + 1,
    });
    await this.jobErrorLogRepo.save({
      job,
      logMessage: error.message,
      payload: JSON.stringify(dto.data),
    });
  }

  /**
   * Retrieves a timeline of jobs grouped by tool name and target
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
          tools.category as tool_category,
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
             and lag(targets.value) over (partition by jobs."jobHistoryId" order by jobs."createdAt" desc) = targets.value
            then 0 else 1
          end as is_new_group
        from jobs
        join assets on jobs."assetId" = assets.id
        join tools on jobs."toolId" = tools.id
        join targets on assets."targetId" = targets.id
        join "workspace_targets" on targets."id" = "workspace_targets"."targetId"
        where "workspace_targets"."workspaceId" = $1
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
        max(tool_category) as tool_category,
        EXTRACT(EPOCH FROM (max(COALESCE("completedAt", "updatedAt")) - min("createdAt"))) as duration_seconds
      from grouped_with_id
      group by grp_id, name, target, target_id, "jobHistoryId"
      order by "jobHistoryId", min("createdAt") desc
      limit 15;
    `,
      [workspaceId],
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

  /**
   * Updates the result of a job with the given worker ID.
   * @param job
   */
  public async getNextStepForJob(job: Job) {
    const workflow = job.jobHistory.workflow;
    if (!workflow) return;

    const currentTool = job.tool.name;
    const { jobs } = workflow.content;

    const curretJobMetadata = jobs.find((j) => j.run === currentTool);
    if (!curretJobMetadata) return null;

    const indexCurrentTool = workflow?.content.jobs.findIndex(
      (j) => j.name === curretJobMetadata.name,
    );
    const nextTool = workflow?.content.jobs[indexCurrentTool + 1]?.run;
    if (nextTool) {
      const tools = await this.toolsService.getToolByNames({
        names: [nextTool],
      });
      await Promise.all(
        tools.map((tool) =>
          this.createNewJob({
            tool,
            targetIds: [job.asset.target.id],
            assetIds: [job.asset.id],
            workflow: job.jobHistory.workflow,
            jobHistory: job.jobHistory,
            priority: tool.priority,
            workspaceId: workflow.workspace.id,
          }),
        ),
      );
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
      relations: {
        asset: {
          target: true,
        },
        jobHistory: {
          workflow: {
            workspace: true,
          },
        },
        tool: true,
        assetService: true,
      },
    });
  }

  public async getManyJobHistories(
    workspaceId: string,
    query: GetManyBaseQueryParams,
  ): Promise<GetManyBaseResponseDto<JobHistoryResponseDto>> {
    const { limit, page, sortOrder } = query;
    let { sortBy } = query;

    if (!(sortBy in JobHistory)) {
      sortBy = 'createdAt';
    }

    // Define interface for raw query result
    interface RawJobHistoryResult {
      id: string;
      createdAt: Date;
      updatedAt: Date;
      totalJobs: string; // COUNT returns string in some databases
      status: JobStatus;
      workflowName: string;
    }

    // Query job histories with calculated counts and statuses using subqueries
    const qb = this.jobHistoryRepo
      .createQueryBuilder('jobHistory')
      .innerJoin('jobHistory.jobs', 'job')
      .innerJoin('job.asset', 'jAsset')
      .innerJoin('jAsset.target', 'jTarget')
      .innerJoin('jTarget.workspaceTargets', 'workspaceTarget')
      .innerJoin('workspaceTarget.workspace', 'workspace')
      .leftJoin('jobHistory.workflow', 'workflow')
      .where('workspace.id = :workspaceId', { workspaceId })
      .select([
        '"jobHistory".id as "id"',
        '"jobHistory"."createdAt" as "createdAt"',
        '"jobHistory"."updatedAt" as "updatedAt"',
        '"workflow"."name" as "workflowName"',
        // Subquery to count total jobs for this job history
        '(SELECT COUNT(*) FROM jobs WHERE "jobHistoryId" = "jobHistory".id) as "totalJobs"',
        // Subquery with CASE to calculate status based on job statuses
        `(
          SELECT 
            CASE 
              WHEN COUNT(*) FILTER (WHERE status = '${JobStatus.FAILED}') > 0 THEN '${JobStatus.FAILED}'
              WHEN COUNT(*) FILTER (WHERE status = '${JobStatus.IN_PROGRESS}') > 0 THEN '${JobStatus.IN_PROGRESS}'
              WHEN COUNT(*) FILTER (WHERE status = '${JobStatus.COMPLETED}') = COUNT(*) AND COUNT(*) > 0 THEN '${JobStatus.COMPLETED}'
              ELSE '${JobStatus.PENDING}'
            END
          FROM jobs 
          WHERE "jobHistoryId" = "jobHistory".id
        ) as "status"`,
      ])
      .groupBy('jobHistory.id')
      .addGroupBy('workflow.name')
      .orderBy(`jobHistory.${sortBy}`, sortOrder)
      .offset((page - 1) * limit)
      .limit(limit);

    const rawResults = await qb.getRawMany<RawJobHistoryResult>();
    const total = await this.jobHistoryRepo
      .createQueryBuilder('jobHistory')
      .innerJoin('jobHistory.jobs', 'job')
      .innerJoin('job.asset', 'jAsset')
      .innerJoin('jAsset.target', 'jTarget')
      .innerJoin('jTarget.workspaceTargets', 'workspaceTarget')
      .innerJoin('workspaceTarget.workspace', 'workspace')
      .where('workspace.id = :workspaceId', { workspaceId })
      .getCount();

    // Transform raw results to match the response DTO structure
    const transformedData = rawResults.map((raw) => ({
      id: raw.id,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      totalJobs: parseInt(raw.totalJobs),
      status: raw.status,
      workflowName: raw.workflowName || 'Manual',
    }));

    return getManyResponse({ query, data: transformedData, total });
  }

  public async getJobHistoryDetail(
    workspaceId: string,
    id: string,
  ): Promise<JobHistoryDetailResponseDto> {
    const jobHistory = await this.jobHistoryRepo.findOne({
      where: {
        id,
      },
      relations: {
        workflow: true,
        jobs: {
          tool: true,
          asset: {
            target: true,
          },
          assetService: true,
          errorLogs: true,
        },
      },
    });

    if (!jobHistory) {
      throw new NotFoundException('Job history not found');
    }

    // Verify that the job history belongs to the workspace
    const belongsToWorkspace = await this.jobHistoryRepo
      .createQueryBuilder('jobHistory')
      .innerJoin('jobHistory.jobs', 'job')
      .innerJoin('job.asset', 'jAsset')
      .innerJoin('jAsset.target', 'jTarget')
      .innerJoin('jTarget.workspaceTargets', 'workspaceTarget')
      .innerJoin('workspaceTarget.workspace', 'workspace')
      .where('jobHistory.id = :id', { id })
      .andWhere('workspace.id = :workspaceId', { workspaceId })
      .getExists();

    if (!belongsToWorkspace) {
      throw new NotFoundException('Job history not found in workspace');
    }

    let tools: Tool[] | undefined = [];
    const instaledTools = await this.toolsService.getInstalledTools(
      {},
      workspaceId,
    );
    // Map jobs to tools
    tools = jobHistory.workflow?.content.jobs
      .map((job) => {
        const tool = instaledTools.data.find((tool) => tool.name === job.run);
        return tool;
      })
      .filter((tool) => tool !== undefined);

    const { id: historyId, createdAt, updatedAt, jobs, workflow } = jobHistory;

    return {
      id: historyId,
      workflowName: workflow.name,
      createdAt,
      updatedAt,
      tools,
      jobs: jobs || [],
    };
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
        .innerJoin('target.workspaceTargets', 'workspaceTarget')
        .innerJoin('workspaceTarget.workspace', 'workspace')
        .where('job.id = :jobId', { jobId })
        .andWhere('workspace.id = :workspaceId', { workspaceId })
        .getOne();

      if (!job) {
        throw new NotFoundException('Job not found in workspace');
      }

      return job;
    } catch (error) {
      // If it's already a NotFoundException, re-throw it
      if (error instanceof NotFoundException) {
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

      return { message: 'Job re-run successfully' };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
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

      // Update job status to cancelled
      job.status = JobStatus.CANCELLED;

      await queryRunner.manager.save(job);

      await queryRunner.commitTransaction();

      return { message: 'Job cancelled successfully' };
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

  /**
   * Helper to get Redis pending jobs counter key
   */
  private getRedisPendingKey(jobHistoryId: string): string {
    return `jh:${jobHistoryId}:pending`;
  }

  /**
   * Increment pending jobs counter for a job history (hybrid Redis + DB)
   * Redis is used for fast atomic operations, DB is backup for durability
   */
  private async incrementJobHistoryCounter(
    jobHistoryId: string,
    count: number = 1,
  ): Promise<void> {
    const redisKey = this.getRedisPendingKey(jobHistoryId);

    // Increment Redis counter for each job (atomic)
    for (let i = 0; i < count; i++) {
      await this.redis.client.incr(redisKey);
    }

    // Increment DB counter async (non-blocking)
    setImmediate(() => {
      void (async () => {
        try {
          await this.jobHistoryRepo.increment(
            { id: jobHistoryId },
            'pendingJobsCount',
            count,
          );
        } catch (error) {
          Logger.error(
            `Failed to increment DB counter for JobHistory ${jobHistoryId}`,
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      })();
    });
  }

  /**
   * Decrement counter and check if JobHistory is completed
   * Uses Redis for performance + DB for durability
   */
  public async decrementAndCheckCompletion(
    jobHistoryId: string,
  ): Promise<void> {
    const logger = new Logger('JobHistoryCompletion');
    const redisKey = this.getRedisPendingKey(jobHistoryId);

    try {
      // 1. Decrement Redis counter (atomic)
      const remaining = await this.redis.client.decr(redisKey);

      // 2. Decrement DB counter async
      setImmediate(() => {
        void (async () => {
          try {
            await this.jobHistoryRepo.decrement(
              { id: jobHistoryId },
              'pendingJobsCount',
              1,
            );
          } catch (error) {
            logger.error(
              `Failed to decrement DB counter for JobHistory ${jobHistoryId}`,
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        })();
      });

      // 3. If counter = 0, check completion
      if (remaining === 0) {
        await this.checkAndTriggerCompletion(jobHistoryId);
      } else if (remaining < 0) {
        // Counter error, rebuild from DB
        logger.warn(
          `Redis counter negative for JobHistory ${jobHistoryId}, rebuilding...`,
        );
        const realCount = await this.rebuildCounterFromDB(jobHistoryId);
        // If real count = 0, it means completed but Redis was out of sync
        if (realCount === 0) {
          await this.checkAndTriggerCompletion(jobHistoryId);
        }
      }
    } catch (error) {
      logger.error(
        `Error in decrementAndCheckCompletion for JobHistory ${jobHistoryId}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      // Fallback: check completion from DB
      await this.checkAndTriggerCompletionFromDB(jobHistoryId);
    }
  }

  /**
   * Check and trigger completion event (ensures exactly-once execution)
   */
  private async checkAndTriggerCompletion(jobHistoryId: string): Promise<void> {
    const logger = new Logger('JobHistoryCompletion');

    // Double-check with DB to be sure
    const actualPendingCount = await this.repo.count({
      where: {
        jobHistory: { id: jobHistoryId },
        status: In([JobStatus.PENDING, JobStatus.IN_PROGRESS]),
      },
    });

    if (actualPendingCount > 0) {
      logger.warn(
        `Redis counter = 0 but DB has ${actualPendingCount} pending jobs. Rebuilding counter.`,
      );
      await this.rebuildCounterFromDB(jobHistoryId);
      return;
    }

    // Check for FAILED jobs
    const hasFailedJobs = await this.repo.exists({
      where: {
        jobHistory: { id: jobHistoryId },
        status: JobStatus.FAILED,
      },
    });

    if (hasFailedJobs) {
      logger.log(
        `JobHistory ${jobHistoryId} has failed jobs, not triggering completion`,
      );
      // Cleanup Redis counter even if failed (completed but failed)
      const redisKey = this.getRedisPendingKey(jobHistoryId);
      await this.redis.client.del(redisKey);
      return;
    }

    // Update DB with optimistic locking (only 1 process succeeds)
    const updateResult = await this.jobHistoryRepo.update(
      {
        id: jobHistoryId,
        isCompleted: false,
      },
      {
        isCompleted: true,
        pendingJobsCount: 0,
      },
    );

    // If update success, trigger event
    if (updateResult.affected && updateResult.affected > 0) {
      const jobHistory = await this.jobHistoryRepo.findOne({
        where: { id: jobHistoryId },
        relations: { workflow: true },
      });

      if (jobHistory) {
        await this.triggerJobHistoryCompletedEvent(jobHistory);
      }
    } else {
      // If update failed (maybe completed by another process), double check
      const current = await this.jobHistoryRepo.findOne({
        where: { id: jobHistoryId },
        select: ['isCompleted'],
      });
      if (current?.isCompleted) {
        // Already completed -> ensure key cleanup
        const redisKey = this.getRedisPendingKey(jobHistoryId);
        await this.redis.client.del(redisKey);
      }
    }
  }

  /**
   * Trigger event when JobHistory completed
   * (Simple logger implementation, custom logic can be added later)
   */
  private async triggerJobHistoryCompletedEvent(
    jobHistory: JobHistory,
  ): Promise<void> {
    const logger = new Logger('JobHistoryCompletion');

    logger.log(
      `🎉 JobHistory ${jobHistory.id} completed! ` +
        `Workflow: ${jobHistory.workflow?.name || 'Manual'}`,
    );

    // Cleanup Redis counter
    const redisKey = this.getRedisPendingKey(jobHistory.id);
    await this.redis.client.del(redisKey);

    // TODO: Add custom logic here (webhook, notification, etc.)
  }

  /**
   * Rebuild Redis counter from database (recovery mechanism)
   */
  private async rebuildCounterFromDB(jobHistoryId: string): Promise<number> {
    const logger = new Logger('JobHistoryCompletion');

    const pendingCount = await this.repo.count({
      where: {
        jobHistory: { id: jobHistoryId },
        status: In([JobStatus.PENDING, JobStatus.IN_PROGRESS]),
      },
    });

    const redisKey = this.getRedisPendingKey(jobHistoryId);

    if (pendingCount > 0) {
      await this.redis.client.set(redisKey, pendingCount);
    } else {
      // If count = 0, delete key to avoid "stuck at 0" state
      await this.redis.client.del(redisKey);
    }

    logger.log(
      `Rebuilt Redis counter for JobHistory ${jobHistoryId}: ${pendingCount}`,
    );

    return pendingCount;
  }

  /**
   * Fallback: Check completion from DB when Redis fails
   */
  private async checkAndTriggerCompletionFromDB(
    jobHistoryId: string,
  ): Promise<void> {
    const jobHistory = await this.jobHistoryRepo.findOne({
      where: { id: jobHistoryId },
      relations: { workflow: true },
    });

    if (!jobHistory || jobHistory.isCompleted) {
      // If already completed, ensure key cleanup
      if (jobHistory?.isCompleted) {
        const redisKey = this.getRedisPendingKey(jobHistoryId);
        await this.redis.client.del(redisKey);
      }
      return;
    }

    const pendingCount = await this.repo.count({
      where: {
        jobHistory: { id: jobHistoryId },
        status: In([JobStatus.PENDING, JobStatus.IN_PROGRESS]),
      },
    });

    if (pendingCount === 0) {
      await this.checkAndTriggerCompletion(jobHistoryId);
    } else {
      // If not completed but fallback called, maybe sync redis again?
      // But this is error handler path, safest to rebuild counter
      await this.rebuildCounterFromDB(jobHistoryId);
    }
  }

  /**
   * Validate counters between Redis and DB (optional monitoring)
   * Can be run via cron job
   */
  public async validateCounters(jobHistoryId: string): Promise<boolean> {
    const logger = new Logger('CounterValidation');

    // Get Redis counter
    const redisKey = this.getRedisPendingKey(jobHistoryId);
    const redisCount = parseInt(
      (await this.redis.client.get(redisKey)) || '0',
      10,
    );

    // Get actual count from DB
    const actualCount = await this.repo.count({
      where: {
        jobHistory: { id: jobHistoryId },
        status: In([JobStatus.PENDING, JobStatus.IN_PROGRESS]),
      },
    });

    // Get DB counter
    const jobHistory = await this.jobHistoryRepo.findOne({
      where: { id: jobHistoryId },
      select: ['pendingJobsCount'],
    });

    if (redisCount !== actualCount) {
      logger.warn(
        `Counter mismatch for JobHistory ${jobHistoryId}: ` +
          `Redis=${redisCount}, Actual=${actualCount}, DB=${jobHistory?.pendingJobsCount}`,
      );
      await this.rebuildCounterFromDB(jobHistoryId);
      return false;
    }

    return true;
  }
}
