import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import {
  GetManyBaseQueryParams,
  GetManyBaseResponseDto,
} from '@/common/dtos/get-many-base.dto';
import {
  BullMQName,
  JobOutboxStatus,
  JobPriority,
  JobStatus,
  ToolCategory,
  WorkerScope,
  WorkerType,
} from '@/common/enums/enum';
import { RedisLockService } from '@/services/redis/distributed-lock.service';
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
import { Interval } from '@nestjs/schedule';
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
import { JobOutbox } from './entities/job-outbox.entity';
import { Job } from './entities/job.entity';

@Injectable()
export class JobsRegistryService {
  constructor(
    @InjectRepository(Job) public readonly repo: Repository<Job>,
    @InjectRepository(JobHistory)
    public readonly jobHistoryRepo: Repository<JobHistory>,
    @InjectRepository(JobErrorLog)
    public readonly jobErrorLogRepo: Repository<JobErrorLog>,
    @InjectRepository(JobOutbox)
    public readonly jobOutboxRepo: Repository<JobOutbox>,
    private dataSource: DataSource,
    @Optional() private toolsService: ToolsService,
    private storageService: StorageService,
    private redis: RedisService,
    @InjectQueue(BullMQName.JOB_RESULT) private jobResultQueue: Queue,
    private lockService: RedisLockService,
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

    // Create query runner for transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Step 1: create job history
      let jobHistory: JobHistory;

      if (existingJobHistory) {
        jobHistory = existingJobHistory;
      } else {
        jobHistory = queryRunner.manager.create(JobHistory, {
          workflow,
        });
        await queryRunner.manager.save(jobHistory);
      }

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
          const job = queryRunner.manager.create(Job, {
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

        const filteredAssets = this.filterAssetsByCategory(
          assets,
          tool.category,
        );

        // Step 3: iterate tools and create jobs
        const defaultCommand = builtInTools.find(
          (t) => t.name === tool.name,
        )?.command;

        for (const asset of filteredAssets) {
          const job = queryRunner.manager.create(Job, {
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

      // Step 4: save all jobs and outbox records in transaction
      if (jobsToInsert.length > 0) {
        // Save all jobs
        await queryRunner.manager.save(Job, jobsToInsert);

        // Create job outbox records for each job
        const outboxRecords = jobsToInsert.map((job) => {
          // Payload follows GetNextJobResponseDto structure

          return queryRunner.manager.create(JobOutbox, {
            payload: {
              id: job.id,
              category: job.category,
              status: job.status,
              priority: job.priority,
              createdAt: job.createdAt,
              updatedAt: job.updatedAt,
              command: job.command,
              asset: job.asset?.value ?? '',
              workspaceId: workspaceId,
              toolId: job.tool.id,
              tool: {
                id: job.tool.id,
                name: job.tool.name,
              },
            },
            status: JobOutboxStatus.PENDING,
            jobId: job.id,
          });
        });

        // Save all outbox records
        await queryRunner.manager.save(JobOutbox, outboxRecords);

        // Commit transaction
        await queryRunner.commitTransaction();

        // Increment pending jobs counter (hybrid Redis + DB) - outside transaction
        await this.incrementJobHistoryCounter(
          jobHistory.id,
          jobsToInsert.length,
        );
      } else {
        // No jobs to insert, rollback transaction
        await queryRunner.rollbackTransaction();
      }

      return jobsToInsert;
    } catch (error) {
      // Rollback transaction on error
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      // Release query runner
      await queryRunner.release();
    }
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
   * been started. First tries to get job from Redis using BRPOP, then falls back
   * to database query if Redis has no jobs.
   * Uses distributed locking to ensure Redis pop and DB update are atomic.
   * @param workerId the ID of the worker to retrieve a job for
   * @returns the next job associated with the worker, or `null` if none is found
   */
  public async getNextJob(
    workerId: string,
  ): Promise<GetNextJobResponseDto | null> {
    try {
      // Get worker information first - single DB query, reused throughout
      const worker = await this.repo.manager
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

      // Try to get job from Redis first with proper sync
      const redisJob = await this.tryGetJobFromRedisWithSync(worker);

      if (redisJob) {
        return redisJob;
      }

      // Fallback to database query if Redis has no jobs
      // Pass worker directly to avoid redundant DB query
      return await this.getNextJobFromDatabase(worker);
    } catch (error) {
      Logger.error(
        'Error in getNextJob',
        error instanceof Error ? error : new Error(String(error)),
      );
      return null;
    }
  }

  /**
   * Gets job from Redis with proper atomic sync to database.
   * Uses distributed lock to prevent job loss if DB update fails.
   * @param worker the worker instance
   * @returns the job response DTO or null
   */
  private async tryGetJobFromRedisWithSync(
    worker: WorkerInstance,
  ): Promise<GetNextJobResponseDto | null> {
    const isBuiltInTools = worker.type === WorkerType.BUILT_IN;

    if (isBuiltInTools) {
      return await this.tryGetJobFromRedisForBuiltInWorkerWithSync(worker);
    }

    return await this.tryGetJobFromRedisForGlobalWorkerWithSync(worker);
  }

  /**
   * Gets job from Redis for built-in worker with proper sync.
   * @param worker the built-in worker instance
   * @returns the job response DTO or null
   */
  private async tryGetJobFromRedisForBuiltInWorkerWithSync(
    worker: WorkerInstance,
  ): Promise<GetNextJobResponseDto | null> {
    const builtInToolsNames = builtInTools.map((tool) => tool.name);
    const workspaceId = worker.workspace?.id;

    // Scan priority from 0 to 4 (lower number = higher priority = process first)
    for (let priority = 0; priority <= 4; priority++) {
      // Scan through each built-in tool
      for (const toolName of builtInToolsNames) {
        const redisKey = `jobs:${toolName}:${workspaceId}:${priority}`;

        // BRPOP with 1 second timeout
        const result = await this.redis.client.brpop(redisKey, 1);

        if (result) {
          const jsonString = result[1];
          const payload = JSON.parse(jsonString) as GetNextJobResponseDto;
          const jobId = payload.id;

          // Try to claim and update in DB atomically
          const claimed = await this.claimJobFromRedis(jobId, worker.id);

          if (claimed) {
            // Success: job is claimed, return response
            return this.buildJobResponseFromPayload(payload, worker);
          }

          // Failed to claim: job might be claimed by another worker or stale
          // Continue to next job
          Logger.warn(`Failed to claim job ${jobId} from Redis, continuing...`);
        }
      }
    }

    return null;
  }

  /**
   * Gets job from Redis for global worker with proper sync.
   * @param worker the global worker instance
   * @returns the job response DTO or null
   */
  private async tryGetJobFromRedisForGlobalWorkerWithSync(
    worker: WorkerInstance,
  ): Promise<GetNextJobResponseDto | null> {
    const toolName = worker.tool?.name;
    if (!toolName) {
      return null;
    }

    // Scan priority from 0 to 4 (lower number = higher priority = process first)
    for (let priority = 0; priority <= 4; priority++) {
      // Use SCAN to find all keys matching pattern: jobs:{toolName}:*:{priority}
      const pattern = `jobs:${toolName}:*:${priority}`;
      const keys: string[] = [];

      // SCAN iterator
      let cursor = '0';
      do {
        const [newCursor, foundKeys] = await this.redis.client.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );
        cursor = newCursor;
        keys.push(...foundKeys);
      } while (cursor !== '0');

      // Randomize keys for fair distribution
      this.shuffleArray(keys);

      // Try each key with BRPOP
      for (const redisKey of keys) {
        const result = await this.redis.client.brpop(redisKey, 1);

        if (result) {
          const jsonString = result[1];
          const payload = JSON.parse(jsonString) as GetNextJobResponseDto;
          const jobId = payload.id;

          // Try to claim and update in DB atomically
          const claimed = await this.claimJobFromRedis(jobId, worker.id);

          if (claimed) {
            // Success: job is claimed, return response
            return this.buildJobResponseFromPayload(payload, worker);
          }

          // Failed to claim: job might be claimed by another worker or stale
          Logger.warn(`Failed to claim job ${jobId} from Redis, continuing...`);
        }
      }
    }

    return null;
  }

  /**
   * Claims a job from Redis by updating the database.
   * Uses Redis SETNX for atomic claiming and DB transaction for update.
   * If DB update fails, the claim key expires and job can be re-claimed.
   * @param jobId the job ID
   * @param workerId the worker ID
   * @returns true if claimed successfully, false otherwise
   */
  private async claimJobFromRedis(
    jobId: string,
    workerId: string,
  ): Promise<boolean> {
    const claimKey = `claimed:${jobId}`;
    const claimTTL = 30; // 30 seconds TTL for claim key (DB update should complete faster)

    // Try to set claim key atomically (only one worker can claim)
    const claimed = await this.redis.client.set(
      claimKey,
      workerId,
      'EX',
      claimTTL,
      'NX',
    );

    if (claimed !== 'OK') {
      // Another worker already claimed this job
      return false;
    }

    try {
      // Update job status in database to IN_PROGRESS
      const updated = await this.repo.update(jobId, {
        status: JobStatus.IN_PROGRESS,
        workerId,
        pickJobAt: new Date(),
      });

      if (updated.affected && updated.affected > 0) {
        // Success: extend claim TTL slightly to allow for job processing
        await this.redis.client.expire(claimKey, 3600); // 1 hour for processing
        return true;
      }

      // DB update failed, release claim
      await this.redis.client.del(claimKey);
      return false;
    } catch (error) {
      // DB error, release claim so job can be re-claimed
      Logger.error(
        `Failed to claim job ${jobId} in DB, releasing claim`,
        error instanceof Error ? error : new Error(String(error)),
      );
      await this.redis.client.del(claimKey);
      return false;
    }
  }

  /**
   * Recovery mechanism: Reclaims stale jobs that were popped from Redis
   * but never updated in DB. Should be called periodically.
   * @returns number of jobs reclaimed
   */
  public async recoverStaleJobs(): Promise<number> {
    const logger = new Logger('JobRecovery');
    let recoveredCount = 0;

    try {
      // Find claim keys that have expired
      const claimPattern = 'claimed:*';
      let cursor = '0';

      do {
        const [newCursor, keys] = await this.redis.client.scan(
          cursor,
          'MATCH',
          claimPattern,
          'COUNT',
          100,
        );
        cursor = newCursor;

        for (const claimKey of keys) {
          // Check if key still exists (not expired)
          const exists = await this.redis.client.exists(claimKey);
          if (!exists) {
            // Key expired, extract jobId and check if job is still PENDING
            const jobId = claimKey.replace('claimed:', '');
            const job = await this.repo.findOne({
              where: { id: jobId, status: JobStatus.PENDING },
            });

            if (job) {
              logger.warn(`Recovering stale job ${jobId} from Redis pop`);
              // Re-add to outbox for re-processing
              await this.reAddJobToOutbox(job);
              recoveredCount++;
            }
          }
        }
      } while (cursor !== '0');

      if (recoveredCount > 0) {
        logger.log(`Recovered ${recoveredCount} stale jobs`);
      }
    } catch (error) {
      logger.error(
        'Error recovering stale jobs',
        error instanceof Error ? error : new Error(String(error)),
      );
    }

    return recoveredCount;
  }

  /**
   * Re-adds a job to the outbox for re-processing.
   * @param job the job entity to re-add
   */
  private async reAddJobToOutbox(job: Job): Promise<void> {
    // Get workspaceId from job relations or fall back to query
    let workspaceId = '';
    if (job.asset?.target?.workspaceTargets?.[0]?.workspace?.id) {
      workspaceId = job.asset.target.workspaceTargets[0].workspace.id;
    } else {
      // Fallback: query workspace from asset
      interface WorkspaceResult {
        workspaceId: string;
      }

      const assetWithWorkspace = await this.repo.manager
        .getRepository(Asset)
        .createQueryBuilder('asset')
        .innerJoin('asset.target', 'target')
        .innerJoin('target.workspaceTargets', 'wt')
        .innerJoin('wt.workspace', 'workspace')
        .where('asset.id = :assetId', { assetId: job.asset?.id })
        .select(['workspace.id as workspaceId'])
        .getRawOne<WorkspaceResult>();

      workspaceId = assetWithWorkspace?.workspaceId ?? '';
    }

    const payload: GetNextJobResponseDto = {
      id: job.id,
      category: job.category,
      status: job.status,
      priority: job.priority,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      command: job.command,
      asset: job.asset?.value ?? '',
      workspaceId,
      tool: {
        id: job.tool.id,
        name: job.tool.name,
        description: '',
      },
    };

    const outboxRecord = this.jobOutboxRepo.create({
      payload,
      status: JobOutboxStatus.PENDING,
      jobId: job.id,
    });

    await this.jobOutboxRepo.save(outboxRecord);
  }

  /**
   * Builds a job response from Redis payload.
   * @param payload the job payload from Redis
   * @param worker the worker instance
   * @returns the job response DTO
   */
  private buildJobResponseFromPayload(
    payload: GetNextJobResponseDto,
    worker: WorkerInstance,
  ): GetNextJobResponseDto {
    return {
      id: payload.id,
      category: payload.category,
      createdAt: payload.createdAt,
      updatedAt: payload.updatedAt,
      priority: payload.priority,
      command: payload.command,
      asset: payload.asset,
      tool: payload.tool,
      workspaceId: worker.workspace?.id ?? payload.workspaceId,
      status: JobStatus.IN_PROGRESS,
    };
  }

  /**
   * Builds a job response from database job entity.
   * @param job the job entity
   * @param worker the worker instance
   * @returns the job response DTO
   */
  private buildJobResponse(
    job: Job,
    worker: WorkerInstance,
  ): GetNextJobResponseDto {
    return {
      id: job.id,
      category: job.category,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      priority: job.priority,
      command: job.command,
      asset: job.asset.value,
      tool: job.tool,
      workspaceId: worker.workspace.id,
      status: job.status,
    };
  }

  /**
   * Updates job status to IN_PROGRESS in the database.
   * @param jobId the job ID
   * @param workerId the worker ID
   */
  private async updateJobStatusInProgress(
    jobId: string,
    workerId: string,
  ): Promise<void> {
    await this.repo.update(jobId, {
      status: JobStatus.IN_PROGRESS,
      workerId,
      pickJobAt: new Date(),
    });
  }

  /**
   * Fallback method to get next job from database.
   * Reuses worker parameter to avoid redundant DB query.
   * @param worker the worker instance (passed from caller to avoid duplicate query)
   * @returns the next job or null
   */
  private async getNextJobFromDatabase(
    worker: WorkerInstance,
  ): Promise<GetNextJobResponseDto | null> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
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

      job.workerId = worker.id;
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

      return this.buildJobResponse(job, worker);
    } catch (error) {
      Logger.error(
        'Error in getNextJobFromDatabase',
        error instanceof Error ? error : new Error(String(error)),
      );
      await queryRunner.rollbackTransaction();
      return null;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Shuffles an array in place using Fisher-Yates algorithm.
   * @param array the array to shuffle
   */
  private shuffleArray<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
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
    let transactionStarted = false;

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();
      transactionStarted = true;

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
      if (transactionStarted) {
        try {
          await queryRunner.rollbackTransaction();
        } catch (rollbackError) {
          Logger.error(
            'Error during transaction rollback in reRunJob',
            rollbackError instanceof Error
              ? rollbackError
              : new Error(String(rollbackError)),
          );
        }
      }
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
    let transactionStarted = false;

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();
      transactionStarted = true;

      // Verify job exists and belongs to workspace
      const job = await this.verifyJobBelongsToWorkspace(jobId, workspaceId);

      // Update job status to cancelled
      job.status = JobStatus.CANCELLED;

      await queryRunner.manager.save(job);

      await queryRunner.commitTransaction();

      return { message: 'Job cancelled successfully' };
    } catch (error) {
      if (transactionStarted) {
        try {
          await queryRunner.rollbackTransaction();
        } catch (rollbackError) {
          Logger.error(
            'Error during transaction rollback in cancelJob',
            rollbackError instanceof Error
              ? rollbackError
              : new Error(String(rollbackError)),
          );
        }
      }
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
    let transactionStarted = false;

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();
      transactionStarted = true;

      // Verify job exists and belongs to workspace
      const job = await this.verifyJobBelongsToWorkspace(jobId, workspaceId);

      // Delete the job
      await queryRunner.manager.remove(job);

      await queryRunner.commitTransaction();

      return { message: 'Job deleted successfully' };
    } catch (error) {
      if (transactionStarted) {
        try {
          await queryRunner.rollbackTransaction();
        } catch (rollbackError) {
          Logger.error(
            'Error during transaction rollback in deleteJob',
            rollbackError instanceof Error
              ? rollbackError
              : new Error(String(rollbackError)),
          );
        }
      }
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

  /**
   * Process pending job outbox records and push them to Redis lists
   * Runs every 1 second via @Interval decorator
   * Ensures jobs are processed in order of creation (oldest first)
   */
  @Interval(500)
  public async processPendingJobOutbox(): Promise<void> {
    await this.lockService.withLock(
      'processPendingJobOutbox',
      5000,
      async () => {
        try {
          // Get all pending job outbox records, ordered by createdAt (oldest first)
          const pendingOutboxRecords = await this.jobOutboxRepo.find({
            where: {
              status: JobOutboxStatus.PENDING,
            },
            order: {
              createdAt: 'ASC', // Oldest first to ensure FIFO
            },
          });

          if (pendingOutboxRecords.length === 0) {
            return; // No pending records, exit early
          }

          // Process each record
          for (const outboxRecord of pendingOutboxRecords) {
            try {
              const payload: GetNextJobResponseDto = outboxRecord.payload;
              const { priority, workspaceId, tool } = payload;
              // Create Redis key with priority
              const redisKey = `jobs:${tool.name}:${workspaceId}:${priority}`;

              // Push to Redis list using RPUSH to maintain FIFO order
              // Since we process oldest first and use RPUSH, newer jobs go to the end
              await this.redis.client.rpush(redisKey, JSON.stringify(payload));

              // Update status to SENT
              outboxRecord.status = JobOutboxStatus.SENT;
              await this.jobOutboxRepo.save(outboxRecord);
            } catch (error) {
              // Mark as ERROR and log
              outboxRecord.status = JobOutboxStatus.ERROR;
              await this.jobOutboxRepo.save(outboxRecord);

              Logger.error(
                `Failed to process outbox record ${outboxRecord.id}: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              );
            }
          }
        } catch (error) {
          Logger.error(
            'Error in processPendingJobOutbox:',
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      },
    );
  }
}
