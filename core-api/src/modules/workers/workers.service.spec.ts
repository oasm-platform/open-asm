import { WorkerType } from '@/common/enums/enum';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { ApiKeysService } from '../apikeys/apikeys.service';
import { Asset } from '../assets/entities/assets.entity';
import { ConnectorRegistryService } from '../connectors/connector-registry.service';
import { JobsRegistryService } from '../jobs-registry/jobs-registry.service';
import { InternalNetwork } from '../internal-networks/entities/internal-network.entity';
import { NetworkInterface } from '../internal-networks/entities/network-interface.entity';
import { WorkspaceTool } from '../tools/entities/workspace_tools.entity';
import { ToolsService } from '../tools/tools.service';
import { RedisService } from '@/services/redis/redis.service';
import { AliveStreamManager } from './alive-stream-manager.service';
import { WorkerInstance } from './entities/worker.entity';
import { WorkersService } from './workers.service';

describe('WorkersService', () => {
  let service: WorkersService;
  let mockWorkerInstanceRepository: Partial<Repository<WorkerInstance>>;
  let mockAssetRepository: Partial<Repository<any>>;
  let mockWorkspaceToolRepository: Partial<Repository<any>>;
  let mockInternalNetworkRepository: Partial<Repository<any>>;
  let mockNetworkInterfaceRepository: Partial<Repository<any>>;
  let mockJobsRegistryService: Partial<JobsRegistryService>;
  let mockApiKeysService: Partial<ApiKeysService>;
  let mockConfigService: Partial<ConfigService>;
  let mockToolsService: Partial<ToolsService>;
  let mockRedisService: Partial<RedisService>;
  let mockAliveStreamManager: Partial<AliveStreamManager>;
  let mockConnectorRegistryService: Partial<ConnectorRegistryService>;

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

    mockApiKeysService = {
      apiKeysRepository: {
        findOne: jest.fn(),
      },
    } as any;

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
          provide: ApiKeysService,
          useValue: mockApiKeysService,
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
      (mockWorkerInstanceRepository.delete as jest.Mock).mockResolvedValue(
        undefined,
      );
      // Mock resetStuckAndFailedJobs
      (mockWorkerInstanceRepository.manager as any) = {
        query: jest.fn().mockResolvedValue(undefined),
      };

      await service.autoCleanupWorkersAndJobs();

      expect(mockAliveStreamManager.isActive).toHaveBeenCalledWith(
        'worker-1',
      );
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

      expect(mockAliveStreamManager.isActive).toHaveBeenCalledWith(
        'worker-1',
      );
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
      (mockWorkerInstanceRepository.delete as jest.Mock).mockResolvedValue(
        undefined,
      );
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

  describe('join - runMode', () => {
    const WORKER_SIG = 'test-sig';

    beforeEach(() => {
      // Default config: empty signature (matches empty from worker), no cloud key
      (mockConfigService.get as jest.Mock).mockImplementation(
        (key: string) => {
          if (key === 'WORKER_SIGNATURE') return WORKER_SIG;
          if (key === 'OASM_CLOUD_APIKEY') return '';
          return undefined;
        },
      );
    });

    it('should save runMode "node" when join with numeric mode=2', async () => {
      (mockApiKeysService.apiKeysRepository.findOne as jest.Mock).mockResolvedValue(
        { id: 'key-1', type: 'WORKSPACE', ref: 'ws-1', key: 'api-key-1' },
      );
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
        signature: WORKER_SIG,
        metadata: { name: 'test', os: 'linux', mode: 2 },
      });

      const saveCall = (mockWorkerInstanceRepository.save as jest.Mock).mock
        .calls[0][0];
      expect(saveCall.runMode).toBe('node');
      expect(result.runMode).toBe('node');
    });

    it('should save runMode "node" when join with enum-string mode (grpc enums:String)', async () => {
      (mockApiKeysService.apiKeysRepository.findOne as jest.Mock).mockResolvedValue(
        { id: 'key-1', type: 'WORKSPACE', ref: 'ws-1', key: 'api-key-1' },
      );
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
        signature: WORKER_SIG,
        metadata: { name: 'test', os: 'linux', mode: 'WORKER_RUN_MODE_NODE' },
      });

      const saveCall = (mockWorkerInstanceRepository.save as jest.Mock).mock
        .calls[0][0];
      expect(saveCall.runMode).toBe('node');
      expect(result.runMode).toBe('node');
    });

    it('should save runMode "cli" when join with numeric mode=1', async () => {
      (mockApiKeysService.apiKeysRepository.findOne as jest.Mock).mockResolvedValue(
        { id: 'key-1', type: 'WORKSPACE', ref: 'ws-1', key: 'api-key-1' },
      );
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
        signature: WORKER_SIG,
        metadata: { name: 'test', os: 'linux', mode: 1 },
      });

      const saveCall = (mockWorkerInstanceRepository.save as jest.Mock).mock
        .calls[0][0];
      expect(saveCall.runMode).toBe('cli');
      expect(result.runMode).toBe('cli');
    });

    it('should save runMode null when join with no mode (legacy worker)', async () => {
      (mockApiKeysService.apiKeysRepository.findOne as jest.Mock).mockResolvedValue(
        { id: 'key-1', type: 'WORKSPACE', ref: 'ws-1', key: 'api-key-1' },
      );
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
        signature: WORKER_SIG,
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
      // API key must be valid for the join to pass validation
      (mockApiKeysService.apiKeysRepository.findOne as jest.Mock).mockResolvedValue(
        { id: 'key-1', type: 'WORKSPACE', ref: 'ws-1', key: 'api-key-1' },
      );
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
        signature: WORKER_SIG,
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
      (mockApiKeysService.apiKeysRepository.findOne as jest.Mock).mockResolvedValue(
        { id: 'key-1', type: 'WORKSPACE', ref: 'ws-1', key: 'api-key-1' },
      );
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
        signature: WORKER_SIG,
        token: 'tok-existing',
        metadata: { name: 'test', os: 'linux', mode: 2 },
      });

      expect(mockWorkerInstanceRepository.update).not.toHaveBeenCalledWith(
        { id: 'w-existing' },
        expect.objectContaining({ runMode: expect.anything() }),
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

      (mockWorkerInstanceRepository.createQueryBuilder as jest.Mock).mockReturnValue({
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

  describe('getWorkers - connector tool shaping (#2 #3 #7 #8)', () => {
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

    const runGetWorkers = async (rows: Record<string, unknown>[]) => {
      (mockWorkerInstanceRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        buildQueryBuilder(rows),
      );
      (mockJobsRegistryService.repo as any).count = jest
        .fn()
        .mockResolvedValue(0);
      return service.getWorkers({ page: 1, limit: 10 } as any);
    };

    it('worker tools maps connector category from capabilities', async () => {
      (mockConnectorRegistryService.getAllConnectors as jest.Mock).mockReturnValue([
        {
          slug: 'nuclei',
          name: 'Nuclei',
          version: '1.0.0',
          image: 'image',
          capabilities: ['subdomains'],
        },
      ]);

      const result = await runGetWorkers([{ id: 'w-1', runMode: 'node' }]);

      expect(result.data[0].tools).toHaveLength(1);
      expect(result.data[0].tools[0]).toMatchObject({
        id: 'nuclei',
        category: 'subdomains',
      });
      expect(result.data[0].tools[0].category).not.toBe('vulnerabilities');
    });

    it('worker tools defaults category when capabilities absent', async () => {
      (mockConnectorRegistryService.getAllConnectors as jest.Mock).mockReturnValue([
        { slug: 'wpscan', name: 'WPScan' } as any,
      ]);

      const result = await runGetWorkers([{ id: 'w-1', runMode: 'node' }]);

      expect(result.data[0].tools).toHaveLength(1);
      expect(result.data[0].tools[0]).toMatchObject({
        id: 'wpscan',
        category: 'vulnerabilities',
      });
    });

    it('getMany hoists built-in tools query to single call', async () => {
      (mockConnectorRegistryService.getAllConnectors as jest.Mock).mockReturnValue(
        [],
      );
      (mockToolsService.getBuiltInTools as jest.Mock).mockResolvedValue({
        data: [{ id: 'bt-1', name: 'subfinder', type: WorkerType.BUILT_IN }],
      });

      const result = await runGetWorkers([
        { id: 'w-1' },
        { id: 'w-2' },
        { id: 'w-3' },
      ]);

      expect(mockToolsService.getBuiltInTools).toHaveBeenCalledTimes(1);
      expect(result.data).toHaveLength(3);
      for (const worker of result.data) {
        expect(worker.tools).toEqual([
          expect.objectContaining({ id: 'bt-1', name: 'subfinder' }),
        ]);
      }
    });

    it('worker tools marks connectors distinctly with stored logo', async () => {
      (mockConnectorRegistryService.getAllConnectors as jest.Mock).mockReturnValue([
        {
          slug: 'nuclei',
          name: 'Nuclei',
          version: '1.0.0',
          image: 'image',
          capabilities: ['vulnerabilities'],
          logo: 'aGVsbG8=',
        },
        {
          slug: 'wpscan',
          name: 'WPScan',
          version: '1.0.0',
          image: 'image',
          capabilities: ['vulnerabilities'],
        } as any,
      ]);

      const result = await runGetWorkers([{ id: 'w-1', runMode: 'node' }]);
      const tools = result.data[0].tools as Array<Record<string, unknown>>;

      expect(tools).toHaveLength(2);
      const nuclei = tools.find((t) => t.id === 'nuclei');
      expect(nuclei?.type).toBe(WorkerType.CONNECTOR);
      expect(nuclei?.logoUrl).toBe('/connectors/nuclei.png');
      expect(String(nuclei?.logoUrl)).not.toContain('data:image/png;base64');
      const wpscan = tools.find((t) => t.id === 'wpscan');
      expect(wpscan?.type).toBe(WorkerType.CONNECTOR);
      expect(wpscan?.logoUrl).toBeUndefined();
    });

    it('cli worker gets builtin tools only (no connectors)', async () => {
      (mockConnectorRegistryService.getAllConnectors as jest.Mock).mockReturnValue([
        {
          slug: 'nuclei',
          name: 'Nuclei',
          version: '1.0.0',
          image: 'image',
          capabilities: ['subdomains'],
        },
      ]);
      (mockToolsService.getBuiltInTools as jest.Mock).mockResolvedValue({
        data: [{ id: 'bt-1', name: 'subfinder', type: WorkerType.BUILT_IN }],
      });

      const result = await runGetWorkers([{ id: 'w-1', runMode: 'cli' }]);

      expect(result.data[0].tools).toHaveLength(1);
      expect(result.data[0].tools[0]).toMatchObject({
        id: 'bt-1',
        name: 'subfinder',
      });
      expect(result.data[0].tools.some((t: any) => t.id === 'nuclei')).toBe(false);
    });

    it('worker without runMode (legacy) gets builtin tools only', async () => {
      (mockConnectorRegistryService.getAllConnectors as jest.Mock).mockReturnValue([
        {
          slug: 'nuclei',
          name: 'Nuclei',
          version: '1.0.0',
          image: 'image',
          capabilities: ['subdomains'],
        },
      ]);
      (mockToolsService.getBuiltInTools as jest.Mock).mockResolvedValue({
        data: [{ id: 'bt-1', name: 'subfinder', type: WorkerType.BUILT_IN }],
      });

      const result = await runGetWorkers([{ id: 'w-1' }]);

      expect(result.data[0].tools).toHaveLength(1);
      expect(result.data[0].tools.some((t: any) => t.id === 'nuclei')).toBe(false);
    });

    it('node worker gets builtin tools plus connectors', async () => {
      (mockConnectorRegistryService.getAllConnectors as jest.Mock).mockReturnValue([
        {
          slug: 'nuclei',
          name: 'Nuclei',
          version: '1.0.0',
          image: 'image',
          capabilities: ['subdomains'],
        },
      ]);
      (mockToolsService.getBuiltInTools as jest.Mock).mockResolvedValue({
        data: [{ id: 'bt-1', name: 'subfinder', type: WorkerType.BUILT_IN }],
      });

      const result = await runGetWorkers([{ id: 'w-1', runMode: 'node' }]);

      const tools = result.data[0].tools as Array<Record<string, unknown>>;
      const ids = tools.map((t) => t.id);
      expect(ids).toContain('bt-1');
      expect(ids).toContain('nuclei');
    });
  });
});
