import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { ApiKeysService } from '../apikeys/apikeys.service';
import { Asset } from '../assets/entities/assets.entity';
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
    } as any;

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
});
