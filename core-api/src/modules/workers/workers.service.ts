import { WORKER_TIMEOUT } from '@/common/constants/app.constants';
import { GetManyBaseResponseDto } from '@/common/dtos/get-many-base.dto';
import {
  ApiKeyType,
  JobStatus,
  WorkerScope,
  WorkerType,
} from '@/common/enums/enum';
import { generateToken } from '@/utils/genToken';
import { getManyResponse } from '@/utils/getManyResponse';
import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { LessThan, Repository } from 'typeorm';
import { ApiKeysService } from '../apikeys/apikeys.service';
import { Asset } from '../assets/entities/assets.entity';
import { JobsRegistryService } from '../jobs-registry/jobs-registry.service';
import { Tool } from '../tools/entities/tools.entity';
import { Workspace } from '../workspaces/entities/workspace.entity';
import {
  GetManyWorkersDto,
  WorkerAliveDto,
  WorkerJoinDto,
} from './dto/workers.dto';
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

    private apiKeyService: ApiKeysService,

    private configService: ConfigService
  ) { }

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
    query: GetManyWorkersDto,
  ): Promise<GetManyBaseResponseDto<WorkerInstance>> {
    const { page, limit, sortOrder, workspaceId } = query;
    let { sortBy } = query;
    if (!sortBy) {
      sortBy = '"createdAt"';
    }

    const queryBuilder = this.repo
      .createQueryBuilder('w')
      .select('w')
      .addSelect(
        `(SELECT COUNT(j.id) FROM jobs j WHERE j."workerId"::uuid = w.id::uuid and j.status = '${JobStatus.IN_PROGRESS}')`,
        'currentJobsCount',
      )
      .where('1=1');

    // Add workspace filter if workspaceId is provided, or if worker has cloud scope
    if (workspaceId) {
      queryBuilder.andWhere(
        '(w."workspaceId" = :workspaceId OR w."scope" = :cloudScope)',
        {
          workspaceId,
          cloudScope: WorkerScope.CLOUD
        }
      );
    } else {
      // If no workspaceId provided, we still want to include cloud workers
      queryBuilder.andWhere('w."scope" = :cloudScope', {
        cloudScope: WorkerScope.CLOUD
      });
    }

    const [workers, total] = await queryBuilder
      .orderBy(`w.${sortBy.replace(/[^a-zA-Z0-9_]/g, '')}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    // Get current jobs count for each worker
    const workersWithJobCount = await Promise.all(
      workers.map(async (worker) => {
        const count = await this.jobsRegistryService['repo'].count({
          where: {
            workerId: worker.id,
            status: JobStatus.IN_PROGRESS,
          },
        });
        return {
          ...worker,
          currentJobsCount: count,
        };
      }),
    );

    return getManyResponse<WorkerInstance>({
      query,
      data: workersWithJobCount,
      total,
      ignoreFields: ['token'],
    });
  }

  /**
   * Determines the worker type and scope based on the API key type.
   * @param apiKeyType - The type of the API key.
   * @returns An object containing the worker type and scope.
   */
  private determineWorkerTypeAndScope(apiKeyType: ApiKeyType): {
    type: WorkerType;
    scope: WorkerScope;
  } {
    if (apiKeyType === ApiKeyType.WORKSPACE) {
      return {
        type: WorkerType.BUILT_IN,
        scope: WorkerScope.WORKSPACE,
      };
    }

    return {
      type: WorkerType.PROVIDER,
      scope: WorkerScope.CLOUD,
    };
  }

  /**
   * Determines the worker association (workspace or tool) based on the API key type and reference.
   * @param apiKeyType - The type of the API key.
   * @param ref - The reference ID associated with the API key.
   * @returns An object containing either the workspace or tool association.
   */
  private determineWorkerAssociation(
    apiKeyType: ApiKeyType,
    ref: string,
  ): Partial<Pick<WorkerInstance, 'workspace' | 'tool'>> {
    if (apiKeyType === ApiKeyType.WORKSPACE) {
      return { workspace: { id: ref } as Workspace };
    }
    if (apiKeyType === ApiKeyType.TOOL) {
      return { tool: { id: ref } as Tool };
    }
    return {};
  }

  /**
   * Registers a worker in the database by creating a new worker instance.
   * Handles both cloud workers (using cloud API key) and regular workers (using API keys).
   *
   * @param dto - The data transfer object containing the API key.
   * @returns A promise that resolves to the created worker instance.
   */
  public async join(dto: WorkerJoinDto): Promise<WorkerInstance> {
    const { apiKey } = dto;
    const cloudApiKey = this.configService.get<string>('OASM_CLOUD_APIKEY');

    if (cloudApiKey === apiKey) {
      return this.createCloudWorker();
    }

    return this.createRegularWorker(apiKey);
  }

  /**
   * Creates a cloud worker instance.
   * @returns A promise that resolves to the created cloud worker.
   */
  private async createCloudWorker(): Promise<WorkerInstance> {
    const workerId = randomUUID();
    const TOKEN_LENGTH = 48;

    const data: Partial<WorkerInstance> = {
      id: workerId,
      token: generateToken(TOKEN_LENGTH),
      type: WorkerType.BUILT_IN,
      scope: WorkerScope.CLOUD,
    };

    await this.repo.save(data);

    const worker = await this.repo.findOne({
      where: { id: workerId },
    });

    if (!worker) {
      throw new Error('Failed to create cloud worker');
    }

    return worker;
  }

  /**
   * Creates a regular worker instance based on the provided API key.
   * @param apiKey - The API key to validate and use for worker creation.
   * @returns A promise that resolves to the created worker.
   */
  private async createRegularWorker(apiKey: string): Promise<WorkerInstance> {
    const apiKeyRecord = await this.apiKeyService.apiKeysRepository.findOne({
      where: { key: apiKey },
    });

    if (!apiKeyRecord) {
      throw new NotFoundException(`API key not found: ${apiKey}`);
    }

    const workerId = randomUUID();
    const TOKEN_LENGTH = 48;

    const { type, scope } = this.determineWorkerTypeAndScope(apiKeyRecord.type);
    const association = this.determineWorkerAssociation(
      apiKeyRecord.type,
      apiKeyRecord.ref,
    );

    const data: Partial<WorkerInstance> = {
      id: workerId,
      token: generateToken(TOKEN_LENGTH),
      type,
      scope,
      ...association,
    };

    await this.repo.save(data);

    const worker = await this.repo.findOne({
      where: { id: workerId },
    });

    if (!worker) {
      throw new Error('Failed to create regular worker');
    }

    return worker;
  }

  /**
   * Validates a worker token by checking its existence in the database
   * @param token - The worker token to validate
   * @returns True if the token is valid, false otherwise
   */
  public async validateWorkerToken(token: string): Promise<boolean> {
    if (!token) {
      return false;
    }

    try {
      const worker = await this.repo.findOne({
        where: {
          token: token,
        },
      });

      return !!worker;
    } catch (error) {
      this.logger.error('Error validating worker token', error);
      return false;
    }
  }
}
