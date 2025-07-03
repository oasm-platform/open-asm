import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JobStatus, WorkerName } from 'src/common/enums/enum';
import { DataSource, InsertResult, Repository } from 'typeorm';
import { Asset } from '../assets/entities/assets.entity';
import { WorkersService } from '../workers/workers.service';
import {
  GetManyJobsQueryParams,
  GetNextJobResponseDto,
  UpdateResultDto,
} from './dto/jobs-registry.dto';
import { Job } from './entities/job.entity';
import {
  GetManyBaseQueryParams,
  GetManyBaseResponseDto,
} from 'src/common/dtos/get-many-base.dto';
import { getManyResponse } from 'src/utils/getManyResponse';

@Injectable()
export class JobsRegistryService {
  constructor(
    @InjectRepository(Job) public readonly repo: Repository<Job>,
    private workerService: WorkersService,
    private dataSource: DataSource,
  ) {}

  /**
   * Creates a new job associated with the given asset and worker name.
   * @param asset the asset the job is associated with
   * @param workerName the name of the worker to run on the asset
   * @returns the newly created job
   */
  public createJob(asset: Asset, workerName: WorkerName): Promise<Job> {
    return this.repo.save({
      asset,
      workerName,
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
    const worker = await this.workerService.getWorkerById(workerId);
    const job = await this.repo.findOne({
      where: {
        status: JobStatus.PENDING,
        workerName: worker?.workerName,
      },
      order: {
        createdAt: 'ASC',
      },
      relations: ['asset'],
    });

    if (job) {
      job.workerId = workerId;
      job.status = JobStatus.IN_PROGRESS;
      job.pickJobAt = new Date();
      await this.repo.save(job);

      return {
        jobId: job.id,
        value: job.asset.value,
        workerName: job.workerName,
      };
    }

    return null;
  }

  /**
   * Retrieves a paginated list of jobs associated with a specified asset ID.
   *
   * @param id - The ID of the asset for which to retrieve jobs.
   * @param query - The query parameters to filter and paginate the jobs, including page, limit, sort order, job status, and worker name.
   * @returns A promise that resolves to a paginated response containing the jobs and total count.
   */
  public async getJobsByAssetId(
    id: string,
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
      .where('asset.id = :id', { id });

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
    id: string,
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
      .where('target.id = :id', { id });

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
  public async updateResult(workerId: string, dto: UpdateResultDto) {
    const job = await this.repo.findOne({
      where: {
        workerId,
        status: JobStatus.IN_PROGRESS,
      },
      relations: {
        asset: {
          target: true,
        },
      },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    job.status = JobStatus.COMPLETED;

    const { workerName } = job;
    const step = this.workerService.getWorkerStepByName(workerName);
    if (step) {
      step?.resultHandler({
        dataSource: this.dataSource,
        result: (dto.data as any).raw,
        job,
      });
    }

    return {
      workerId,
      dto,
    };
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
    currentWorkerName: WorkerName,
  ): Promise<InsertResult | null> {
    const currentJobIndex =
      Object.values(WorkerName).indexOf(currentWorkerName);

    const nextWorkerHandleJob =
      Object.values(WorkerName)[currentJobIndex + 1] || null;

    if (!nextWorkerHandleJob) {
      return null;
    }
    return this.repo
      .createQueryBuilder()
      .insert()
      .values(
        assets.map((i) => ({
          asset: i,
          workerName: nextWorkerHandleJob,
        })),
      )
      .orIgnore()
      .execute();
  }
}
