import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import {
  GetManyBaseQueryParams,
  GetManyBaseResponseDto,
} from 'src/common/dtos/get-many-base.dto';
import { JobStatus, ToolCategory } from 'src/common/enums/enum';
import { UserContextPayload } from 'src/common/interfaces/app.interface';
import { getManyResponse } from 'src/utils/getManyResponse';
import { DataSource, InsertResult, Repository } from 'typeorm';
import { Asset } from '../assets/entities/assets.entity';
import { WorkersService } from '../workers/workers.service';
import {
  GetManyJobsQueryParams,
  GetNextJobResponseDto,
  UpdateResultDto,
} from './dto/jobs-registry.dto';
import { Job } from './entities/job.entity';

@Injectable()
export class JobsRegistryService {
  constructor(
    @InjectRepository(Job) public readonly repo: Repository<Job>,
    private workerService: WorkersService,
    private dataSource: DataSource,
  ) {}
  public async getManyJobs(
    query: GetManyBaseQueryParams,
    userContextPayload: UserContextPayload,
  ): Promise<GetManyBaseResponseDto<Job>> {
    const { limit, page, sortOrder } = query;
    let { sortBy } = query;
    const { id } = userContextPayload;

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
  public createJob(
    asset: Asset,
    category: ToolCategory,
    group?: string,
  ): Promise<Job> {
    return this.repo.save({
      asset,
      category,
      group: group || randomUUID(),
    });
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
      console.log(job.category);
      const workerStep = this.workerService.getWorkerStepByName(job.category);
      console.log(workerStep);
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
      console.log(err);
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

    const step = this.workerService.getWorkerStepByName(job.category);

    if (!step) {
      throw new Error(`Worker step not found for worker: ${job.category}`);
    }

    const hasError = data?.error;
    const newStatus = hasError ? JobStatus.FAILED : JobStatus.COMPLETED;

    await this.updateJobStatus(job.id, newStatus);

    await this.processStepResult(step, job, dto.data);

    return { workerId, dto };
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
      },
    });
  }

  private async updateJobStatus(
    jobId: string,
    status: JobStatus,
  ): Promise<void> {
    await this.repo.update(jobId, { status });
  }

  private async processStepResult(
    step: any,
    job: any,
    data: any,
  ): Promise<void> {
    try {
      await step.resultHandler({
        dataSource: this.dataSource,
        result: data?.raw,
        job,
      });
    } catch (error) {
      // Log error and potentially update job status to failed
      console.error('Error processing step result:', error);

      // If the job wasn't already marked as failed, mark it as failed now
      if (job.status !== JobStatus.FAILED) {
        await this.updateJobStatus(job.id, JobStatus.FAILED);
      }

      throw error;
    }
  }

  /**
   * Starts the next job in the queue by inserting it into the database.
   *
   * Starts the next job in the queue by inserting it into the database.
   * Ignores any errors that might occur if the job already exists in the database.
   * @param assets the assets to start the next job for
   * @param currentWorkerName the name of the current worker
   */
  public async startNextJob(
    assets: Asset[],
    currentWorkerName: ToolCategory,
    group?: string,
  ): Promise<InsertResult | null> {
    const currentJobIndex =
      Object.values(ToolCategory).indexOf(currentWorkerName);

    const nextWorkerHandleJob =
      Object.values(ToolCategory)[currentJobIndex + 1] || null;

    if (!nextWorkerHandleJob) {
      return null;
    }

    if (!group) {
      group = randomUUID();
    }

    return this.repo
      .createQueryBuilder()
      .insert()
      .values(
        assets.map((i) => ({
          asset: i,
          category: nextWorkerHandleJob,
          group,
        })),
      )
      .orIgnore()
      .execute();
  }
}
