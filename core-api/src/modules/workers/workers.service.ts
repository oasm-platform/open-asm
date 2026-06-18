import { WORKER_TIMEOUT } from '@/common/constants/app.constants';
import { GetManyBaseResponseDto } from '@/common/dtos/get-many-base.dto';
import {
  ApiKeyType,
  JobStatus,
  WorkerScope,
  WorkerType,
} from '@/common/enums/enum';
import { RedisService } from '@/services/redis/redis.service';
import { generateToken } from '@/utils/genToken';
import { getManyResponse } from '@/utils/getManyResponse';
import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RpcException } from '@nestjs/microservices';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { LessThan, Repository } from 'typeorm';
import { ApiKeysService } from '../apikeys/apikeys.service';
import { Asset } from '../assets/entities/assets.entity';
import { InternalNetwork } from '../internal-networks/entities/internal-network.entity';
import { NetworkInterface } from '../internal-networks/entities/network-interface.entity';
import { JobsRegistryService } from '../jobs-registry/jobs-registry.service';
import { Tool } from '../tools/entities/tools.entity';
import { WorkspaceTool } from '../tools/entities/workspace_tools.entity';
import { ToolsService } from '../tools/tools.service';
import { Workspace } from '../workspaces/entities/workspace.entity';
import { AliveStreamManager } from './alive-stream-manager.service';
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

    @InjectRepository(WorkspaceTool)
    public readonly workspaceToolRepo: Repository<WorkspaceTool>,

    @InjectRepository(InternalNetwork)
    private internalNetworkRepo: Repository<InternalNetwork>,

    @InjectRepository(NetworkInterface)
    private networkInterfaceRepo: Repository<NetworkInterface>,

    @Inject(forwardRef(() => JobsRegistryService))
    private jobsRegistryService: JobsRegistryService,

    private apiKeyService: ApiKeysService,

    private configService: ConfigService,

    @Inject(forwardRef(() => ToolsService))
    private toolsService: ToolsService,

    private redisService: RedisService,

    private aliveStreamManager: AliveStreamManager,
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
    const worker = await this.repo.findOne({
      where: { token: dto.token },
    });

    if (!worker) {
      throw new UnauthorizedException('Invalid token');
    }

    await this.repo.update({ token: dto.token }, { lastSeenAt: new Date() });

    return this.repo.findOne({ where: { token: dto.token } });
  }

  /**
   * Automatically removes any workers that have been offline for at least 1 minute (60 seconds)
   * from the database. Uses hybrid approach: checks in-memory gRPC stream state first,
   * then falls back to DB lastSeenAt timestamp.
   *
   * - Worker has active gRPC stream → SKIP (connected)
   * - Worker has no stream BUT lastSeenAt not expired → SKIP (grace period)
   * - Worker has no stream AND lastSeenAt expired → DELETE
   */
  @Interval(WORKER_TIMEOUT)
  async autoCleanupWorkersAndJobs() {
    const staleWorkers = await this.repo.find({
      where: {
        lastSeenAt: LessThan(new Date(Date.now() - WORKER_TIMEOUT)),
      },
    });

    for (const worker of staleWorkers) {
      if (this.aliveStreamManager.isActive(worker.id)) {
        this.logger.debug(
          `[autoCleanup] Worker ${worker.id} has active stream, skipping deletion`,
        );
        continue;
      }

      this.logger.log(
        `[autoCleanup] Worker ${worker.id} has no active stream and lastSeenAt expired, removing`,
      );
      await this.workerLeave(worker.id);
    }

    // Update both in_progress jobs with missing workers and failed jobs
    await this.resetStuckAndFailedJobs();
  }

  /**
   * Removes a worker from the repository using its unique identifier.
   *
   * @param id - The unique identifier of the worker instance to be removed.
   * @returns A promise that resolves when the worker is successfully deleted.
   */

  private async workerLeave(id: string) {
    await this.releaseWorkerJobs(id);
    return this.repo.delete(id);
  }

  /**
   * Releases all IN_PROGRESS jobs held by a worker back to PENDING.
   * Does NOT delete the worker — used on stream disconnect so other
   * workers can pick up the freed jobs immediately.
   */
  public async releaseWorkerJobs(workerId: string) {
    await this.jobsRegistryService.repo
      .createQueryBuilder('jobs')
      .update()
      .set({ status: JobStatus.PENDING, workerId: undefined })
      .where('jobs."workerId" = :id', { id: workerId })
      .andWhere('jobs.status = :status', { status: JobStatus.IN_PROGRESS })
      .execute();
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
    const { page, limit, sortOrder, workspaceId, enabledAgentMode, scope } =
      query;
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
      .leftJoinAndSelect('w.tool', 't')
      .where('1=1');

    // Add enabledAgentMode filter if provided
    if (enabledAgentMode !== undefined) {
      queryBuilder.andWhere('w."enabledAgentMode" = :enabledAgentMode', {
        enabledAgentMode,
      });
    }

    // Add explicit scope filter if provided
    if (scope) {
      queryBuilder.andWhere('w."scope" = :scopeFilter', {
        scopeFilter: scope,
      });

      // If filtering by workspace scope, also filter by workspaceId
      if (scope === 'workspace' && workspaceId) {
        queryBuilder.andWhere('w."workspaceId" = :workspaceId', {
          workspaceId,
        });

        // For PROVIDER type workers, ensure they have a corresponding workspace_tool record
        queryBuilder.andWhere(
          `(w.type != '${WorkerType.PROVIDER}' OR EXISTS (
            SELECT 1 FROM workspace_tools wt
            WHERE wt."workspaceId" = :workspaceId
            AND wt."toolId" = w."toolId"
            AND wt."isEnabled" = true
          ))`,
          { workspaceId },
        );
      }
    } else if (workspaceId) {
      // Legacy behavior: no explicit scope filter, but workspaceId provided
      queryBuilder.andWhere(
        '(w."workspaceId" = :workspaceId OR w."scope" = :cloudScope)',
        {
          workspaceId,
          cloudScope: WorkerScope.CLOUD,
        },
      );

      // For PROVIDER type workers, ensure they have a corresponding workspace_tool record
      queryBuilder.andWhere(
        `(w.type != '${WorkerType.PROVIDER}' OR EXISTS (
          SELECT 1 FROM workspace_tools wt
          WHERE wt."workspaceId" = :workspaceId
          AND wt."toolId" = w."toolId"
          AND wt."isEnabled" = true
        ))`,
        { workspaceId },
      );
    } else if (enabledAgentMode === undefined) {
      // If no workspaceId and no enabledAgentMode filter, include only cloud workers
      queryBuilder.andWhere('w."scope" = :cloudScope', {
        cloudScope: WorkerScope.CLOUD,
      });
    }

    const [workers, total] = await queryBuilder
      .orderBy(`w.${sortBy.replace(/[^a-zA-Z0-9_]/g, '')}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    // Get current jobs count and active tools for each worker
    const workersWithJobCount = await Promise.all(
      workers.map(async (worker) => {
        const count = await this.jobsRegistryService['repo'].count({
          where: {
            workerId: worker.id,
            status: JobStatus.IN_PROGRESS,
          },
        });

        // Determine active tools based on worker type
        let tools: Tool[] = [];
        if (worker.type === WorkerType.BUILT_IN) {
          // For BUILT_IN workers, return all built-in tools
          const builtInTools = await this.toolsService.getBuiltInTools();
          tools = builtInTools.data;
        } else if (worker.tool) {
          // For PROVIDER workers, return the current tool as array
          tools = [worker.tool];
        }

        return {
          ...worker,
          currentJobsCount: count,
          tools,
          isOnline: this.aliveStreamManager.isActive(worker.id),
        };
      }),
    );

    return getManyResponse<WorkerInstance>({
      query,
      data: workersWithJobCount,
      total,
      ignoreFields: ['token', 'tool'],
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
    const { apiKey, signature, token, metadata, ipAddress } = dto;

    // 1. Validate signature first (mandatory)
    const workerSignature =
      this.configService.get<string>('WORKER_SIGNATURE') || '';

    if (signature !== workerSignature) {
      throw new UnauthorizedException('Invalid worker signature');
    }

    // 2. Validate API key
    const cloudApiKey = this.configService.get<string>('OASM_CLOUD_APIKEY');
    const isCloudWorker = cloudApiKey === apiKey;

    // 3. For regular workers, validate API key exists in database
    if (!isCloudWorker) {
      const apiKeyRecord = await this.apiKeyService.apiKeysRepository.findOne({
        where: { key: apiKey },
      });
      if (!apiKeyRecord) {
        throw new RpcException(`API key not found: ${apiKey}`);
      }
    }

    // 4. Token rejoin: if token exists and is valid, allow rejoin for both cloud and regular workers
    if (token) {
      const existingWorker = await this.repo.findOne({
        where: { token },
      });
      if (existingWorker) {
        await this.fallbackWorkerRejoin(existingWorker.id);
        if (ipAddress) {
          await this.repo.update({ id: existingWorker.id }, { ipAddress });
        }
        return existingWorker;
      }
    }

    // 5. Create new worker after successful authentication
    if (isCloudWorker) {
      return this.createCloudWorker(metadata, ipAddress);
    }

    return this.createRegularWorker(apiKey, metadata, ipAddress);
  }

  /**
   * Creates a cloud worker instance.
   * @param metadata - The worker metadata.
   * @param ipAddress - The IP address of the worker.
   * @returns A promise that resolves to the created cloud worker.
   */
  private async createCloudWorker(
    metadata?: WorkerJoinDto['metadata'],
    ipAddress?: string,
  ): Promise<WorkerInstance> {
    const workerId = randomUUID();
    const TOKEN_LENGTH = 48;

    const data: Partial<WorkerInstance> = {
      id: workerId,
      token: generateToken(TOKEN_LENGTH),
      type: WorkerType.BUILT_IN,
      scope: WorkerScope.CLOUD,
      name: metadata?.name,
      os: metadata?.os,
      ipAddress,
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
   * @param metadata - The worker metadata.
   * @param ipAddress - The IP address of the worker.
   * @returns A promise that resolves to the created worker.
   */
  private async createRegularWorker(
    apiKey: string,
    metadata?: WorkerJoinDto['metadata'],
    ipAddress?: string,
  ): Promise<WorkerInstance> {
    const apiKeyRecord = await this.apiKeyService.apiKeysRepository.findOne({
      where: { key: apiKey },
    });

    if (!apiKeyRecord) {
      throw new RpcException(`API key not found: ${apiKey}`);
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
      name: metadata?.name,
      os: metadata?.os,
      ipAddress,
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
  public async validateWorkerToken(
    token: string,
  ): Promise<WorkerInstance | null> {
    if (!token) {
      return null;
    }

    try {
      const worker = await this.repo.findOne({
        where: {
          token: token,
        },
      });

      return worker;
    } catch (error) {
      this.logger.error('Error validating worker token', error);
      return null;
    }
  }

  /**
   * Resets stuck in_progress jobs (missing workers) and failed jobs (retryable) back to pending.
   * This ensures jobs can be picked up by available workers.
   */
  private async resetStuckAndFailedJobs() {
    await this.repo.manager.query(`
      UPDATE jobs j
      SET status = CASE 
          WHEN j.status = '${JobStatus.IN_PROGRESS}' AND j."workerId"::uuid NOT IN (
            SELECT id FROM workers
          ) THEN '${JobStatus.PENDING}'
          WHEN j.status = '${JobStatus.FAILED}' AND j."retryCount" < 4 THEN '${JobStatus.PENDING}'
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
   * Resets all IN_PROGRESS jobs assigned to a specific worker back to PENDING.
   * Used when a worker rejoins after disconnection to reclaim pending work.
   * @param workerId - The ID of the worker whose jobs should be reset.
   */
  private async fallbackWorkerRejoin(workerId: string) {
    await this.jobsRegistryService.repo
      .createQueryBuilder()
      .update()
      .set({ status: JobStatus.PENDING })
      .where('workerId = :workerId', { workerId })
      .andWhere('status = :status', { status: JobStatus.IN_PROGRESS })
      .execute();
  }

  /**
   * Connects a worker to an internal network and inserts network interfaces.
   * Validates that the worker and network belong to the same workspace.
   * @param request - The request containing workerId, networkId, and network interfaces.
   * @returns A success message.
   */
  public async connectInternalNetwork(request: {
    workerId: string;
    networkId: string;
    networkInterfaces: Array<{
      interfaceName: string;
      ipAddress: string;
      cidr: string;
      gatewayIp: string;
      gatewayMac: string;
    }>;
  }): Promise<{ message: string }> {
    const { workerId, networkId, networkInterfaces } = request;

    // Find worker and get its workspace
    const worker = await this.repo.findOne({
      where: { id: workerId },
      relations: ['workspace'],
    });
    if (!worker) {
      throw new RpcException(`Worker not found: ${workerId}`);
    }
    await this.repo.update(workerId, { internalNetwork: { id: networkId } });
    const workerWorkspaceId = worker.workspace.id;

    // Find network and check workspace
    const network = await this.internalNetworkRepo.findOne({
      where: { id: networkId },
    });
    if (!network) {
      throw new RpcException(`Internal network not found: ${networkId}`);
    }
    if (network.workspaceId !== workerWorkspaceId) {
      throw new RpcException(
        `Network and worker belong to different workspaces`,
      );
    }

    // Insert network interfaces, ignoring duplicates
    const interfacesToSave = networkInterfaces.map((ni) => ({
      workerId,
      internalNetworkId: networkId,
      interfaceName: ni.interfaceName,
      ipAddress: ni.ipAddress,
      cidr: ni.cidr,
      gatewayIp: ni.gatewayIp,
      gatewayMac: ni.gatewayMac,
    }));

    await this.networkInterfaceRepo
      .createQueryBuilder()
      .insert()
      .into(NetworkInterface)
      .values(interfacesToSave)
      .orIgnore()
      .execute();

    return { message: 'Connect success' };
  }

  public async enableAgentMode(workerId: string): Promise<void> {
    await this.repo.update(workerId, { enabledAgentMode: true });
  }

  public async handleRemoteExecuteResult(result: {
    id: string;
    sessionId: string;
    type: number;
    data: Uint8Array;
    exitCode: number;
  }) {
    const channel = `remote-execute:results:${result.sessionId}`;
    const payload = JSON.stringify({
      id: result.id,
      sessionId: result.sessionId,
      type: result.type,
      data: Buffer.from(result.data).toString('utf-8'),
      exitCode: result.exitCode,
    });

    Logger.log(
      `[handleRemoteExecuteResult] Publishing to ${channel}: ${payload.substring(0, 100)}`,
      'WorkersService',
    );

    await this.redisService.publish(channel, payload);
  }
}
