import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { WORKER_TIMEOUT } from 'src/common/constants/app.constants';
import {
  GetManyBaseQueryParams,
  GetManyBaseResponseDto,
} from 'src/common/dtos/get-many-base.dto';
import { JobStatus } from 'src/common/enums/enum';
import { generateToken } from 'src/utils/genToken';
import { getManyResponse } from 'src/utils/getManyResponse';
import { DataSource, LessThan, Repository } from 'typeorm';
import { Asset } from '../assets/entities/assets.entity';
import { JobsRegistryService } from '../jobs-registry/jobs-registry.service';
import { Workspace } from '../workspaces/entities/workspace.entity';
import { WorkerAliveDto, WorkerJoinDto } from './dto/workers.dto';
import { WorkerInstance } from './entities/worker.entity';

@Injectable()
export class WorkersService {
  private logger = new Logger('WorkersService');
  constructor(
    @InjectRepository(WorkerInstance)
    public readonly repo: Repository<WorkerInstance>,

    @InjectRepository(Asset)
    public readonly assetRepo: Repository<Asset>,

    @Inject(forwardRef(() => JobsRegistryService))
    private jobsRegistryService: JobsRegistryService,

    private dataSource: DataSource,
  ) {}

  /**
   * Handles a worker's "alive" signal, which is sent
   * whenever a worker boots up or restarts.
   *
   * @param req The express request.
   * @param res The express response.
   * @param workerId The worker's unique identifier.
   */
  public async alive(dto: WorkerAliveDto) {
    const result = await this.repo.update(
      {
        token: dto.token,
      },
      {
        lastSeenAt: new Date(),
      },
    );
    if (result.affected === 0) {
      throw new UnauthorizedException('Invalid token');
    }
    return {
      alive: 'OK',
    };
  }

  /**
   * Automatically removes any workers that have been offline for at least 1 minute (60 seconds)
   * from the database. This function is intended to be run periodically (e.g. every 1 minute)
   * to clean up stale workers that may have disconnected without properly unregistering.
   *
   */
  @Interval(WORKER_TIMEOUT)
  async autoCleanupWorkersAndJobs() {
    const workers = await this.repo
      .find({
        where: {
          lastSeenAt: LessThan(new Date(Date.now() - WORKER_TIMEOUT)),
        },
      })
      .then((res) => res.map((worker) => worker.id));

    if (workers.length > 0) {
      for (const worker of workers) {
        await this.workerLeave(worker);
      }
    }

    // Update both in_progress jobs with missing workers and failed jobs
    await this.repo.manager.query(`
      UPDATE jobs j
      SET status = CASE 
          WHEN j.status = '${JobStatus.IN_PROGRESS}' AND j."workerId"::uuid NOT IN (
            SELECT id FROM workers
          ) THEN '${JobStatus.PENDING}'
          WHEN j.status = '${JobStatus.FAILED}' THEN '${JobStatus.PENDING}'
          ELSE j.status
        END,
        "workerId" = NULL
      WHERE j.status = '${JobStatus.IN_PROGRESS}'
        AND j."workerId"::uuid NOT IN (
          SELECT id FROM workers
        )
        OR j.status = '${JobStatus.FAILED}'
    `);
  }

  /**
   * Removes a worker from the repository using its unique identifier.
   *
   * @param id - The unique identifier of the worker instance to be removed.
   * @returns A promise that resolves when the worker is successfully deleted.
   */

  private async workerLeave(id: string) {
    await this.jobsRegistryService.repo
      .createQueryBuilder('jobs')
      .update()
      .set({ status: JobStatus.PENDING, workerId: undefined })
      .where('jobs."workerId" = :id', { id })
      .andWhere('jobs.status = :status', { status: JobStatus.IN_PROGRESS })
      .execute();
    return this.repo.delete(id);
  }

  /**
   * Retrieves a paginated list of workers.
   *
   * @param query - The query parameters for filtering and pagination,
   *                including page, limit, sortOrder, and sortBy.
   * @returns A promise that resolves to a paginated list of workers
   *          along with total count and pagination information.
   */
  public async getWorkers(
    query: GetManyBaseQueryParams,
  ): Promise<GetManyBaseResponseDto<WorkerInstance>> {
    const { page, limit, sortOrder } = query;
    let { sortBy } = query;
    if (!sortBy) {
      sortBy = '"createdAt"';
    }

    const result = await this.repo
      .createQueryBuilder('w')
      .select('w')
      .addSelect(
        `(SELECT COUNT(j.id) FROM jobs j WHERE j."workerId"::uuid = w.id::uuid and j.status = '${JobStatus.IN_PROGRESS}')`,
        'currentJobsCount',
      )
      .orderBy(`w.${sortBy.replace(/[^a-zA-Z0-9_]/g, '')}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit)
      .getRawAndEntities();

    const workers = result.entities.map((entity, index) => ({
      ...entity,
      currentJobsCount: result.raw[index]?.currentJobsCount,
    }));

    const total = workers.length;

    return getManyResponse<WorkerInstance>({
      query,
      data: workers,
      total,
      ignoreFields: ['token'],
    });
  }

  /**
   * Registers a worker in the database by inserting a new record
   * with a unique worker index for the given worker name ID.
   *
   * This function runs within a transaction to ensure that the worker
   * index is generated atomically and without conflicts even with
   * concurrent requests. It attempts to find the smallest available
   * index for the worker name and assigns it to the new worker.
   *
   * @param dto - The data transfer object containing the token of the worker.
   * @returns A promise that resolves to the assigned worker index.
   */
  public async join(dto: WorkerJoinDto): Promise<WorkerInstance | null> {
    const { token } = dto;

    // Find the workspace by API key
    const workspace = await this.dataSource.getRepository(Workspace).findOne({
      where: {
        apiKey: token,
      },
    });

    // Validate the provided token against the admin token
    if (!workspace) {
      throw new UnauthorizedException('Invalid API key');
    }

    // Generate a unique ID for the new worker instance
    const workerId = randomUUID();

    const TOKEN_LENGTH = 48;

    await this.repo.save({
      id: workerId,
      token: generateToken(TOKEN_LENGTH),
      workspace: { id: workspace.id },
    });
    // Fetch and return the newly created worker instance from the repository
    return this.repo.findOne({
      where: {
        id: workerId,
      },
    });
  }
}
