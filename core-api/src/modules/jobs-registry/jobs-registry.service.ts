import {
  BadGatewayException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import {
  GetManyBaseQueryParams,
  GetManyBaseResponseDto,
} from 'src/common/dtos/get-many-base.dto';
import { JobStatus } from 'src/common/enums/enum';
import { getManyResponse } from 'src/utils/getManyResponse';
import { DataSource, In, Repository } from 'typeorm';
import { Asset } from '../assets/entities/assets.entity';
import { DataAdapterService } from '../data-adapter/data-adapter.service';
import { Target } from '../targets/entities/target.entity';
import { builtInTools } from '../tools/built-in-tools';
import { Tool } from '../tools/entities/tools.entity';
import { ToolsService } from '../tools/tools.service';
import { Workflow } from '../workflows/entities/workflow.entity';
import {
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

    @Inject(forwardRef(() => ToolsService))
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

    return getManyResponse<Job>(query, data, total);
  }

  /**
   * Creates a new job associated with the given asset and worker name.
   * @param asset the asset the job is associated with
   * @param category the name of the worker to run on the asset
   * @returns the newly created job
   */
  public async createJob({
    toolNames,
    target,
    workflow,
  }: {
    toolNames: string[];
    target: Target;
    workflow?: Workflow;
  }): Promise<void> {
    const jobHistory = this.jobHistoryRepo.create({
      workflow,
    });
    await this.jobHistoryRepo.save(jobHistory);
    const assets = await this.dataSource.getRepository(Asset).find({
      where: {
        target: { id: target.id },
      },
    });
    const jobHistoryId = jobHistory.id;
    const toolsForFirstJob = await this.dataSource.getRepository(Tool).find({
      where: {
        name: In(toolNames),
      },
    });

    await Promise.all(
      toolsForFirstJob.map(async (tool) => {
        await this.dataSource.getRepository(Job).save(
          assets.map((asset) => ({
            id: randomUUID(),
            asset,
            jobName: tool.name,
            status: JobStatus.PENDING,
            category: tool.category,
            tool,
            jobHistory: { id: jobHistoryId },
          })),
        );
      }),
    );
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
      const job = await queryRunner.manager
        .createQueryBuilder(Job, 'jobs')
        .innerJoinAndSelect('jobs.asset', 'asset')
        .where('jobs.status = :status', { status: JobStatus.PENDING })
        .orderBy('jobs.createdAt', 'ASC')
        .setLock('pessimistic_write')
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
      const workerStep = builtInTools.find(
        (tool) => tool.category === job.category,
      );

      if (!workerStep) {
        await queryRunner.rollbackTransaction();
        return null;
      }

      await queryRunner.commitTransaction();

      return {
        jobId: job.id,
        value: job.asset.value,
        category: job.category,
        command: workerStep.command,
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
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
    return getManyResponse(query, data, total);
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

    return getManyResponse(query, data, total);
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

    await this.dataAdapterService.syncData({
      data: builtInStep?.parser?.(data.raw) as any,
      job,
    });

    await this.getNextStepForJob(job);

    const hasError = data?.error;
    const newStatus = hasError ? JobStatus.FAILED : JobStatus.COMPLETED;
    await this.updateJobStatus(job.id, newStatus);

    // await this.processStepResult(step, job, dto.data);

    return { workerId, dto };
  }

  private async getNextStepForJob(job: Job) {
    const workflow = job.jobHistory.workflow;
    const currentTool = job.tool.name;
    const nextTool = workflow?.content.jobs[currentTool];
    if (nextTool) {
      await this.createJob({
        toolNames: nextTool,
        target: job.asset.target,
        workflow: job.jobHistory.workflow,
      });
    }
  }

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

  private async updateJobStatus(
    jobId: string,
    status: JobStatus,
  ): Promise<void> {
    await this.repo.update(jobId, { status, completedAt: new Date() });
  }
}
