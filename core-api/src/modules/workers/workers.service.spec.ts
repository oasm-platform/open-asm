import { JobStatus, WorkerScope, WorkerType } from '@/common/enums/enum';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { Asset } from '../assets/entities/assets.entity';
import { ConnectorRegistryService } from '../connectors/connector-registry.service';
import { EVENT_CATALOG } from '../event-bridge/contracts/event-catalog';
import { EventBridgeService } from '../event-bridge/publishing/event-bridge.service';
import { JobsRegistryService } from '../jobs-registry/jobs-registry.service';
import { InternalNetwork } from '../internal-networks/entities/internal-network.entity';
import { NetworkInterface } from '../internal-networks/entities/network-interface.entity';
import { WorkspaceTool } from '../tools/entities/workspace_tools.entity';
import { ToolsService } from '../tools/tools.service';
import { RedisService } from '@/services/redis/redis.service';
import { AliveStreamManager } from './alive-stream-manager.service';
import { WorkerInstance } from './entities/worker.entity';
import { WorkersService } from './workers.service';
import { WorkerJoinKeyService } from './worker-join-key.service';
import { WorkerTelemetryService } from './worker-telemetry.service';

describe('WorkersService', () => {
  let service: WorkersService;
  let mockWorkerInstanceRepository: Partial<Repository<WorkerInstance>>;
  let mockAssetRepository: Partial<Repository<any>>;
  let mockWorkspaceToolRepository: Partial<Repository<any>>;
  let mockInternalNetworkRepository: Partial<Repository<any>>;
  let mockNetworkInterfaceRepository: Partial<Repository<any>>;
  let mockJobsRegistryService: Partial<JobsRegistryService>;
  let mockJoinKeyService: { consume: jest.Mock };
  let mockConfigService: Partial<ConfigService>;
  let mockToolsService: Partial<ToolsService>;
  let mockRedisService: Partial<RedisService>;
  let mockAliveStreamManager: Partial<AliveStreamManager>;
  let mockConnectorRegistryService: Partial<ConnectorRegistryService>;
  let mockWorkerTelemetryService: Partial<WorkerTelemetryService>;
  let mockEventBridge: { publishSafely: jest.Mock };

  beforeEach(async () => {
    mockWorkerInstanceRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
      getOneOrFail: jest.fn(),
      getMany: jest.fn(),
      getManyAndCount: jest.fn(),
      getRawMany: jest.fn(),
      getRawOne: jest.fn(),
      exists: jest.fn(),
    } as any;

    mockAssetRepository = {
      findOne: jest.fn(),
    } as any;

    mockWorkspaceToolRepository = {
      findOne: jest.fn(),
    } as any;

    mockInternalNetworkRepository = {
      findOne: jest.fn(),
    } as any;

    mockNetworkInterfaceRepository = {
      insert: jest.fn(),
    } as any;

    mockJobsRegistryService = {
      repo: {
        createQueryBuilder: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn(),
      },
    } as any;

    mockJoinKeyService = { consume: jest.fn().mockResolvedValue(null) };

    mockConfigService = {
      get: jest.fn(),
    };

    mockToolsService = {
      getBuiltInTools: jest.fn().mockResolvedValue({ data: [] }),
    };

    mockRedisService = {
      publish: jest.fn(),
    };

    mockAliveStreamManager = {
      isActive: jest.fn().mockReturnValue(false),
      register: jest.fn().mockReturnValue('stream-1'),
      unregister: jest.fn(),
      updateAlive: jest.fn(),
      getActiveWorkerIds: jest.fn().mockReturnValue(new Set()),
      getActiveStreamCount: jest.fn().mockReturnValue(0),
    };

    mockConnectorRegistryService = {
      getAllConnectors: jest.fn().mockReturnValue([]),
      getConnector: jest.fn().mockReturnValue(null),
    };

    mockWorkerTelemetryService = {
      get: jest.fn().mockResolvedValue(null),
    };

    mockEventBridge = { publishSafely: jest.fn().mockResolvedValue('1-0') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkersService,
        {
          provide: getRepositoryToken(WorkerInstance),
          useValue: mockWorkerInstanceRepository,
        },
        {
          provide: getRepositoryToken(Asset),
          useValue: mockAssetRepository,
        },
        {
          provide: getRepositoryToken(WorkspaceTool),
          useValue: mockWorkspaceToolRepository,
        },
        {
          provide: getRepositoryToken(InternalNetwork),
          useValue: mockInternalNetworkRepository,
        },
        {
          provide: getRepositoryToken(NetworkInterface),
          useValue: mockNetworkInterfaceRepository,
        },
        {
          provide: JobsRegistryService,
          useValue: mockJobsRegistryService,
        },
        {
          provide: WorkerJoinKeyService,
          useValue: mockJoinKeyService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: ToolsService,
          useValue: mockToolsService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: AliveStreamManager,
          useValue: mockAliveStreamManager,
        },
        {
          provide: ConnectorRegistryService,
          useValue: mockConnectorRegistryService,
        },
        {
          provide: WorkerTelemetryService,
          useValue: mockWorkerTelemetryService,
        },
        {
          provide: EventBridgeService,
          useValue: mockEventBridge,
        },
      ],
    }).compile();

    service = module.get<WorkersService>(WorkersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('autoCleanupWorkersAndJobs', () => {
    it('should delete stale workers without active streams', async () => {
      const staleWorker = {
        id: 'worker-1',
        lastSeenAt: new Date(Date.now() - 120000),
      } as WorkerInstance;

      (mockWorkerInstanceRepository.find as jest.Mock).mockResolvedValue([
        staleWorker,
      ]);
      (mockAliveStreamManager.isActive as jest.Mock).mockReturnValue(false);

      // Mock workerLeave dependencies
      (mockJobsRegistryService.repo as any).execute = jest.fn();
      (mockWorkerInstanceRepository.delete as jest.Mock).mockResolvedValue({
        affected: 1,
      });
      // Mock resetStuckAndFailedJobs
      (mockWorkerInstanceRepository.manager as any) = {
        query: jest.fn().mockResolvedValue(undefined),
      };

      await service.autoCleanupWorkersAndJobs();

      expect(mockAliveStreamManager.isActive).toHaveBeenCalledWith('worker-1');
      expect(mockWorkerInstanceRepository.delete).toHaveBeenCalledWith(
        'worker-1',
      );
    });

    it('should skip stale workers that have active streams', async () => {
      const staleWorker = {
        id: 'worker-1',
        lastSeenAt: new Date(Date.now() - 120000),
      } as WorkerInstance;

      (mockWorkerInstanceRepository.find as jest.Mock).mockResolvedValue([
        staleWorker,
      ]);
      (mockAliveStreamManager.isActive as jest.Mock).mockReturnValue(true);

      // Mock resetStuckAndFailedJobs
      (mockWorkerInstanceRepository.manager as any) = {
        query: jest.fn().mockResolvedValue(undefined),
      };

      await service.autoCleanupWorkersAndJobs();

      expect(mockAliveStreamManager.isActive).toHaveBeenCalledWith('worker-1');
      expect(mockWorkerInstanceRepository.delete).not.toHaveBeenCalled();
    });

    it('should handle mixed workers: some active, some stale', async () => {
      const activeStreamWorker = {
        id: 'worker-1',
        lastSeenAt: new Date(Date.now() - 120000),
      } as WorkerInstance;
      const trulyStaleWorker = {
        id: 'worker-2',
        lastSeenAt: new Date(Date.now() - 120000),
      } as WorkerInstance;

      (mockWorkerInstanceRepository.find as jest.Mock).mockResolvedValue([
        activeStreamWorker,
        trulyStaleWorker,
      ]);
      (mockAliveStreamManager.isActive as jest.Mock)
        .mockReturnValueOnce(true) // worker-1 has active stream
        .mockReturnValueOnce(false); // worker-2 does not

      // Mock workerLeave dependencies
      (mockJobsRegistryService.repo as any).execute = jest.fn();
      (mockWorkerInstanceRepository.delete as jest.Mock).mockResolvedValue({
        affected: 1,
      });
      // Mock resetStuckAndFailedJobs
      (mockWorkerInstanceRepository.manager as any) = {
        query: jest.fn().mockResolvedValue(undefined),
      };

      await service.autoCleanupWorkersAndJobs();

      expect(mockWorkerInstanceRepository.delete).toHaveBeenCalledTimes(1);
      expect(mockWorkerInstanceRepository.delete).toHaveBeenCalledWith(
        'worker-2',
      );
    });

    it('should handle no stale workers', async () => {
      (mockWorkerInstanceRepository.find as jest.Mock).mockResolvedValue([]);

      // Mock resetStuckAndFailedJobs
      (mockWorkerInstanceRepository.manager as any) = {
        query: jest.fn().mockResolvedValue(undefined),
      };

      await service.autoCleanupWorkersAndJobs();

      expect(mockAliveStreamManager.isActive).not.toHaveBeenCalled();
      expect(mockWorkerInstanceRepository.delete).not.toHaveBeenCalled();
    });
  });

  describe('requeue of stuck and failed jobs', () => {
    /**
     * Drives `autoCleanupWorkersAndJobs` with no stale workers and captures the
     * requeue SQL — the only place these rules live.
     */
    const captureRequeueSql = async () => {
      const query = jest.fn().mockResolvedValue(undefined);
      (mockWorkerInstanceRepository as any).manager = { query };
      (mockWorkerInstanceRepository.find as jest.Mock).mockResolvedValue([]);

      await service.autoCleanupWorkersAndJobs();

      return String(query.mock.calls[0][0]);
    };

    it('requeues IN_PROGRESS jobs whose worker row is gone', async () => {
      const sql = await captureRequeueSql();

      expect(sql).toContain(`j.status = '${JobStatus.IN_PROGRESS}'`);
      expect(sql).toContain('SELECT id FROM workers');
      expect(sql).toContain(`status = '${JobStatus.PENDING}'`);
      expect(sql).toContain('"workerId" = NULL');
    });

    it('never requeues a job with no asset, because nothing can ever claim it', async () => {
      // getNextJob INNER JOINs assets, so an asset-less job — what
      // persistFailedConfigJob writes when a config profile is orphaned — can
      // never be picked up. Requeueing it left the row PENDING forever and
      // pinned its run at "in progress", because no execution could finish it.
      const sql = await captureRequeueSql();

      expect(sql).toContain('j."assetId" IS NOT NULL');
    });

    it('leaves FAILED jobs untouched once their retries are spent', async () => {
      // They used to be matched by the WHERE and rewritten to the same value on
      // every sweep, which only produced dead tuples.
      const sql = await captureRequeueSql();

      expect(sql).toContain('j."retryCount" < 4');
      expect(sql).not.toContain('ELSE j.status');
    });
  });

  describe('join - runMode', () => {
    beforeEach(() => {
      // Default config: no cloud key
      (mockConfigService.get as jest.Mock).mockImplementation((key: string) => {
        if (key === 'OASM_CLOUD_APIKEY') return '';
        return undefined;
      });
    });

    it('should save runMode "node" when join with numeric mode=2', async () => {
      mockJoinKeyService.consume.mockResolvedValue({
        id: 'jk-1',
        workspaceId: 'ws-1',
        createdBy: 'u-1',
        createdAt: '2026-10-17T00:00:00.000Z',
      });
      (mockWorkerInstanceRepository.save as jest.Mock).mockImplementation(
        (data: Record<string, unknown>) => data,
      );
      (mockWorkerInstanceRepository.findOne as jest.Mock).mockImplementation(
        (opts: Record<string, unknown>) => {
          const where = opts.where as Record<string, unknown> | undefined;
          if (where?.token) return null;
          return { id: 'w-1', token: 'tok-new', runMode: 'node' };
        },
      );
      (mockWorkerInstanceRepository as any).manager = {
        query: jest.fn().mockResolvedValue(undefined),
      };

      const result = await service.join({
        apiKey: 'api-key-1',
        metadata: { name: 'test', os: 'linux', mode: 2 },
      });

      const saveCall = (mockWorkerInstanceRepository.save as jest.Mock).mock
        .calls[0][0];
      expect(saveCall.runMode).toBe('node');
      expect(result.runMode).toBe('node');
    });

    it('should save runMode "node" when join with enum-string mode (grpc enums:String)', async () => {
      mockJoinKeyService.consume.mockResolvedValue({
        id: 'jk-1',
        workspaceId: 'ws-1',
        createdBy: 'u-1',
        createdAt: '2026-10-17T00:00:00.000Z',
      });
      (mockWorkerInstanceRepository.save as jest.Mock).mockImplementation(
        (data: Record<string, unknown>) => data,
      );
      (mockWorkerInstanceRepository.findOne as jest.Mock).mockImplementation(
        (opts: Record<string, unknown>) => {
          const where = opts.where as Record<string, unknown> | undefined;
          if (where?.token) return null;
          return { id: 'w-1', token: 'tok-new', runMode: 'node' };
        },
      );
      (mockWorkerInstanceRepository as any).manager = {
        query: jest.fn().mockResolvedValue(undefined),
      };

      const result = await service.join({
        apiKey: 'api-key-1',
        metadata: { name: 'test', os: 'linux', mode: 'WORKER_RUN_MODE_NODE' },
      });

      const saveCall = (mockWorkerInstanceRepository.save as jest.Mock).mock
        .calls[0][0];
      expect(saveCall.runMode).toBe('node');
      expect(result.runMode).toBe('node');
    });

    it('should save runMode "cli" when join with numeric mode=1', async () => {
      mockJoinKeyService.consume.mockResolvedValue({
        id: 'jk-1',
        workspaceId: 'ws-1',
        createdBy: 'u-1',
        createdAt: '2026-10-17T00:00:00.000Z',
      });
      (mockWorkerInstanceRepository.save as jest.Mock).mockImplementation(
        (data: Record<string, unknown>) => data,
      );
      (mockWorkerInstanceRepository.findOne as jest.Mock).mockImplementation(
        (opts: Record<string, unknown>) => {
          const where = opts.where as Record<string, unknown> | undefined;
          if (where?.token) return null;
          return { id: 'w-1', token: 'tok-new', runMode: 'cli' };
        },
      );
      (mockWorkerInstanceRepository as any).manager = {
        query: jest.fn().mockResolvedValue(undefined),
      };

      const result = await service.join({
        apiKey: 'api-key-1',
        metadata: { name: 'test', os: 'linux', mode: 1 },
      });

      const saveCall = (mockWorkerInstanceRepository.save as jest.Mock).mock
        .calls[0][0];
      expect(saveCall.runMode).toBe('cli');
      expect(result.runMode).toBe('cli');
    });

    it('should save runMode null when join with no mode (legacy worker)', async () => {
      mockJoinKeyService.consume.mockResolvedValue({
        id: 'jk-1',
        workspaceId: 'ws-1',
        createdBy: 'u-1',
        createdAt: '2026-10-17T00:00:00.000Z',
      });
      (mockWorkerInstanceRepository.save as jest.Mock).mockImplementation(
        (data: Record<string, unknown>) => data,
      );
      (mockWorkerInstanceRepository.findOne as jest.Mock).mockImplementation(
        (opts: Record<string, unknown>) => {
          const where = opts.where as Record<string, unknown> | undefined;
          if (where?.token) return null;
          return { id: 'w-1', token: 'tok-new', runMode: null };
        },
      );
      (mockWorkerInstanceRepository as any).manager = {
        query: jest.fn().mockResolvedValue(undefined),
      };

      const result = await service.join({
        apiKey: 'api-key-1',
        metadata: { name: 'test', os: 'linux' },
        // mode is undefined — legacy worker
      });

      const saveCall = (mockWorkerInstanceRepository.save as jest.Mock).mock
        .calls[0][0];
      expect(saveCall.runMode).toBeNull();
      expect(result.runMode).toBeNull();
    });

    it('should update runMode on token rejoin when mode changed', async () => {
      const existingWorker = {
        id: 'w-existing',
        token: 'tok-existing',
        runMode: 'cli',
      };
      const updatedWorker = {
        ...existingWorker,
        runMode: 'node',
      };
      // The join key was consumed on the first join; the token alone resumes.
      (mockWorkerInstanceRepository.findOne as jest.Mock).mockImplementation(
        (opts: Record<string, unknown>) => {
          const where = opts.where as Record<string, unknown> | undefined;
          if (where?.token === 'tok-existing') return existingWorker;
          if (where?.id === 'w-existing') return updatedWorker;
          return null;
        },
      );
      (mockWorkerInstanceRepository.update as jest.Mock).mockResolvedValue(
        undefined,
      );
      (mockWorkerInstanceRepository as any).manager = {
        query: jest.fn().mockResolvedValue(undefined),
      };

      const result = await service.join({
        apiKey: 'api-key-1',
        token: 'tok-existing',
        metadata: { name: 'test', os: 'linux', mode: 2 },
      });

      expect(mockWorkerInstanceRepository.update).toHaveBeenCalledWith(
        { id: 'w-existing' },
        expect.objectContaining({ runMode: 'node' }),
      );
      expect(result.runMode).toBe('node');
    });

    it('should NOT update runMode on token rejoin when mode unchanged', async () => {
      const existingWorker = {
        id: 'w-existing',
        token: 'tok-existing',
        runMode: 'node',
      };
      (mockWorkerInstanceRepository.findOne as jest.Mock).mockImplementation(
        (opts: Record<string, unknown>) => {
          const where = opts.where as Record<string, unknown> | undefined;
          if (where?.token === 'tok-existing') return existingWorker;
          return null;
        },
      );
      (mockWorkerInstanceRepository.update as jest.Mock).mockResolvedValue(
        undefined,
      );
      (mockWorkerInstanceRepository as any).manager = {
        query: jest.fn().mockResolvedValue(undefined),
      };

      await service.join({
        apiKey: 'api-key-1',
        token: 'tok-existing',
        metadata: { name: 'test', os: 'linux', mode: 2 },
      });

      expect(mockWorkerInstanceRepository.update).not.toHaveBeenCalledWith(
        { id: 'w-existing' },
        expect.objectContaining({ runMode: expect.anything() }),
      );
    });
  });

  describe('join - one-time join keys', () => {
    beforeEach(() => {
      (mockConfigService.get as jest.Mock).mockImplementation((key: string) =>
        key === 'OASM_CLOUD_APIKEY' ? 'cloud-key' : undefined,
      );
      (mockWorkerInstanceRepository.save as jest.Mock).mockImplementation(
        (data: Record<string, unknown>) => data,
      );
      (mockWorkerInstanceRepository as any).manager = {
        query: jest.fn().mockResolvedValue(undefined),
      };
    });

    it('creates a workspace worker for the key and announces it with joinKeyId', async () => {
      mockJoinKeyService.consume.mockResolvedValue({
        id: 'jk-1',
        workspaceId: 'ws-1',
        createdBy: 'u-1',
        createdAt: '2026-10-17T00:00:00.000Z',
      });
      (mockWorkerInstanceRepository.findOne as jest.Mock).mockResolvedValue({
        id: 'w-1',
        workspaceId: 'ws-1',
      });

      await service.join({ apiKey: 'join-key-1' });

      expect(mockJoinKeyService.consume).toHaveBeenCalledWith('join-key-1');
      const saved = (mockWorkerInstanceRepository.save as jest.Mock).mock
        .calls[0][0];
      expect(saved).toMatchObject({
        type: WorkerType.BUILT_IN,
        scope: WorkerScope.WORKSPACE,
        workspace: { id: 'ws-1' },
      });
      expect(mockEventBridge.publishSafely).toHaveBeenCalledWith(
        EVENT_CATALOG.worker.joined,
        expect.objectContaining({
          workspaceId: 'ws-1',
          resourceId: 'w-1',
          metadata: { joinKeyId: 'jk-1' },
        }),
        expect.anything(),
      );
    });

    it('rejects a key that is unknown, expired, already used or a legacy DB key', async () => {
      mockJoinKeyService.consume.mockResolvedValue(null);

      await expect(service.join({ apiKey: 'used-key' })).rejects.toThrow(
        'Join key is invalid, expired or already used',
      );
      expect(mockWorkerInstanceRepository.save).not.toHaveBeenCalled();
      expect(mockEventBridge.publishSafely).not.toHaveBeenCalled();
    });

    it('joins cloud workers with OASM_CLOUD_APIKEY without touching join keys', async () => {
      (mockWorkerInstanceRepository.findOne as jest.Mock).mockResolvedValue({
        id: 'w-cloud',
        workspaceId: null,
      });

      await service.join({ apiKey: 'cloud-key' });

      expect(mockJoinKeyService.consume).not.toHaveBeenCalled();
      const saved = (mockWorkerInstanceRepository.save as jest.Mock).mock
        .calls[0][0];
      expect(saved.scope).toBe(WorkerScope.CLOUD);
    });

    it('resumes a known token when its join key is long gone (restart)', async () => {
      mockJoinKeyService.consume.mockResolvedValue(null);
      (mockWorkerInstanceRepository.findOne as jest.Mock).mockResolvedValue({
        id: 'w-existing',
        token: 'tok-existing',
        workspaceId: 'ws-1',
        scope: WorkerScope.WORKSPACE,
        runMode: null,
      });

      await service.join({ apiKey: 'used-key', token: 'tok-existing' });

      expect(mockWorkerInstanceRepository.save).not.toHaveBeenCalled();
      expect(mockEventBridge.publishSafely).toHaveBeenCalledWith(
        EVENT_CATALOG.worker.rejoined,
        expect.not.objectContaining({ metadata: expect.anything() }),
        expect.anything(),
      );
    });

    it('consumes a live key sent with a token of the same workspace and announces the rejoin with joinKeyId', async () => {
      mockJoinKeyService.consume.mockResolvedValue({
        id: 'jk-1',
        workspaceId: 'ws-1',
        createdBy: 'u-1',
        createdAt: '2026-10-17T00:00:00.000Z',
      });
      (mockWorkerInstanceRepository.findOne as jest.Mock).mockResolvedValue({
        id: 'w-existing',
        token: 'tok-existing',
        workspaceId: 'ws-1',
        scope: WorkerScope.WORKSPACE,
        runMode: null,
      });

      await service.join({ apiKey: 'fresh-key', token: 'tok-existing' });

      expect(mockJoinKeyService.consume).toHaveBeenCalledWith('fresh-key');
      expect(mockWorkerInstanceRepository.save).not.toHaveBeenCalled();
      expect(mockEventBridge.publishSafely).toHaveBeenCalledWith(
        EVENT_CATALOG.worker.rejoined,
        expect.objectContaining({
          resourceId: 'w-existing',
          metadata: { joinKeyId: 'jk-1' },
        }),
        expect.anything(),
      );
    });

    it('creates a new worker when the token belongs to another workspace', async () => {
      mockJoinKeyService.consume.mockResolvedValue({
        id: 'jk-2',
        workspaceId: 'ws-2',
        createdBy: 'u-1',
        createdAt: '2026-10-17T00:00:00.000Z',
      });
      (mockWorkerInstanceRepository.findOne as jest.Mock).mockImplementation(
        (opts: { where: Record<string, unknown> }) =>
          opts.where.token
            ? {
                id: 'w-old',
                token: 'tok-old',
                workspaceId: 'ws-1',
                scope: WorkerScope.WORKSPACE,
              }
            : { id: 'w-new', workspaceId: 'ws-2' },
      );

      await service.join({ apiKey: 'fresh-key', token: 'tok-old' });

      const saved = (mockWorkerInstanceRepository.save as jest.Mock).mock
        .calls[0][0];
      expect(saved).toMatchObject({ workspace: { id: 'ws-2' } });
      expect(saved.token).not.toBe('tok-old');
      expect(mockEventBridge.publishSafely).toHaveBeenCalledWith(
        EVENT_CATALOG.worker.joined,
        expect.objectContaining({
          workspaceId: 'ws-2',
          metadata: { joinKeyId: 'jk-2' },
        }),
        expect.anything(),
      );
    });

    it('rejects an unknown token with no live key', async () => {
      mockJoinKeyService.consume.mockResolvedValue(null);
      (mockWorkerInstanceRepository.findOne as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(
        service.join({ apiKey: 'used-key', token: 'tok-gone' }),
      ).rejects.toThrow('Join key is invalid, expired or already used');
    });
  });

  describe('worker lifecycle events', () => {
    beforeEach(() => {
      (mockWorkerInstanceRepository as any).manager = {
        query: jest.fn().mockResolvedValue(undefined),
      };
    });

    it('publishes worker.timed_out when a stale workspace worker is removed', async () => {
      (mockWorkerInstanceRepository.find as jest.Mock).mockResolvedValue([
        { id: 'worker-1', workspaceId: 'ws-1' } as WorkerInstance,
      ]);
      (mockWorkerInstanceRepository.delete as jest.Mock).mockResolvedValue({
        affected: 1,
      });

      await service.autoCleanupWorkersAndJobs();

      expect(mockEventBridge.publishSafely).toHaveBeenCalledWith(
        EVENT_CATALOG.worker.timed_out,
        expect.objectContaining({
          workspaceId: 'ws-1',
          resourceType: 'worker',
          resourceId: 'worker-1',
        }),
        { subject: 'workspace:ws-1/worker:worker-1' },
      );
    });

    it('does not publish worker.timed_out when another replica removed it first', async () => {
      (mockWorkerInstanceRepository.find as jest.Mock).mockResolvedValue([
        { id: 'worker-1', workspaceId: 'ws-1' } as WorkerInstance,
      ]);
      (mockWorkerInstanceRepository.delete as jest.Mock).mockResolvedValue({
        affected: 0,
      });

      await service.autoCleanupWorkersAndJobs();

      expect(mockEventBridge.publishSafely).not.toHaveBeenCalled();
    });

    it('publishes worker.disconnected when the alive stream drops', async () => {
      (mockWorkerInstanceRepository.findOne as jest.Mock).mockResolvedValue({
        id: 'worker-1',
        workspaceId: 'ws-1',
      });

      await service.workerDisconnected('worker-1');

      expect((mockJobsRegistryService.repo as any).execute).toHaveBeenCalled();
      expect(mockEventBridge.publishSafely).toHaveBeenCalledWith(
        EVENT_CATALOG.worker.disconnected,
        expect.objectContaining({
          workspaceId: 'ws-1',
          resourceId: 'worker-1',
        }),
        expect.anything(),
      );
    });

    it('does not publish for cloud workers, which have no workspace', async () => {
      (mockWorkerInstanceRepository.findOne as jest.Mock).mockResolvedValue({
        id: 'worker-1',
        workspaceId: null,
      });

      await service.workerDisconnected('worker-1');

      expect(mockEventBridge.publishSafely).not.toHaveBeenCalled();
    });

    it('publishes worker.rejoined on a token rejoin', async () => {
      (mockConfigService.get as jest.Mock).mockReturnValue(undefined);
      (mockWorkerInstanceRepository.findOne as jest.Mock).mockResolvedValue({
        id: 'w-existing',
        token: 'tok-existing',
        workspaceId: 'ws-1',
      });

      await service.join({
        apiKey: 'api-key-1',
        token: 'tok-existing',
      });

      expect(mockEventBridge.publishSafely).toHaveBeenCalledWith(
        EVENT_CATALOG.worker.rejoined,
        expect.objectContaining({
          workspaceId: 'ws-1',
          resourceId: 'w-existing',
        }),
        expect.anything(),
      );
    });
  });

  describe('getWorkers - runMode filter', () => {
    it('should include runMode in response when present', async () => {
      const workerNode = {
        id: 'w-1',
        runMode: 'node',
        type: 'BUILT_IN',
        scope: 'CLOUD',
      };

      (
        mockWorkerInstanceRepository.createQueryBuilder as jest.Mock
      ).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[workerNode], 1]),
      });

      (mockJobsRegistryService.repo as any).count = jest
        .fn()
        .mockResolvedValue(0);
      (mockToolsService.getBuiltInTools as jest.Mock).mockResolvedValue({
        data: [],
      });

      const result = await service.getWorkers({
        page: 1,
        limit: 10,
        runMode: 'node',
      } as any);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].runMode).toBe('node');
    });
  });

  describe('getWorkers - built-in tools query hoisting', () => {
    const buildQueryBuilder = (rows: Record<string, unknown>[]) => ({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([rows, rows.length]),
    });

    const runGetWorkers = async (
      rows: Record<string, unknown>[],
      builtInTools: Record<string, unknown>[] = [],
      connectors: Record<string, unknown>[] = [],
    ) => {
      (
        mockWorkerInstanceRepository.createQueryBuilder as jest.Mock
      ).mockReturnValue(buildQueryBuilder(rows));
      (mockJobsRegistryService.repo as any).count = jest
        .fn()
        .mockResolvedValue(0);
      (mockToolsService.getBuiltInTools as jest.Mock).mockResolvedValue({
        data: builtInTools,
      });
      (
        mockConnectorRegistryService.getAllConnectors as jest.Mock
      ).mockReturnValue(connectors);
      return service.getWorkers({ page: 1, limit: 10 } as any);
    };

    it('getWorkers returns toolsCount without the tools array', async () => {
      const result = await runGetWorkers(
        [{ id: 'w-1' }, { id: 'w-2' }, { id: 'w-3' }],
        [{ id: 'bt-1', name: 'subfinder', type: WorkerType.BUILT_IN }],
      );

      expect(mockToolsService.getBuiltInTools).toHaveBeenCalledTimes(1);
      expect(result.data).toHaveLength(3);
      for (const worker of result.data) {
        expect(worker.toolsCount).toBe(1);
        expect(worker).not.toHaveProperty('tools');
      }
    });

    it('getWorkers counts built-ins plus connectors only for node-mode workers', async () => {
      const result = await runGetWorkers(
        [{ id: 'w-node', runMode: 'node' }, { id: 'w-cli' }],
        [
          { id: 'bt-1', name: 'subfinder', type: WorkerType.BUILT_IN },
          { id: 'bt-2', name: 'nuclei', type: WorkerType.BUILT_IN },
        ],
        [
          { slug: 'c-1', name: 'Connector 1', capabilities: [] },
          { slug: 'c-2', name: 'Connector 2', capabilities: [] },
          { slug: 'c-3', name: 'Connector 3', capabilities: [] },
        ],
      );

      expect(result.data).toHaveLength(2);
      expect(result.data[0].toolsCount).toBe(5);
      expect(result.data[1].toolsCount).toBe(2);
      for (const worker of result.data) {
        expect(worker).not.toHaveProperty('tools');
      }
    });
  });

  describe('getWorkerList', () => {
    const createdAt = new Date('2026-10-01T00:00:00Z');
    const lastSeenAt = new Date('2026-10-17T00:00:00Z');

    const mockWorkerQuery = (rows: Record<string, unknown>[]) => {
      const qb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([rows, rows.length]),
      };
      (
        mockWorkerInstanceRepository.createQueryBuilder as jest.Mock
      ).mockReturnValue(qb);
      return qb;
    };

    const mockJobCountQuery = (rows: { workerId: string; count: string }[]) => {
      const qb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(rows),
      };
      (mockJobsRegistryService.repo as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(qb);
      return qb;
    };

    it('returns only the list fields, without tools or a tool join', async () => {
      const workerQb = mockWorkerQuery([
        {
          id: 'w-1',
          name: 'node-1',
          os: 'linux',
          lastSeenAt,
          createdAt,
          internalNetworkId: 'net-1',
        },
      ]);
      mockJobCountQuery([{ workerId: 'w-1', count: '2' }]);
      (mockAliveStreamManager.isActive as jest.Mock).mockReturnValue(true);

      const result = await service.getWorkerList({
        page: 1,
        limit: 10,
        scope: 'cloud',
      } as any);

      expect(workerQb.leftJoinAndSelect).not.toHaveBeenCalled();
      expect(mockToolsService.getBuiltInTools).not.toHaveBeenCalled();
      expect(result.total).toBe(1);
      expect(result.data).toEqual([
        {
          id: 'w-1',
          name: 'node-1',
          os: 'linux',
          isOnline: true,
          lastSeenAt,
          createdAt,
          internalNetworkId: 'net-1',
          currentJobsCount: 2,
        },
      ]);
    });

    it('counts active jobs of the whole page in one grouped query', async () => {
      mockWorkerQuery([{ id: 'w-1' }, { id: 'w-2' }]);
      const jobQb = mockJobCountQuery([{ workerId: 'w-2', count: '3' }]);

      const result = await service.getWorkerList({ page: 1, limit: 10 } as any);

      expect(
        (mockJobsRegistryService.repo as any).createQueryBuilder,
      ).toHaveBeenCalledTimes(1);
      expect(jobQb.where).toHaveBeenCalledWith(
        'j.workerId IN (:...workerIds)',
        {
          workerIds: ['w-1', 'w-2'],
        },
      );
      expect(result.data.map((w) => w.currentJobsCount)).toEqual([0, 3]);
    });

    it('skips the job count query for an empty page', async () => {
      mockWorkerQuery([]);
      const jobQb = mockJobCountQuery([]);

      const result = await service.getWorkerList({ page: 1, limit: 10 } as any);

      expect(jobQb.getRawMany).not.toHaveBeenCalled();
      expect(result.data).toEqual([]);
    });
  });

  describe('getWorkerById', () => {
    const workerId = '11111111-1111-4111-8111-111111111111';
    const workspaceId = '22222222-2222-4222-8222-222222222222';

    const builtInToolFixtures = [
      {
        id: 'bt-1',
        name: 'subfinder',
        logoUrl: 'https://example.com/subfinder.png',
        categories: [{ name: 'subdomains', targetTypes: [] }],
        type: WorkerType.BUILT_IN,
      },
      {
        id: 'bt-2',
        name: 'nuclei',
        logoUrl: null,
        categories: [{ name: 'vulnerabilities', targetTypes: [] }],
        type: WorkerType.BUILT_IN,
      },
    ];

    const connectorFixtures = [
      { slug: 'c-1', name: 'Connector 1', logo: true, capabilities: [] },
      { slug: 'c-2', name: 'Connector 2', logo: false, capabilities: [] },
      { slug: 'c-3', name: 'Connector 3', logo: true, capabilities: [] },
    ];

    /** Stands in for the raw-value query builder `getRunningJobsByTool` uses. */
    const buildRunningJobsQuery = (rows: Record<string, unknown>[]) => ({
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(rows),
    });

    const runGetWorkerById = async (
      worker: Record<string, unknown> | null,
      builtInTools: Record<string, unknown>[] = [],
      connectors: Record<string, unknown>[] = [],
      runningJobRows: Record<string, unknown>[] = [],
      telemetry?: Record<string, unknown> | null,
    ) => {
      (mockWorkerInstanceRepository.findOne as jest.Mock).mockResolvedValue(
        worker,
      );
      (mockJobsRegistryService.repo as any).count = jest
        .fn()
        .mockResolvedValue(0);
      (mockJobsRegistryService.repo as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(buildRunningJobsQuery(runningJobRows));
      (mockToolsService.getBuiltInTools as jest.Mock).mockResolvedValue({
        data: builtInTools,
      });
      (
        mockConnectorRegistryService.getAllConnectors as jest.Mock
      ).mockReturnValue(connectors);
      if (telemetry !== undefined) {
        (mockWorkerTelemetryService.get as jest.Mock).mockResolvedValue(
          telemetry,
        );
      }
      return service.getWorkerById(workerId, workspaceId);
    };

    const containerTelemetry = (tools: string[]) => ({
      schemaVersion: 1,
      workerId,
      instanceId: 'instance-1',
      sequence: '12',
      state: 'READY',
      freshness: 'fresh',
      containers: {
        supported: true,
        total: tools.length,
        active: tools.length,
        idle: 0,
        unhealthy: 0,
        truncated: false,
        items: tools.map((tool, index) => ({
          containerId: `container-${index}`,
          containerName: `oasm-${tool}-${index}`,
          image: `example/${tool}:latest`,
          imageVersion: '1.0.0',
          tool,
          poolKey: `example/${tool}:latest`,
          pooled: true,
          runtimeState: 'RUNNING',
          healthState: 'HEALTHY',
          executionState: 'NONE',
          connectorConnected: true,
          oomKilled: false,
          cpuLimitMillicores: 1000,
          memoryLimitBytes: '1073741824',
          inspectionSucceeded: true,
        })),
      },
    });

    it('returns built-in tools only for a cli worker and keeps toolsCount in sync', async () => {
      const result = await runGetWorkerById(
        { id: workerId, workspaceId, runMode: 'cli', name: 'cli-1' },
        builtInToolFixtures,
        connectorFixtures,
      );

      expect(result.tools).toHaveLength(2);
      expect(result.toolsCount).toBe(result.tools.length);
      expect(result.tools).toEqual([
        {
          id: 'bt-1',
          name: 'subfinder',
          logoUrl: 'https://example.com/subfinder.png',
          categories: ['subdomains'],
          type: 'builtin',
          currentJobs: [],
        },
        {
          id: 'bt-2',
          name: 'nuclei',
          logoUrl: null,
          categories: ['vulnerabilities'],
          type: 'builtin',
          currentJobs: [],
        },
      ]);
      expect(result.runMode).toBe('cli');
    });

    it('appends connectors for a node worker and exposes the slug as both id and name', async () => {
      const result = await runGetWorkerById(
        { id: workerId, workspaceId, runMode: 'node' },
        builtInToolFixtures,
        connectorFixtures,
        [],
        containerTelemetry(['c-1', 'c-2']),
      );

      expect(result.tools).toHaveLength(4);
      expect(result.toolsCount).toBe(4);
      expect(result.toolsCount).toBe(result.tools.length);

      const connectors = result.tools.filter(
        (tool) => tool.type === 'connector',
      );
      expect(connectors).toEqual([
        {
          id: 'c-1',
          name: 'c-1',
          logoUrl: '/connectors/c-1.png',
          type: 'connector',
          currentJobs: [],
        },
        {
          id: 'c-2',
          name: 'c-2',
          logoUrl: undefined,
          type: 'connector',
          currentJobs: [],
        },
      ]);
    });

    it('excludes a connector with a running job but no container', async () => {
      const result = await runGetWorkerById(
        { id: workerId, workspaceId, runMode: 'node' },
        builtInToolFixtures,
        connectorFixtures,
        [{ tool: 'c-1', target: 'example.com', service: null }],
        containerTelemetry(['c-2']),
      );

      expect(result.tools.filter((tool) => tool.type === 'connector')).toEqual([
        expect.objectContaining({ name: 'c-2', currentJobs: [] }),
      ]);
      expect(result.tools.find((tool) => tool.name === 'c-1')).toBeUndefined();
    });

    it('keeps a connector with a container even when it has no running job', async () => {
      const result = await runGetWorkerById(
        { id: workerId, workspaceId, runMode: 'node' },
        builtInToolFixtures,
        connectorFixtures,
        [],
        containerTelemetry(['c-3']),
      );

      expect(result.tools.filter((tool) => tool.type === 'connector')).toEqual([
        expect.objectContaining({ name: 'c-3', currentJobs: [] }),
      ]);
    });

    it('groups the worker running jobs under the tool that executes them', async () => {
      const result = await runGetWorkerById(
        { id: workerId, workspaceId, runMode: 'node' },
        builtInToolFixtures,
        connectorFixtures,
        [
          // Connector job: `Tool.name` is the connector slug. These are the raw
          // columns the query projects.
          { tool: 'c-1', target: 'example.com', service: null },
          // Built-in job with a concrete service.
          {
            tool: 'nuclei',
            target: 'api.example.com',
            service: 'https://api.example.com:8443',
          },
          // Asset-service-only job: no asset row, the service carries the label.
          { tool: 'c-2', target: null, service: '10.0.0.5:9200' },
          // Job whose tool relation was dropped — skipped, never crashed on.
          { tool: null, target: null, service: null },
        ],
        containerTelemetry(['c-1', 'c-2']),
      );

      const byName = new Map(result.tools.map((tool) => [tool.name, tool]));
      expect(byName.get('c-1')?.currentJobs).toEqual([
        { target: 'example.com', service: undefined },
      ]);
      expect(byName.get('nuclei')?.currentJobs).toEqual([
        { target: 'api.example.com', service: 'https://api.example.com:8443' },
      ]);
      expect(byName.get('c-2')?.currentJobs).toEqual([
        { target: '10.0.0.5:9200', service: '10.0.0.5:9200' },
      ]);
      expect(byName.get('subfinder')?.currentJobs).toEqual([]);
    });

    it('throws NotFoundException when the worker does not exist', async () => {
      await expect(
        runGetWorkerById(null, builtInToolFixtures, connectorFixtures),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the worker belongs to another workspace', async () => {
      await expect(
        runGetWorkerById(
          {
            id: workerId,
            workspaceId: '33333333-3333-4333-8333-333333333333',
            runMode: 'cli',
          },
          builtInToolFixtures,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('does not throw for a cloud worker that has no workspace', async () => {
      const result = await runGetWorkerById(
        {
          id: workerId,
          workspaceId: null,
          scope: WorkerScope.CLOUD,
          runMode: 'cli',
        },
        builtInToolFixtures,
      );

      expect(result.id).toBe(workerId);
    });

    it('includes the Redis telemetry snapshot without persisting it on the entity', async () => {
      const telemetry = {
        schemaVersion: 1,
        workerId,
        instanceId: 'instance-1',
        sequence: '12',
        state: 'READY',
        freshness: 'fresh',
      };
      (mockWorkerTelemetryService.get as jest.Mock).mockResolvedValue(
        telemetry,
      );

      const result = await runGetWorkerById(
        { id: workerId, workspaceId, runMode: 'cli' },
        builtInToolFixtures,
      );

      expect(result.telemetry).toEqual(telemetry);
      expect(mockWorkerTelemetryService.get).toHaveBeenCalledWith(workerId);
    });

    it('never exposes the worker token', async () => {
      const result = await runGetWorkerById(
        {
          id: workerId,
          workspaceId,
          runMode: 'cli',
          token: 'super-secret-token',
        },
        builtInToolFixtures,
      );

      expect(result).not.toHaveProperty('token');
      expect(JSON.stringify(result)).not.toContain('super-secret-token');
    });

    it('exposes the bound tool as an id/name pair and null when absent', async () => {
      const withTool = await runGetWorkerById(
        {
          id: workerId,
          workspaceId,
          runMode: 'cli',
          tool: { id: 'tool-1', name: 'nuclei', token: 'nope' },
        },
        builtInToolFixtures,
      );
      expect(withTool.tool).toEqual({ id: 'tool-1', name: 'nuclei' });

      const withoutTool = await runGetWorkerById(
        { id: workerId, workspaceId, runMode: 'cli', tool: null },
        builtInToolFixtures,
      );
      expect(withoutTool.tool).toBeNull();
    });
  });

  describe('isAgentWorkerForWorkspace', () => {
    it('accepts a worker of the same workspace or a global agent worker', async () => {
      (mockWorkerInstanceRepository.exists as jest.Mock).mockResolvedValue(
        true,
      );

      await expect(
        service.isAgentWorkerForWorkspace('w1', 'ws-1'),
      ).resolves.toBe(true);
      expect(mockWorkerInstanceRepository.exists).toHaveBeenCalledWith({
        where: [
          { id: 'w1', workspaceId: 'ws-1', scope: WorkerScope.WORKSPACE },
          {
            id: 'w1',
            scope: WorkerScope.CLOUD,
            type: WorkerType.BUILT_IN,
            enabledAgentMode: true,
          },
        ],
      });
    });
  });

  describe('setAgentMode', () => {
    it('writes the agent mode flag of the worker', async () => {
      await service.setAgentMode('w1', false);
      expect(mockWorkerInstanceRepository.update).toHaveBeenCalledWith('w1', {
        enabledAgentMode: false,
      });

      await service.enableAgentMode('w2');
      expect(mockWorkerInstanceRepository.update).toHaveBeenCalledWith('w2', {
        enabledAgentMode: true,
      });
    });
  });

  describe('handleRemoteExecuteResult', () => {
    const published = () =>
      JSON.parse(
        (mockRedisService.publish as jest.Mock).mock.calls[0][1] as string,
      ) as { type: unknown; data: string };

    it('publishes output as text', async () => {
      await service.handleRemoteExecuteResult({
        id: 'c1',
        sessionId: 's1',
        type: 'REMOTE_EXECUTE_RESULT_STDOUT' as never,
        data: Buffer.from('héllo\n'),
        exitCode: 0,
      });
      expect(mockRedisService.publish).toHaveBeenCalledWith(
        'remote-execute:results:s1',
        expect.any(String),
      );
      expect(published().data).toBe('héllo\n');
    });

    it('publishes a screenshot as base64, which survives JSON', async () => {
      const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x80, 0xfe]);
      await service.handleRemoteExecuteResult({
        id: 'c1',
        sessionId: 's1',
        type: 'REMOTE_EXECUTE_RESULT_IMAGE' as never,
        data: jpeg,
        exitCode: 0,
      });
      expect(Buffer.from(published().data, 'base64')).toEqual(jpeg);
    });
  });

  describe('getWorkers - agentWorkspaceId filter', () => {
    it("limits to the workspace's own workers and global (cloud + built-in) ones", async () => {
      const qb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      (
        mockWorkerInstanceRepository.createQueryBuilder as jest.Mock
      ).mockReturnValue(qb);
      (mockToolsService.getBuiltInTools as jest.Mock).mockResolvedValue({
        data: [],
      });

      await service.getWorkers(
        { page: 1, limit: 10, enabledAgentMode: true } as any,
        { agentWorkspaceId: 'ws-1' },
      );

      const call = (qb.andWhere.mock.calls as [string, unknown][]).find(
        ([sql]) => sql.includes(':agentWorkspaceId'),
      );
      expect(call).toBeDefined();
      const [sql, params] = call!;
      expect(sql).toContain(
        '(w."scope" = :agentCloudScope AND w."type" = :agentGlobalType)',
      );
      expect(params).toEqual({
        agentWorkspaceScope: WorkerScope.WORKSPACE,
        agentWorkspaceId: 'ws-1',
        agentCloudScope: WorkerScope.CLOUD,
        agentGlobalType: WorkerType.BUILT_IN,
      });
    });
  });
});
