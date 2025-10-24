import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import {
  GetManyBaseQueryParams,
  GetManyBaseResponseDto,
} from '@/common/dtos/get-many-base.dto';
import { JobPriority, JobStatus, ToolCategory, WorkerScope, WorkerType } from '@/common/enums/enum';
import { JobDataResultType } from '@/common/types/app.types';
import { RedisService } from '@/services/redis/redis.service';
import bindingCommand from '@/utils/bindingCommand';
import { getManyResponse } from '@/utils/getManyResponse';
import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, DeepPartial, In, Repository } from 'typeorm';
import { Asset } from '../assets/entities/assets.entity';
import { DataAdapterService } from '../data-adapter/data-adapter.service';
import { StorageService } from '../storage/storage.service';
import { builtInTools } from '../tools/built-in-tools';
import { ToolsService } from '../tools/tools.service';
import { WorkerInstance } from '../workers/entities/worker.entity';
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
import { JobHistory } from './entities/job-history.entity';
import { Job } from './entities/job.entity';

@Injectable()
export class JobsRegistryService {
  constructor(
    @InjectRepository(Job) public readonly repo: Repository<Job>,
    @InjectRepository(JobHistory)
    public readonly jobHistoryRepo: Repository<JobHistory>,
    private dataSource: DataSource,
    private dataAdapterService: DataAdapterService,
    private toolsService: ToolsService,
    private storageService: StorageService,
    private redis: RedisService
  ) { }
  public async getManyJobs(
    query: GetManyBaseQueryParams,
  ): Promise<GetManyBaseResponseDto<Job>> {
    const { limit, page, sortOrder } = query;
    let { sortBy } = query;

    if (!(sortBy in Job)) {
      sortBy = 'createdAt';
    }

    const qb = this.repo
      .createQueryBuilder('job')
      .leftJoinAndSelect('job.tool', 'tool')
      .leftJoinAndSelect('job.asset', 'asset')
      .leftJoinAndSelect('asset.target', 'target')
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
    isPublishEvent
  }: CreateJobs): Promise<Job[]> {
    if (priority && (priority < JobPriority.CRITICAL || priority > JobPriority.BACKGROUND)) {
      priority = 4;
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

    // Step 2: find assets of the given targets
    const assetsQueryBuilder = this.dataSource
      .getRepository(Asset)
      .createQueryBuilder('assets').where('assets.isEnabled = true');

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
    const assets = await assetsQueryBuilder.getMany();

    const jobRepo = this.dataSource.getRepository(Job);
    const jobsToInsert: Job[] = [];

    // Step 3: iterate tools and create jobs
    const defaultCommand = builtInTools.find(t => t.name === tool.name)?.command;
    let filteredAssets: Asset[];
    if (tool.category === ToolCategory.SUBDOMAINS) {
      filteredAssets = assets.filter((asset) => asset.isPrimary);
    } else if (tool.category === ToolCategory.PORTS_SCANNER) {
      filteredAssets = assets.filter((asset) => asset.isPrimary);
    } else {
      filteredAssets = assets;
    }

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
        command: bindingCommand(defaultCommand!, {
          value: asset.value,
        }),
        isSaveRawResult: isSaveRawResult ?? false,
        isPublishEvent
      } as DeepPartial<Job>);

      jobsToInsert.push(job);
    }

    // Step 4: save all jobs
    if (jobsToInsert.length > 0) {
      await jobRepo.save(jobsToInsert);
    }

    return jobsToInsert;
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
        .orderBy('jobs.createdAt', 'ASC')
        .orderBy('jobs.priority', 'ASC');

      if (isBuiltInTools) {
        const builtInToolsName = builtInTools.map((tool) => tool.name);
        queryBuilder
          .andWhere('tool.name IN (:...names)', {
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
      Logger.error('Error in getNextJob', error);
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
   * @returns an object with a success message
   */
  public async createJobsForTarget(
    dto: CreateJobsDto,
  ): Promise<DefaultMessageResponseDto> {
    const tools = await this.toolsService.toolsRepository.find({
      where: { id: In(dto.toolIds) },
    });

    await Promise.all(tools.map(tool => this.createNewJob({ tool, targetIds: [dto.targetId] })));

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
  ): Promise<{ workerId: string; dto: UpdateResultDto }> {
    const { jobId, data } = dto;
    const job = await this.findJobForUpdate(workerId, jobId);
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const isBuiltInTools = job.tool.type === WorkerType.BUILT_IN;

    let dataForSync: JobDataResultType;
    let pathResult: string | null = null;

    if (isBuiltInTools) {
      const step = builtInTools.find((tool) => tool.name === job.tool.name);

      if (!step) {
        throw new Error(`Worker step not found for worker: ${job.tool.name}`);
      }

      const builtInStep = builtInTools.find(
        (tool) => tool.name === job.tool.name,
      );

      if (!builtInStep) {
        throw new Error(`Worker step not found for worker: ${job.tool.name}`);
      }

      if (!data.raw && !builtInStep) {
        throw new BadGatewayException('Raw data is required');
      }
      dataForSync = builtInStep?.parser?.(data.raw);
      if (job.isSaveRawResult) {
        const uploadResult = this.storageService.uploadFile(`${job.id}.txt`, Buffer.from(data.raw, 'utf-8'), 'jobs-result');
        pathResult = uploadResult.path;
      }
    } else {
      dataForSync = data.payload;
    }

    if (job.isSaveData) {
      await this.dataAdapterService.syncData({
        data: dataForSync,
        job,
      });

    }

    const hasError = data?.error;
    const newStatus = hasError ? JobStatus.FAILED : JobStatus.COMPLETED;

    const jobForPublish = await this.repo.save({
      ...job,
      status: newStatus,
      completedAt: new Date(),
      pathResult: pathResult || undefined,
    });

    if (newStatus === JobStatus.COMPLETED) {
      await this.getNextStepForJob(job);
    }

    if (job.isPublishEvent) {
      await this.redis.publish(`jobs:${job.id}`, JSON.stringify(jobForPublish));
    }

    return { workerId, dto };
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
  private async getNextStepForJob(job: Job) {
    const workflow = job.jobHistory.workflow;
    if (!workflow) return;

    const currentTool = job.tool.name;
    const nextTool = workflow?.content.jobs[currentTool];

    if (nextTool) {
      const tools = await this.toolsService.getToolByNames(nextTool);
      await Promise.all(tools.map(tool => this.createNewJob({
        tool,
        targetIds: [job.asset.target.id],
        workflow: job.jobHistory.workflow,
        jobHistory: job.jobHistory,
      })));
    }
  }

  /**
   * Find job for update
   * @param workerId
   * @param jobId
   * @returns
   */
  private async findJobForUpdate(workerId: string, jobId: string) {
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
          workflow: true,
        },
        tool: true,
      },
    });
  }
}
