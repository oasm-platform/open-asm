import { WorkerScope, WorkerType } from '@/common/enums/enum';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
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
      (mockWorkerInstanceRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        buildQueryBuilder(rows),
      );
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
        [
          { id: 'w-node', runMode: 'node' },
          { id: 'w-cli' },
        ],
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

  describe('getWorkerById', () => {
    const workerId = '11111111-1111-4111-8111-111111111111';
    const workspaceId = '22222222-2222-4222-8222-222222222222';

    const builtInToolFixtures = [
      {
        id: 'bt-1',
        name: 'subfinder',
        logoUrl: 'https://example.com/subfinder.png',
        category: 'subdomains',
        type: WorkerType.BUILT_IN,
      },
      {
        id: 'bt-2',
        name: 'nuclei',
        logoUrl: null,
        category: 'vulnerabilities',
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
      return service.getWorkerById(workerId, workspaceId);
    };

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
          category: 'subdomains',
          type: 'builtin',
          currentJobs: [],
        },
        {
          id: 'bt-2',
          name: 'nuclei',
          logoUrl: null,
          category: 'vulnerabilities',
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
      );

      expect(result.tools).toHaveLength(5);
      expect(result.toolsCount).toBe(5);
      expect(result.toolsCount).toBe(result.tools.length);

      const connectors = result.tools.filter((tool) => tool.type === 'connector');
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
        {
          id: 'c-3',
          name: 'c-3',
          logoUrl: '/connectors/c-3.png',
          type: 'connector',
          currentJobs: [],
        },
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
});