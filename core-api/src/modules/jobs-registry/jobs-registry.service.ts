import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DefaultMessageResponseDto } from 'src/common/dtos/default-message-response.dto';
import {
  GetManyBaseQueryParams,
  GetManyBaseResponseDto,
} from 'src/common/dtos/get-many-base.dto';
import { JobStatus, ToolCategory, WorkerType } from 'src/common/enums/enum';
import { JobDataResultType } from 'src/common/types/app.types';
import { getManyResponse } from 'src/utils/getManyResponse';
import { DataSource, DeepPartial, In, Repository } from 'typeorm';
import { Asset } from '../assets/entities/assets.entity';
import { DataAdapterService } from '../data-adapter/data-adapter.service';
import { builtInTools } from '../tools/built-in-tools';
import { Tool } from '../tools/entities/tools.entity';
import { ToolsService } from '../tools/tools.service';
import { WorkerInstance } from '../workers/entities/worker.entity';
import { Workflow } from '../workflows/entities/workflow.entity';
import {
  CreateJobsDto,
  GetManyJobsQueryParams,
  GetNextJobResponseDto,
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
  ) {}
  public async getManyJobs(
    query: GetManyBaseQueryParams,
  ): Promise<GetManyBaseResponseDto<Job>> {
    const { limit, page, sortOrder } = query;
    let { sortBy } = query;

    if (!(sortBy in Job)) {
      sortBy = 'createdAt';
    }
    const [data, total] = await this.repo.findAndCount({
      take: query.limit,
      skip: (page - 1) * limit,
      order: {
        [sortBy]: sortOrder,
      },
    });

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
  public async createJobs({
    tools,
    targetIds,
    workspaceId,
    assetIds,
    workflow,
  }: {
    tools: Tool[];
    targetIds: string[];
    assetIds?: string[];
    workspaceId?: string;
    workflow?: Workflow;
  }): Promise<Job[]> {
    // Step 1: create job history
    const jobHistory = this.jobHistoryRepo.create({
      workflow,
    });
    await this.jobHistoryRepo.save(jobHistory);

    // Step 2: find assets of the given targets
    const assetsQueryBuilder = this.dataSource
      .getRepository(Asset)
      .createQueryBuilder('assets');

    if (targetIds.length > 0) {
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
    for (const tool of tools) {
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
          jobHistory,
        } as DeepPartial<Job>);

        jobsToInsert.push(job);
      }
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
          })
          .andWhere('workspaces.id = :workspaceId', {
            workspaceId: worker.workspace.id,
          });
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

      let command = '';

      if (isBuiltInTools) {
        const workerStep = builtInTools.find(
          (tool) => tool.category === job.category,
        );
        if (!workerStep) {
          await queryRunner.rollbackTransaction();
          return null;
        } else {
          command = workerStep?.command || '';
        }
      }

      await queryRunner.commitTransaction();

      return {
        jobId: job.id,
        value: job.asset.value,
        job,
        category: job.category,
        command,
      };
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
    await this.createJobs({ tools, targetIds: [dto.targetId] });
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
    } else {
      dataForSync = data.payload;
    }

    await this.dataAdapterService.syncData({
      data: dataForSync,
      job,
    });

    const hasError = data?.error;
    const newStatus = hasError ? JobStatus.FAILED : JobStatus.COMPLETED;
    await this.updateJobStatus(job.id, newStatus);

    if (newStatus === JobStatus.COMPLETED) {
      await this.getNextStepForJob(job);
    }

    return { workerId, dto };
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
      await this.createJobs({
        tools,
        targetIds: [job.asset.target.id],
        workflow: job.jobHistory.workflow,
      });
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

  /**
   * Updates the status of a job.
   * @param jobId the ID of the job to update
   * @param status the new status of the job
   */
  private async updateJobStatus(
    jobId: string,
    status: JobStatus,
  ): Promise<void> {
    await this.repo.update(jobId, { status, completedAt: new Date() });
  }
}
