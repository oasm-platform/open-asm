import {
  BullMQName,
  JobPriority,
  JobStatus,
  ToolCategory,
  WorkerScope,
  WorkerType,
} from '@/common/enums/enum';
import { RedisService } from '@/services/redis/redis.service';
import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConnectorRegistryService } from '../connectors/connector-registry.service';
import { DataAdapterService } from '../data-adapter/data-adapter.service';
import { StorageService } from '../storage/storage.service';
import { ToolConfigProfilesService } from '../tools/tool-config-profiles.service';
import { ToolsService } from '../tools/tools.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { JobErrorLog } from './entities/job-error-log.entity';
import { JobHistory } from './entities/job-history.entity';
import { Job } from './entities/job.entity';
import { JobsRegistryService } from './jobs-registry.service';

describe('JobsRegistryService', () => {
  let service: JobsRegistryService;

  const mockJobRepository = {
    createQueryBuilder: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
    getManyAndCount: jest.fn(),
    getOne: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    count: jest.fn(),
    exists: jest.fn(),
  };

  const mockJobHistoryRepository = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const mockJobErrorLogRepository = {
    createQueryBuilder: jest.fn(),
  };

  const mockDataSource = {
    createQueryRunner: jest.fn(),
    getRepository: jest.fn(),
  };

  const mockDataAdapterService = {
    syncData: jest.fn(),
  };

  const mockStorageService = {
    upload: jest.fn(),
  };

  const mockRedisService = {
    publish: jest.fn(),
    client: {
      incr: jest.fn(),
      decr: jest.fn(),
      del: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
    },
  };

  const mockToolsService = {
    getInstalledTools: jest.fn(),
    getToolByNames: jest.fn(),
  };

  const mockWorkspacesService = {
    getWorkspaceConfigValue: jest.fn(),
  };

  const mockConnectorRegistryService = {
    getConnector: jest.fn(),
    getAllConnectors: jest.fn().mockReturnValue([]),
  };

  const mockToolConfigProfilesService = {
    assertProfileOwnership: jest.fn(),
    resolveConfigForDispatch: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: getRepositoryToken(Job),
          useValue: mockJobRepository,
        },
        {
          provide: getRepositoryToken(JobHistory),
          useValue: mockJobHistoryRepository,
        },
        {
          provide: getRepositoryToken(JobErrorLog),
          useValue: mockJobErrorLogRepository,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: DataAdapterService,
          useValue: mockDataAdapterService,
        },
        {
          provide: StorageService,
          useValue: mockStorageService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: ToolsService,
          useValue: mockToolsService,
        },
        {
          provide: WorkspacesService,
          useValue: mockWorkspacesService,
        },
        {
          provide: getQueueToken(BullMQName.JOB_RESULT),
          useValue: { add: jest.fn() },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
        {
          provide: ConnectorRegistryService,
          useValue: mockConnectorRegistryService,
        },
        {
          provide: ToolConfigProfilesService,
          useValue: mockToolConfigProfilesService,
        },
        JobsRegistryService,
      ],
    }).compile();

    service = module.get<JobsRegistryService>(JobsRegistryService);
    // Manually set optional toolsService since @Optional() dependencies may not be injected in tests
    (service as any).toolsService = mockToolsService;
  });

  describe('reRunJob', () => {
    const mockWorkspaceId = 'workspace-uuid';
    const mockJobId = 'job-uuid';
    const mockJob = {
      id: mockJobId,
      status: JobStatus.COMPLETED,
      workerId: 'worker-uuid',
      retryCount: 0,
      asset: {
        target: {
          id: 'target-uuid',
        },
      },
    };

    it('should successfully re-run a job', async () => {
      const mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        manager: {
          save: jest.fn().mockResolvedValue({
            ...mockJob,
            status: JobStatus.PENDING,
            workerId: undefined,
            retryCount: 1,
          }),
        },
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
      };

      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
      mockJobRepository.getOne.mockResolvedValue(mockJob);

      const result = await service.reRunJob(mockWorkspaceId, mockJobId);

      expect(mockJobRepository.createQueryBuilder).toHaveBeenCalledWith('job');
      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(result).toEqual({ message: 'Job re-run successfully' });

      // Verify the job was updated correctly
      expect(mockQueryRunner.manager.save).toHaveBeenCalledWith({
        ...mockJob,
        status: JobStatus.PENDING,
        workerId: undefined,
        retryCount: 1,
      });
    });

    it('should throw NotFoundException when job not found in workspace', async () => {
      const mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        manager: {
          createQueryBuilder: jest.fn().mockReturnThis(),
          innerJoin: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(null),
        },
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
      };

      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
      mockJobRepository.getOne.mockResolvedValue(null);

      await expect(
        service.reRunJob(mockWorkspaceId, mockJobId),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.reRunJob(mockWorkspaceId, mockJobId),
      ).rejects.toThrow('Job not found in workspace');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('should rollback transaction when error occurs', async () => {
      const mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        manager: {
          save: jest.fn(),
        },
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
      };

      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
      mockJobRepository.getOne.mockRejectedValue(new Error('Database error'));

      await expect(
        service.reRunJob(mockWorkspaceId, mockJobId),
      ).rejects.toThrow('Database error');
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });

  describe('cancelJob', () => {
    const mockWorkspaceId = 'workspace-uuid';
    const mockJobId = 'job-uuid';
    const mockJob = {
      id: mockJobId,
      status: JobStatus.IN_PROGRESS,
      workerId: 'worker-uuid',
      retryCount: 0,
      asset: {
        target: {
          id: 'target-uuid',
        },
      },
    };

    it('should successfully cancel a job', async () => {
      const mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        manager: {
          save: jest.fn().mockResolvedValue({
            ...mockJob,
            status: JobStatus.CANCELLED,
          }),
        },
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
      };

      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
      mockJobRepository.getOne.mockResolvedValue(mockJob);

      const result = await service.cancelJob(mockWorkspaceId, mockJobId);

      expect(mockJobRepository.createQueryBuilder).toHaveBeenCalledWith('job');
      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(result).toEqual({ message: 'Job cancelled successfully' });

      // Verify the job status was updated to cancelled
      expect(mockQueryRunner.manager.save).toHaveBeenCalledWith({
        ...mockJob,
        status: JobStatus.CANCELLED,
      });
    });

    it('should throw NotFoundException when job not found in workspace', async () => {
      const mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        manager: {
          createQueryBuilder: jest.fn().mockReturnThis(),
          innerJoin: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(null),
        },
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
      };

      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
      mockJobRepository.getOne.mockResolvedValue(null);

      await expect(
        service.cancelJob(mockWorkspaceId, mockJobId),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.cancelJob(mockWorkspaceId, mockJobId),
      ).rejects.toThrow('Job not found in workspace');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('should rollback transaction when error occurs', async () => {
      const mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        manager: {
          createQueryBuilder: jest.fn().mockReturnThis(),
          innerJoin: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockRejectedValue(new Error('Database error')),
        },
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
      };

      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
      mockJobRepository.getOne.mockRejectedValue(new Error('Database error'));

      await expect(
        service.cancelJob(mockWorkspaceId, mockJobId),
      ).rejects.toThrow('Database error');
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });

  describe('deleteJob', () => {
    const mockWorkspaceId = 'workspace-uuid';
    const mockJobId = 'job-uuid';
    const mockJob = {
      id: mockJobId,
      status: JobStatus.COMPLETED,
      workerId: 'worker-uuid',
      retryCount: 0,
      asset: {
        target: {
          id: 'target-uuid',
        },
      },
    };

    it('should successfully delete a job', async () => {
      const mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        manager: {
          remove: jest.fn().mockResolvedValue(mockJob),
        },
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
      };

      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
      mockJobRepository.getOne.mockResolvedValue(mockJob);

      const result = await service.deleteJob(mockWorkspaceId, mockJobId);

      expect(mockJobRepository.createQueryBuilder).toHaveBeenCalledWith('job');
      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(result).toEqual({ message: 'Job deleted successfully' });

      // Verify the job was removed
      expect(mockQueryRunner.manager.remove).toHaveBeenCalledWith(mockJob);
    });

    it('should throw NotFoundException when job not found in workspace', async () => {
      const mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        manager: {
          createQueryBuilder: jest.fn().mockReturnThis(),
          innerJoin: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(null),
        },
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
      };

      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
      mockJobRepository.getOne.mockResolvedValue(null);

      await expect(
        service.deleteJob(mockWorkspaceId, mockJobId),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.deleteJob(mockWorkspaceId, mockJobId),
      ).rejects.toThrow('Job not found in workspace');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('should rollback transaction when error occurs', async () => {
      const mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        manager: {
          createQueryBuilder: jest.fn().mockReturnThis(),
          innerJoin: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockRejectedValue(new Error('Database error')),
        },
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
      };

      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
      mockJobRepository.getOne.mockRejectedValue(new Error('Database error'));

      await expect(
        service.deleteJob(mockWorkspaceId, mockJobId),
      ).rejects.toThrow('Database error');
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });

  describe('getJobHistoryDetail', () => {
    const mockWorkspaceId = 'workspace-uuid';
    const mockHistoryId = 'history-uuid';
    const mockJobs = [
      {
        id: 'job-1',
        status: JobStatus.COMPLETED,
        tool: { name: 'test-tool' },
      },
    ];
    const mockJobHistory = {
      id: mockHistoryId,
      createdAt: new Date(),
      updatedAt: new Date(),
      jobs: mockJobs,
      workflow: {
        name: 'test-workflow',
        content: {
          jobs: [{ run: 'test-tool' }],
        },
      },
      jobHistoryName: 'test-job-history',
    };

    it('should return job history detail with tools and their statuses', async () => {
      const mockTool = {
        id: 'tool-uuid',
        name: 'test-tool',
        description: 'A test tool',
        command: 'test-command',
        category: ToolCategory.SUBDOMAINS,
        version: '1.0',
        logoUrl: 'http://example.com/logo.png',
        isBuiltIn: true,
        isInstalled: true,
        isOfficialSupport: true,
        type: WorkerType.BUILT_IN,
        providerId: 'provider-uuid',
        priority: JobPriority.BACKGROUND,
        availableWorkersCount: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockJobHistoryRepository.findOne.mockResolvedValue(mockJobHistory);
      mockJobHistoryRepository.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getExists: jest.fn().mockResolvedValue(true),
      });
      mockJobRepository.getRawMany.mockResolvedValue([
        { toolId: 'tool-uuid', status: JobStatus.COMPLETED },
      ]);
      mockToolsService.getInstalledTools.mockResolvedValue({
        data: [mockTool],
      });

      const result = await service.getJobHistoryDetail(
        mockWorkspaceId,
        mockHistoryId,
      );

      expect(mockJobHistoryRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockHistoryId },
        relations: {
          workflow: true,
        },
      });
      expect(result).toEqual({
        id: mockHistoryId,
        workflowName: 'test-workflow',
        jobHistoryName: 'test-job-history',
        createdAt: mockJobHistory.createdAt,
        updatedAt: mockJobHistory.updatedAt,
        tools: [
          {
            id: 'tool-uuid',
            name: 'test-tool',
            logoUrl: 'http://example.com/logo.png',
            status: JobStatus.COMPLETED,
          },
        ],
      });
      // Bandwidth contract: tools must expose only id/name/logoUrl/status
      expect(Object.keys(result.tools![0]).sort()).toEqual([
        'id',
        'logoUrl',
        'name',
        'status',
      ]);
    });

    it('should return detail for a history whose jobs were all deleted (ownership proven via workflow, tool status undefined)', async () => {
      const mockTool = {
        id: 'tool-uuid',
        name: 'test-tool',
        logoUrl: 'http://example.com/logo.png',
      };

      mockJobHistoryRepository.findOne.mockResolvedValue(mockJobHistory);
      mockJobHistoryRepository.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getExists: jest.fn().mockResolvedValue(true),
      });
      // No job rows: the deleted-jobs scenario
      mockJobRepository.getRawMany.mockResolvedValue([]);
      mockToolsService.getInstalledTools.mockResolvedValue({
        data: [mockTool],
      });

      const result = await service.getJobHistoryDetail(
        mockWorkspaceId,
        mockHistoryId,
      );

      expect(result).toEqual({
        id: mockHistoryId,
        workflowName: 'test-workflow',
        jobHistoryName: 'test-job-history',
        createdAt: mockJobHistory.createdAt,
        updatedAt: mockJobHistory.updatedAt,
        tools: [
          {
            id: 'tool-uuid',
            name: 'test-tool',
            logoUrl: 'http://example.com/logo.png',
            status: undefined,
          },
        ],
      });
    });

    it('should throw NotFoundException when job history not found', async () => {
      mockJobHistoryRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getJobHistoryDetail(mockWorkspaceId, mockHistoryId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when job history not in workspace', async () => {
      mockJobHistoryRepository.findOne.mockResolvedValue(mockJobHistory);
      mockJobHistoryRepository.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getExists: jest.fn().mockResolvedValue(false),
      });

      await expect(
        service.getJobHistoryDetail(mockWorkspaceId, mockHistoryId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should not crash when job history has no workflow', async () => {
      mockJobHistoryRepository.findOne.mockResolvedValue({
        ...mockJobHistory,
        workflow: null,
      });
      mockJobHistoryRepository.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getExists: jest.fn().mockResolvedValue(true),
      });
      mockJobRepository.getRawMany.mockResolvedValue([]);
      mockToolsService.getInstalledTools.mockResolvedValue({ data: [] });

      const result = await service.getJobHistoryDetail(
        mockWorkspaceId,
        mockHistoryId,
      );

      expect(result.workflowName).toBeUndefined();
      expect(result.tools).toEqual([]);
    });
  });

  describe('getManyJobs', () => {
    const mockWorkspaceId = 'workspace-uuid';

    beforeEach(() => {
      jest.clearAllMocks();
      mockJobRepository.getManyAndCount = jest
        .fn()
        .mockResolvedValue([[], 0]);
    });

    it('should scope jobs to the workspace using param binding', async () => {
      const result = await service.getManyJobs(mockWorkspaceId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      } as any);

      expect(mockJobRepository.andWhere).toHaveBeenCalledWith(
        'target.workspaceId = :workspaceId',
        { workspaceId: mockWorkspaceId },
      );
      expect(mockJobRepository.getManyAndCount).toHaveBeenCalled();
      expect(result).toMatchObject({
        data: [],
        total: 0,
        page: 1,
        limit: 10,
      });
    });

    it('should apply the jobStatus filter when a concrete status is given', async () => {
      await service.getManyJobs(mockWorkspaceId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
        jobStatus: JobStatus.FAILED,
      } as any);

      expect(mockJobRepository.andWhere).toHaveBeenCalledWith(
        'job.status = :jobStatus',
        { jobStatus: JobStatus.FAILED },
      );
    });

    it('should skip the status filter when jobStatus is "all"', async () => {
      await service.getManyJobs(mockWorkspaceId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
        jobStatus: 'all',
      } as any);

      const statusFilters = mockJobRepository.andWhere.mock.calls.filter(
        ([clause]) =>
          typeof clause === 'string' && clause.includes('job.status'),
      );
      expect(statusFilters).toHaveLength(0);
    });

    it('should fall back to createdAt and append an id tiebreaker for unknown sortBy', async () => {
      await service.getManyJobs(mockWorkspaceId, {
        page: 1,
        limit: 10,
        sortBy: '__proto__',
        sortOrder: 'ASC',
      } as any);

      expect(mockJobRepository.orderBy).toHaveBeenCalledWith(
        'job.createdAt',
        'ASC',
      );
      expect(mockJobRepository.addOrderBy).toHaveBeenCalledWith('job.id', 'ASC');
    });

    it('should pass through whitelisted sortBy values', async () => {
      await service.getManyJobs(mockWorkspaceId, {
        page: 1,
        limit: 10,
        sortBy: 'status',
        sortOrder: 'DESC',
      } as any);

      expect(mockJobRepository.orderBy).toHaveBeenCalledWith(
        'job.status',
        'DESC',
      );
    });

    it('should paginate using take/skip', async () => {
      await service.getManyJobs(mockWorkspaceId, {
        page: 3,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      } as any);

      expect(mockJobRepository.take).toHaveBeenCalledWith(10);
      expect(mockJobRepository.skip).toHaveBeenCalledWith(20);
    });

    it('should hydrate only slim tool columns (id, name, logoUrl) to save bandwidth', async () => {
      await service.getManyJobs(mockWorkspaceId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      } as any);

      expect(mockJobRepository.leftJoin).toHaveBeenCalledWith(
        'job.tool',
        'tool',
      );
      expect(mockJobRepository.addSelect).toHaveBeenCalledWith([
        'tool.id',
        'tool.name',
        'tool.logoUrl',
      ]);
      // The full tool entity must no longer be selected eagerly
      const fullToolSelects = mockJobRepository.leftJoinAndSelect.mock.calls
        .filter(([relation]) => relation === 'job.tool');
      expect(fullToolSelects).toHaveLength(0);
    });

    it('should hydrate only slim asset columns (id, value, targetId) to save bandwidth', async () => {
      await service.getManyJobs(mockWorkspaceId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      } as any);

      expect(mockJobRepository.leftJoin).toHaveBeenCalledWith(
        'job.asset',
        'asset',
      );
      expect(mockJobRepository.addSelect).toHaveBeenCalledWith([
        'asset.id',
        'asset.value',
        'asset.targetId',
      ]);
      // The full asset entity must no longer be selected eagerly
      const fullAssetSelects = mockJobRepository.leftJoinAndSelect.mock.calls
        .filter(([relation]) => relation === 'job.asset');
      expect(fullAssetSelects).toHaveLength(0);
      // The target join must remain: it backs the tenant workspaceId filter
      expect(mockJobRepository.leftJoin).toHaveBeenCalledWith(
        'asset.target',
        'target',
      );
      // Target columns must not be selected either (bandwidth)
      expect(mockJobRepository.leftJoinAndSelect).not.toHaveBeenCalledWith(
        'asset.target',
        'target',
      );
    });
  });

  describe('getManyJobHistories', () => {
    const mockWorkspaceId = 'workspace-uuid';

    interface HistoryQueryBuilder {
      innerJoin: jest.Mock<HistoryQueryBuilder>;
      leftJoin: jest.Mock<HistoryQueryBuilder>;
      where: jest.Mock<HistoryQueryBuilder>;
      select: (args: unknown[]) => HistoryQueryBuilder;
      groupBy: jest.Mock<HistoryQueryBuilder>;
      addGroupBy: jest.Mock<HistoryQueryBuilder>;
      orderBy: jest.Mock<HistoryQueryBuilder>;
      addOrderBy: jest.Mock<HistoryQueryBuilder>;
      offset: jest.Mock<HistoryQueryBuilder>;
      limit: jest.Mock<HistoryQueryBuilder>;
      getRawMany: jest.Mock<Promise<unknown[]>>;
      getCount: jest.Mock<Promise<number>>;
    }

    const buildHistoryQueryBuilder = () => {
      const selectArgs: unknown[][] = [];
      const qb: HistoryQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn((args: unknown[]) => {
          selectArgs.push(args);
          return qb;
        }),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
      };
      return { qb, selectArgs };
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should compute totalJobs and status from joined jobs without correlated subqueries', async () => {
      const { qb, selectArgs } = buildHistoryQueryBuilder();
      qb.getRawMany.mockResolvedValue([]);
      qb.getCount.mockResolvedValue(2);
      mockJobHistoryRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getManyJobHistories(mockWorkspaceId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      } as any);

      expect(selectArgs[0]).toContain('COUNT(job.id) as "totalJobs"');
      // No correlated subquery referencing the jobs table from scratch
      expect(
        selectArgs[0].some(
          (s) => typeof s === 'string' && s.includes('FROM jobs'),
        ),
      ).toBe(false);
      // Status derived from the joined job rows via aggregate FILTER
      const statusExpr = selectArgs[0].find(
        (s) => typeof s === 'string' && s.includes('FILTER'),
      ) as string;
      expect(statusExpr).toContain(`job.status = '${JobStatus.FAILED}'`);
      expect(statusExpr).toContain(`job.status = '${JobStatus.IN_PROGRESS}'`);
      // Separate count query is still executed (getCount would strip GROUP BY)
      expect(qb.getCount).toHaveBeenCalled();
      expect(result.total).toBe(2);
    });

    it('should aggregate terminal cancelled status when all jobs are cancelled', async () => {
      const { qb, selectArgs } = buildHistoryQueryBuilder();
      qb.getRawMany.mockResolvedValue([]);
      qb.getCount.mockResolvedValue(0);
      mockJobHistoryRepository.createQueryBuilder.mockReturnValue(qb);

      await service.getManyJobHistories(mockWorkspaceId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      } as any);

      const statusExpr = selectArgs[0].find(
        (s) => typeof s === 'string' && s.includes('FILTER'),
      ) as string;
      // All-cancelled histories must surface as cancelled, not pending
      expect(statusExpr).toContain(
        `WHEN COUNT(*) FILTER (WHERE job.status = '${JobStatus.CANCELLED}') = COUNT(*) AND COUNT(*) > 0 THEN '${JobStatus.CANCELLED}'`,
      );
    });

    it('should aggregate terminal skipped status when all jobs are skipped', async () => {
      const { qb, selectArgs } = buildHistoryQueryBuilder();
      qb.getRawMany.mockResolvedValue([]);
      qb.getCount.mockResolvedValue(0);
      mockJobHistoryRepository.createQueryBuilder.mockReturnValue(qb);

      await service.getManyJobHistories(mockWorkspaceId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      } as any);

      const statusExpr = selectArgs[0].find(
        (s) => typeof s === 'string' && s.includes('FILTER'),
      ) as string;
      // All-skipped histories must surface as skipped, not pending
      expect(statusExpr).toContain(
        `WHEN COUNT(*) FILTER (WHERE job.status = '${JobStatus.SKIPPED}') = COUNT(*) AND COUNT(*) > 0 THEN '${JobStatus.SKIPPED}'`,
      );
    });

    it('should fall back to createdAt and append an id tiebreaker for unknown sortBy', async () => {
      const { qb } = buildHistoryQueryBuilder();
      mockJobHistoryRepository.createQueryBuilder.mockReturnValue(qb);

      await service.getManyJobHistories(mockWorkspaceId, {
        page: 1,
        limit: 10,
        sortBy: '__proto__',
        sortOrder: 'ASC',
      } as any);

      expect(qb.orderBy).toHaveBeenCalledWith('jobHistory.createdAt', 'ASC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('jobHistory.id', 'ASC');
    });

    it('should pass through whitelisted sortBy values', async () => {
      const { qb } = buildHistoryQueryBuilder();
      mockJobHistoryRepository.createQueryBuilder.mockReturnValue(qb);

      await service.getManyJobHistories(mockWorkspaceId, {
        page: 1,
        limit: 10,
        sortBy: 'jobHistoryName',
        sortOrder: 'DESC',
      } as any);

      expect(qb.orderBy).toHaveBeenCalledWith(
        'jobHistory.jobHistoryName',
        'DESC',
      );
    });

    it('should transform raw rows into the response DTO shape', async () => {
      const { qb } = buildHistoryQueryBuilder();
      qb.getRawMany.mockResolvedValue([
        {
          id: 'history-1',
          createdAt: new Date('2024-01-01T00:00:00Z'),
          updatedAt: new Date('2024-01-02T00:00:00Z'),
          totalJobs: '5',
          status: JobStatus.COMPLETED,
          workflowName: 'workflow-1',
          jobHistoryName: 'name-1',
          jobRunType: 'manual',
        },
      ]);
      mockJobHistoryRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getManyJobHistories(mockWorkspaceId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      } as any);

      expect(result.data[0]).toEqual({
        id: 'history-1',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
        totalJobs: 5,
        status: JobStatus.COMPLETED,
        workflowName: 'workflow-1',
        jobHistoryName: 'name-1',
        jobRunType: 'manual',
      });
    });
  });

  describe('getNextStepForJob', () => {
    const mockJob = {
      id: 'job-uuid',
      tool: { name: 'tool-a' },
      asset: {
        target: { id: 'target-uuid' },
      },
      jobHistory: {
        workflow: {
          content: {
            jobs: [
              { name: 'job-1', run: 'tool-a' },
              { name: 'job-2', run: 'tool-b' },
            ],
          },
          workspace: { id: 'workspace-uuid' },
        },
      },
    };

    it('should return 0 when no workflow exists', async () => {
      const jobNoWorkflow = { ...mockJob, jobHistory: { workflow: null } };

      const result = await service.getNextStepForJob(jobNoWorkflow as any);

      expect(result).toBe(0);
    });

    it('should return 0 when current tool not found in workflow', async () => {
      const jobNoTool = {
        ...mockJob,
        tool: { name: 'unknown-tool' },
      };

      const result = await service.getNextStepForJob(jobNoTool as any);

      expect(result).toBe(0);
    });

    it('should return 0 when current tool is last in workflow', async () => {
      const lastToolJob = {
        ...mockJob,
        tool: { name: 'tool-b' },
      };

      const result = await service.getNextStepForJob(lastToolJob as any);

      expect(result).toBe(0);
    });

    it('should return number of new jobs created when next step exists', async () => {
      const jobWithNextStep = {
        id: 'job-uuid',
        tool: { name: 'tool-a' },
        asset: {
          target: { id: 'target-uuid' },
        },
        jobHistory: {
          workflow: {
            content: {
              jobs: [
                { name: 'job-1', run: 'tool-a' },
                { name: 'job-2', run: 'tool-b' },
              ],
            },
            workspace: { id: undefined },
          },
        },
      };

      mockToolsService.getToolByNames.mockResolvedValue([
        { name: 'tool-b', priority: 4, category: 'SUBDOMAINS' },
      ]);

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([{ id: 'asset-1', isPrimary: true }]),
      };
      const mockJobRepo = {
        create: jest.fn().mockReturnValue({}),
        save: jest.fn().mockResolvedValue([{}]),
        createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      };
      mockDataSource.getRepository.mockReturnValue(mockJobRepo);

      const result = await service.getNextStepForJob(jobWithNextStep as any);

      expect(result).toBe(1);
    });

    it('should skip SUBDOMAINS and use next non-SUBDOMAINS when isAssetsDiscovery is false', async () => {
      const jobWithSubdomainNext = {
        id: 'job-uuid',
        tool: { name: 'tool-a' },
        asset: {
          target: { id: 'target-uuid' },
        },
        jobHistory: {
          workflow: {
            content: {
              jobs: [
                { name: 'job-1', run: 'tool-a' },
                { name: 'job-2', run: 'subfinder' },
                { name: 'job-3', run: 'tool-c' },
              ],
            },
            workspace: { id: 'workspace-uuid' },
          },
        },
      };

      mockWorkspacesService.getWorkspaceConfigValue.mockResolvedValue({
        isAssetsDiscovery: false,
      });

      // toolsService.getToolByNames called twice:
      // 1st call (batch-resolve remaining): subfinder + tool-c
      // 2nd call (resolve nextTool): tool-c
      mockToolsService.getToolByNames
        .mockResolvedValueOnce([
          { name: 'subfinder', category: ToolCategory.SUBDOMAINS },
          { name: 'tool-c', category: ToolCategory.HTTP_PROBE },
        ])
        .mockResolvedValueOnce([
          { name: 'tool-c', category: ToolCategory.HTTP_PROBE },
        ]);

      // tool-c is HTTP_PROBE => createNewJob calls findAssetServicesForJob => needs chained query builder
      const mockAssetQueryBuilder = {
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([{ id: 'asset-service-1', value: 'example.com', port: 443, asset: { id: 'asset-1', isPrimary: true } }]),
      };
      const mockJobQueryBuilder = {
        leftJoinAndWhere: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([{ id: 'asset-1', isPrimary: true }]),
      };
      const mockAssetRepo = {
        createQueryBuilder: jest.fn().mockReturnValue(mockAssetQueryBuilder),
      };
      const mockJobRepo = {
        create: jest.fn().mockReturnValue({}),
        save: jest.fn().mockResolvedValue([{}]),
        createQueryBuilder: jest.fn().mockReturnValue(mockJobQueryBuilder),
      };
      mockDataSource.getRepository.mockImplementation((entity: any) => {
        const name = entity?.name ?? entity;
        if (name === 'AssetService') return mockAssetRepo;
        return mockJobRepo;
      });

      const result = await service.getNextStepForJob(
        jobWithSubdomainNext as any,
      );

      expect(result).toBe(1);
      // Should have skipped subfinder and resolved tool-c
      expect(mockToolsService.getToolByNames).toHaveBeenCalledWith({
        names: ['subfinder', 'tool-c'],
      });
      expect(mockToolsService.getToolByNames).toHaveBeenLastCalledWith({
        names: ['tool-c'],
      });
    });

    it('should return 0 when all remaining tools are SUBDOMAINS and discovery is disabled', async () => {
      const jobWithOnlySubdomainNext = {
        id: 'job-uuid',
        tool: { name: 'tool-a' },
        asset: {
          target: { id: 'target-uuid' },
        },
        jobHistory: {
          workflow: {
            content: {
              jobs: [
                { name: 'job-1', run: 'tool-a' },
                { name: 'job-2', run: 'subfinder-1' },
                { name: 'job-3', run: 'subfinder-2' },
              ],
            },
            workspace: { id: 'workspace-uuid' },
          },
        },
      };

      mockWorkspacesService.getWorkspaceConfigValue.mockResolvedValue({
        isAssetsDiscovery: false,
      });

      mockToolsService.getToolByNames.mockResolvedValue([
        { name: 'subfinder-1', category: ToolCategory.SUBDOMAINS },
        { name: 'subfinder-2', category: ToolCategory.SUBDOMAINS },
      ]);

      const result = await service.getNextStepForJob(
        jobWithOnlySubdomainNext as any,
      );

      expect(result).toBe(0);
    });
  });

  describe('markWorkflowDone', () => {
    const mockJobHistoryId = 'history-uuid';

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should update job history isCompleted to true', async () => {
      mockJobRepository.exists.mockResolvedValue(false);
      mockJobHistoryRepository.update.mockResolvedValue({ affected: 1 });
      mockJobHistoryRepository.findOne.mockResolvedValue({
        id: mockJobHistoryId,
        workflow: { name: 'test-workflow' },
      });

      await service.markWorkflowDone(mockJobHistoryId);

      expect(mockJobRepository.exists).toHaveBeenCalled();
      expect(mockJobHistoryRepository.update).toHaveBeenCalledWith(
        { id: mockJobHistoryId, isCompleted: false },
        { isCompleted: true },
      );
    });

    it('should not update when there are pending jobs', async () => {
      mockJobRepository.exists.mockResolvedValue(true);

      await service.markWorkflowDone(mockJobHistoryId);

      expect(mockJobHistoryRepository.update).not.toHaveBeenCalled();
    });

    it('should not update when already completed', async () => {
      mockJobRepository.exists.mockResolvedValue(false);
      mockJobHistoryRepository.update.mockResolvedValue({ affected: 0 });

      await service.markWorkflowDone(mockJobHistoryId);

      expect(mockJobHistoryRepository.update).toHaveBeenCalled();
    });
  });

  // ── Task 4.2: createNewJob connector semantics ────────────────────────

  describe('createNewJob — connector jobs', () => {
    const mockConnectorTool = {
      id: 'tool-conn-1',
      name: 'my-connector',
      category: ToolCategory.VULNERABILITIES,
      priority: 4,
    } as any;

    const mockBuiltInTool = {
      id: 'tool-bi-1',
      name: 'subfinder',
      category: ToolCategory.SUBDOMAINS,
      priority: 4,
      command: 'subfinder -d {{value}}',
    } as any;

    const mockAsset = {
      id: 'asset-1',
      value: 'example.com',
      isPrimary: true,
    } as any;

    const mockJobRepo = {
      create: jest.fn().mockImplementation((partial: Record<string, unknown>) => ({ id: 'random-uuid', ...partial })),
      save: jest.fn().mockImplementation((jobs: unknown) => Promise.resolve(jobs)),
    };

    beforeEach(() => {
      jest.clearAllMocks();
      mockJobHistoryRepository.create = jest.fn().mockReturnValue({ id: 'jh-1' });
      mockJobHistoryRepository.save = jest.fn().mockResolvedValue({ id: 'jh-1' });

      mockDataSource.getRepository.mockImplementation((entity: any) => {
        if (entity === Job) return mockJobRepo;
        // Asset query builder chain for findAssetsForJob
        return {
          createQueryBuilder: jest.fn().mockReturnValue({
            innerJoinAndSelect: jest.fn().mockReturnThis(),
            innerJoin: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getMany: jest.fn().mockResolvedValue([mockAsset]),
          }),
        };
      });
    });

    it('should skip command and set configProfileId for connector job', async () => {
      mockConnectorRegistryService.getConnector.mockReturnValue({
        name: 'my-connector',
        image: 'my-connector:latest',
      });

      const result = await service.createNewJob({
        tool: mockConnectorTool,
        targetIds: ['target-1'],
        workspaceId: 'ws-1',
        workflow: { id: 'wf-1' } as any,
        configProfileId: 'profile-1',
      });

      // Job was created
      expect(result).toHaveLength(1);
      const created = mockJobRepo.create.mock.calls[0][0];
      expect(created.command).toBeUndefined();
      expect(created.configProfileId).toBe('profile-1');
      // assertProfileOwnership was called
      expect(mockToolConfigProfilesService.assertProfileOwnership).toHaveBeenCalledWith(
        'ws-1',
        'profile-1',
        'tool-conn-1',
      );
    });

    it('should create connector job without configProfileId (omitted)', async () => {
      mockConnectorRegistryService.getConnector.mockReturnValue({
        name: 'my-connector',
        image: 'my-connector:latest',
      });

      const result = await service.createNewJob({
        tool: mockConnectorTool,
        targetIds: ['target-1'],
        workspaceId: 'ws-1',
        workflow: { id: 'wf-1' } as any,
      });

      expect(result).toHaveLength(1);
      const created = mockJobRepo.create.mock.calls[0][0];
      expect(created.command).toBeUndefined();
      expect(created.configProfileId).toBeUndefined();
      expect(mockToolConfigProfilesService.assertProfileOwnership).not.toHaveBeenCalled();
    });

    it('should reject configProfileId for wrong tool', async () => {
      mockConnectorRegistryService.getConnector.mockReturnValue({
        name: 'my-connector',
        image: 'my-connector:latest',
      });
      mockToolConfigProfilesService.assertProfileOwnership.mockRejectedValue(
        new BadRequestException(
          'Profile profile-1 does not belong to tool tool-conn-1',
        ),
      );

      await expect(
        service.createNewJob({
          tool: mockConnectorTool,
          targetIds: ['target-1'],
          workspaceId: 'ws-1',
          workflow: { id: 'wf-1' } as any,
          configProfileId: 'profile-1',
        }),
      ).rejects.toThrow();
      expect(mockToolConfigProfilesService.assertProfileOwnership).toHaveBeenCalled();
    });

    it('should build command for legacy/built-in job (not connector)', async () => {
      mockConnectorRegistryService.getConnector.mockReturnValue(null);

      const result = await service.createNewJob({
        tool: mockBuiltInTool,
        targetIds: ['target-1'],
        workspaceId: 'ws-1',
        workflow: { id: 'wf-1' } as any,
      });

      expect(result).toHaveLength(1);
      const created = mockJobRepo.create.mock.calls[0][0];
      // Built-in tool: command should be set (bindingCommand applied)
      expect(created.command).toBeDefined();
      expect(typeof created.command).toBe('string');
      expect(created.configProfileId).toBeUndefined();
    });
  });

  // ── Task 4.2: getNextJob connector metadata ──────────────────────────

  describe('getNextJob — connector metadata', () => {
    let mockQBGetOne: jest.Mock;
    let mockQB: Record<string, any>;
    let mockQueryRunner: any;

    beforeEach(() => {
      jest.clearAllMocks();

      // Reset getRepository mock (clears any mockImplementation from createNewJob tests)
      mockQBGetOne = jest.fn();
      mockDataSource.getRepository.mockReset();
      mockDataSource.getRepository.mockReturnValue({
        findOne: jest.fn(),
      });

      // Build a proper QB chain mock that returns itself from every chained method.
      // Track join semantics faithfully: a plain leftJoin('jobs.tool', ...) may filter
      // on the joined alias but must NOT hydrate job.tool, mirroring TypeORM's
      // leftJoin vs leftJoinAndSelect distinction.
      let toolJoinSelect: 'leftJoin' | 'leftJoinAndSelect' | undefined;
      mockQB = {};
      for (const method of [
        'innerJoinAndSelect', 'innerJoin', 'leftJoin', 'leftJoinAndSelect',
        'where', 'andWhere', 'orderBy', 'addOrderBy',
        'setLock', 'limit',
      ]) {
        mockQB[method] = jest.fn().mockReturnValue(mockQB);
      }
      (mockQB.leftJoin as jest.Mock).mockImplementation((entity: string) => {
        if (entity === 'jobs.tool') toolJoinSelect = 'leftJoin';
        return mockQB;
      });
      (mockQB.leftJoinAndSelect as jest.Mock).mockImplementation((entity: string) => {
        if (entity === 'jobs.tool') toolJoinSelect = 'leftJoinAndSelect';
        return mockQB;
      });
      mockQB.getOne = jest.fn(async () => {
        const job = (await mockQBGetOne()) as { tool?: unknown } | null | undefined;
        if (job && toolJoinSelect !== 'leftJoinAndSelect') {
          // Without leftJoinAndSelect the tool relation is not hydrated
          delete job.tool;
        }
        return job;
      });

      mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
        manager: {
          createQueryBuilder: jest.fn().mockReturnValue(mockQB),
          update: jest.fn().mockResolvedValue(undefined),
        },
      };

      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
    });

    it('should include tool, workspaceId, configProfileId for non-built-in worker', async () => {
      const mockWorker = {
        id: 'worker-1',
        type: WorkerType.PROVIDER,
        workspace: { id: 'ws-1' },
        tool: { id: 'tool-conn-1', name: 'my-connector' },
      };
      const mockJob = {
        id: 'job-1',
        category: ToolCategory.VULNERABILITIES,
        createdAt: new Date(),
        updatedAt: new Date(),
        priority: 4,
        command: undefined,
        asset: { id: 'asset-1', value: 'example.com' },
        configProfileId: 'profile-1',
      };

      mockDataSource.getRepository.mockReturnValue({
        findOne: jest.fn().mockResolvedValue(mockWorker),
      });
      mockQBGetOne.mockResolvedValue(mockJob);

      const result = await service.getNextJob('worker-1');

      expect(result).toMatchObject({
        id: 'job-1',
        tool: { id: 'tool-conn-1', name: 'my-connector' },
        workspaceId: 'ws-1',
        configProfileId: 'profile-1',
      });
      expect(result!.command).toBeUndefined();
    });

    it('should NOT include tool/workspaceId for built-in worker', async () => {
      const mockWorker = {
        id: 'worker-bi',
        type: WorkerType.BUILT_IN,
        scope: WorkerScope.LOCAL,
        workspace: { id: 'ws-1' },
        tool: null,
      };
      const mockJob = {
        id: 'job-2',
        category: ToolCategory.SUBDOMAINS,
        createdAt: new Date(),
        updatedAt: new Date(),
        priority: 4,
        command: 'subfinder -d example.com',
        asset: { id: 'asset-1', value: 'example.com' },
      };

      mockDataSource.getRepository.mockReturnValue({
        findOne: jest.fn().mockResolvedValue(mockWorker),
      });
      mockQBGetOne.mockResolvedValue(mockJob);

      const result = await service.getNextJob('worker-bi');

      expect(result).toMatchObject({
        id: 'job-2',
        command: 'subfinder -d example.com',
      });
      expect((result as any).tool).toBeUndefined();
      expect((result as any).workspaceId).toBeUndefined();
      expect((result as any).configProfileId).toBeUndefined();
    });

    it('should include tool/workspaceId/configProfileId for connector job picked up by BUILT_IN worker', async () => {
      const mockWorker = {
        id: 'worker-bi-conn',
        type: WorkerType.BUILT_IN,
        scope: WorkerScope.LOCAL,
        workspace: { id: 'ws-2' },
        tool: null,
        runMode: 'node',
      };
      const mockJob = {
        id: 'job-conn-1',
        category: ToolCategory.VULNERABILITIES,
        createdAt: new Date(),
        updatedAt: new Date(),
        priority: 4,
        command: undefined, // Connector jobs have no command
        asset: { id: 'asset-2', value: 'example.com', target: { workspaceId: 'ws-2' } },
        tool: { id: 'tool-nuclei', name: 'nuclei' },
        configProfileId: 'profile-conn-1',
      };

      mockConnectorRegistryService.getConnector.mockReturnValue({ name: 'nuclei' });
      mockDataSource.getRepository.mockReturnValue({
        findOne: jest.fn().mockResolvedValue(mockWorker),
      });
      mockQBGetOne.mockResolvedValue(mockJob);

      const result = await service.getNextJob('worker-bi-conn');

      expect(result).toMatchObject({
        id: 'job-conn-1',
        tool: { id: 'tool-nuclei', name: 'nuclei' },
        workspaceId: 'ws-2',
        configProfileId: 'profile-conn-1',
      });
      expect(result!.command).toBeUndefined();
    });

    it('should include connector tool names in allowed filter for BUILT_IN workers', async () => {
      const mockWorker = {
        id: 'worker-bi-filter',
        type: WorkerType.BUILT_IN,
        scope: WorkerScope.CLOUD,
        workspace: { id: 'ws-3' },
        tool: null,
        runMode: 'node',
      };

      // Registry fixtures mirror manifest.json entries: name is the display
      // name, slug is the key the DB tool rows store as `name`.
      mockConnectorRegistryService.getAllConnectors.mockReturnValue([
        { name: 'nuclei', slug: 'nuclei' },
        { name: 'wpscan', slug: 'wpscan' },
      ]);

      mockDataSource.getRepository.mockReturnValue({
        findOne: jest.fn().mockResolvedValue(mockWorker),
      });
      mockQBGetOne.mockResolvedValue(null); // No jobs available

      await service.getNextJob('worker-bi-filter');

      // Verify the query builder received the combined tool names (built-in + connector)
      const andWhereCalls = mockQueryRunner.manager.createQueryBuilder().andWhere.mock.calls;
      const namesFilter = andWhereCalls.find(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('IN (:...names)'),
      );
      expect(namesFilter).toBeDefined();
      expect(namesFilter![1].names).toEqual(
        expect.arrayContaining(['subfinder', 'httpx', 'naabu', 'screenshot', 'nuclei', 'wpscan']),
      );
    });

    it('S1 — returns lowercase-slug connector job for node-mode built_in worker when registry name is capitalized', async () => {
      // Pins THE bug: the DB tool row stores the connector SLUG as name
      // ('nuclei'), while the registry's display name is capitalized
      // ('Nuclei'). The `tool.name IN (:...names)` filter must be built from
      // slugs, otherwise connector jobs never match and getNextJob returns null
      // while the node worker polls forever.
      const mockWorker = {
        id: 'worker-bi-slug-s1',
        type: WorkerType.BUILT_IN,
        scope: WorkerScope.CLOUD,
        workspace: { id: 'ws-1' },
        tool: null,
        runMode: 'node',
      };
      const mockJob = {
        id: 'job-conn-slug-s1',
        category: ToolCategory.VULNERABILITIES,
        createdAt: new Date(),
        updatedAt: new Date(),
        priority: 4,
        command: undefined, // Connector jobs have no command
        asset: {
          id: 'asset-slug-s1',
          value: 'example.com',
          target: { workspaceId: 'ws-1' },
        },
        tool: { id: 'tool-nuclei', name: 'nuclei' },
        configProfileId: 'profile-slug-s1',
      };

      // Registry fixture mirrors manifest.json: display name capitalized,
      // slug lowercase (the key of the connectorsBySlug map).
      mockConnectorRegistryService.getAllConnectors.mockReturnValue([
        { name: 'Nuclei', slug: 'nuclei' },
        { name: 'WPScan - WordPress Security Scanner', slug: 'wpscan' },
      ]);
      mockConnectorRegistryService.getConnector.mockImplementation(
        (name: string) =>
          name === 'nuclei'
            ? { name: 'Nuclei', slug: 'nuclei', image: 'nuclei:latest' }
            : null,
      );

      mockDataSource.getRepository.mockReturnValue({
        findOne: jest.fn().mockResolvedValue(mockWorker),
      });

      // Faithfully simulate the SQL filter: getOne only returns the job when
      // the job's tool name is present in the allowed names list.
      mockQBGetOne.mockImplementation(() => {
        const andWhereCalls = mockQueryRunner.manager
          .createQueryBuilder()
          .andWhere.mock.calls;
        const namesFilter = andWhereCalls.find(
          (call: any[]) =>
            typeof call[0] === 'string' && call[0].includes('IN (:...names)'),
        );
        const allowed: string[] = namesFilter?.[1]?.names ?? [];
        return allowed.includes(mockJob.tool.name) ? mockJob : null;
      });

      const result = await service.getNextJob('worker-bi-slug-s1');

      // RED state (name-based list): allowed contains 'Nuclei' not 'nuclei'
      // => job filtered out => null. GREEN (slug-based list): job returned.
      expect(result).not.toBeNull();
      expect(result!.tool).toEqual({ id: 'tool-nuclei', name: 'nuclei' });
      expect(result!.workspaceId).toBe('ws-1');
      expect(result!.configProfileId).toBe('profile-slug-s1');
      expect(result!.command).toBeUndefined();
    });

    it('should NOT include connector tool names in allowed filter for cli-mode BUILT_IN worker', async () => {
      const mockWorker = {
        id: 'worker-bi-filter-cli',
        type: WorkerType.BUILT_IN,
        scope: WorkerScope.CLOUD,
        workspace: { id: 'ws-3' },
        tool: null,
        runMode: 'cli',
      };

      mockConnectorRegistryService.getAllConnectors.mockReturnValue([
        { name: 'nuclei' },
        { name: 'wpscan' },
      ]);

      mockDataSource.getRepository.mockReturnValue({
        findOne: jest.fn().mockResolvedValue(mockWorker),
      });
      mockQBGetOne.mockResolvedValue(null); // No jobs available

      await service.getNextJob('worker-bi-filter-cli');

      const andWhereCalls = mockQueryRunner.manager.createQueryBuilder().andWhere.mock.calls;
      const namesFilter = andWhereCalls.find(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('IN (:...names)'),
      );
      expect(namesFilter).toBeDefined();
      // CLI workers cannot run Docker connectors — only built-in tool names allowed
      expect(namesFilter![1].names).toEqual(
        expect.arrayContaining(['subfinder', 'httpx', 'naabu', 'screenshot']),
      );
      expect(namesFilter![1].names).not.toEqual(
        expect.arrayContaining(['nuclei', 'wpscan']),
      );
    });

    it('should NOT include connector tool names for BUILT_IN worker without runMode (legacy)', async () => {
      const mockWorker = {
        id: 'worker-bi-filter-legacy',
        type: WorkerType.BUILT_IN,
        scope: WorkerScope.CLOUD,
        workspace: { id: 'ws-3' },
        tool: null,
      };

      mockConnectorRegistryService.getAllConnectors.mockReturnValue([
        { name: 'nuclei' },
      ]);

      mockDataSource.getRepository.mockReturnValue({
        findOne: jest.fn().mockResolvedValue(mockWorker),
      });
      mockQBGetOne.mockResolvedValue(null);

      await service.getNextJob('worker-bi-filter-legacy');

      const andWhereCalls = mockQueryRunner.manager.createQueryBuilder().andWhere.mock.calls;
      const namesFilter = andWhereCalls.find(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('IN (:...names)'),
      );
      expect(namesFilter).toBeDefined();
      expect(namesFilter![1].names).not.toEqual(
        expect.arrayContaining(['nuclei']),
      );
    });

    it('getNextJob uses leftJoinAndSelect for tool relation', async () => {
      // S4 — pins the join semantics: the query builder MUST hydrate the tool
      // relation via leftJoinAndSelect, not plain leftJoin (which leaves
      // job.tool undefined and silently breaks connector dispatch).
      const mockWorker = {
        id: 'worker-bi-join',
        type: WorkerType.BUILT_IN,
        scope: WorkerScope.CLOUD,
        workspace: { id: 'ws-3' },
        tool: null,
      };

      mockDataSource.getRepository.mockReturnValue({
        findOne: jest.fn().mockResolvedValue(mockWorker),
      });
      mockQBGetOne.mockResolvedValue(null); // Query is built before getOne runs

      await service.getNextJob('worker-bi-join');

      const toolViaLeftJoin = mockQB.leftJoin.mock.calls.some(
        (call: any[]) => call[0] === 'jobs.tool',
      );
      const toolViaSelect = mockQB.leftJoinAndSelect.mock.calls.some(
        (call: any[]) => call[0] === 'jobs.tool',
      );
      if (!toolViaSelect && toolViaLeftJoin) {
        throw new Error(
          "expected query builder to receive leftJoinAndSelect('jobs.tool','tool'), got leftJoin",
        );
      }
      expect(mockQB.leftJoinAndSelect).toHaveBeenCalledWith('jobs.tool', 'tool');
    });

    it('getNextJob hydrates tool relation for connector jobs', async () => {
      // S1 — happy path: a BUILT_IN worker picking a connector job must see the
      // hydrated job.tool so the connector gate recognizes it and returns the job
      // with tool metadata.
      const mockWorker = {
        id: 'worker-bi-conn-s1',
        type: WorkerType.BUILT_IN,
        scope: WorkerScope.CLOUD,
        workspace: { id: 'ws-1' },
        tool: null,
        runMode: 'node',
      };
      const mockJob = {
        id: 'job-conn-s1',
        category: ToolCategory.VULNERABILITIES,
        createdAt: new Date(),
        updatedAt: new Date(),
        priority: 4,
        command: undefined, // Connector jobs have no command
        asset: { id: 'asset-s1', value: 'example.com', target: { workspaceId: 'ws-1' } },
        tool: { id: 'tool-nuclei', name: 'nuclei' },
        configProfileId: 'profile-s1',
      };

      mockConnectorRegistryService.getConnector.mockImplementation((name: string) =>
        name === 'nuclei' ? { name: 'nuclei' } : null,
      );
      mockDataSource.getRepository.mockReturnValue({
        findOne: jest.fn().mockResolvedValue(mockWorker),
      });
      mockQBGetOne.mockResolvedValue(mockJob);

      const result = await service.getNextJob('worker-bi-conn-s1');

      expect(result).not.toBeNull();
      expect(result!.tool).toEqual({ id: 'tool-nuclei', name: 'nuclei' });
      expect(result!.tool!.name).toBe('nuclei');
      expect(result!.workspaceId).toBe('ws-1');
      expect(result!.configProfileId).toBe('profile-s1');
      expect(result!.command).toBeUndefined();
    });

    it('getNextJob returns matching built-in tool job for non-connector', async () => {
      // S2 — regression: an ordinary built-in tool job (command present) picked by
      // a matching BUILT_IN worker is still returned with its core fields, and the
      // hydrated tool now flows into the response mapping.
      const mockWorker = {
        id: 'worker-bi-s2',
        type: WorkerType.BUILT_IN,
        scope: WorkerScope.CLOUD,
        workspace: { id: 'ws-1' },
        tool: null,
      };
      const mockJob = {
        id: 'job-bi-s2',
        category: ToolCategory.SUBDOMAINS,
        createdAt: new Date(),
        updatedAt: new Date(),
        priority: 4,
        command: 'subfinder -d example.com',
        asset: { id: 'asset-s2', value: 'example.com', target: { workspaceId: 'ws-1' } },
        tool: { id: 'tool-subfinder', name: 'subfinder' },
      };

      mockDataSource.getRepository.mockReturnValue({
        findOne: jest.fn().mockResolvedValue(mockWorker),
      });
      mockQBGetOne.mockResolvedValue(mockJob);

      const result = await service.getNextJob('worker-bi-s2');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('job-bi-s2');
      expect(result!.command).toBe('subfinder -d example.com');
      expect(result!.category).toBe(ToolCategory.SUBDOMAINS);
      expect(result!.asset).toEqual({ id: 'asset-s2', value: 'example.com', target: { workspaceId: 'ws-1' } });
      expect(result!.tool).toEqual({ id: 'tool-subfinder', name: 'subfinder' });
    });

    it('getNextJob returns connector job for connector worker', async () => {
      // S3 — regression: a CONNECTOR (non-built-in) worker picking a connector job
      // still gets the job back with its tool metadata derived from the worker.
      const mockWorker = {
        id: 'worker-conn-s3',
        type: WorkerType.PROVIDER,
        workspace: { id: 'ws-1' },
        tool: { id: 'tool-conn-1', name: 'my-connector' },
      };
      const mockJob = {
        id: 'job-conn-s3',
        category: ToolCategory.VULNERABILITIES,
        createdAt: new Date(),
        updatedAt: new Date(),
        priority: 4,
        command: undefined,
        asset: { id: 'asset-s3', value: 'example.com', target: { workspaceId: 'ws-1' } },
        tool: { id: 'tool-nuclei', name: 'nuclei' },
        configProfileId: 'profile-s3',
      };

      mockDataSource.getRepository.mockReturnValue({
        findOne: jest.fn().mockResolvedValue(mockWorker),
      });
      mockQBGetOne.mockResolvedValue(mockJob);

      const result = await service.getNextJob('worker-conn-s3');

      expect(result).not.toBeNull();
      expect(result!.tool).toEqual({ id: 'tool-conn-1', name: 'my-connector' });
      expect(result!.workspaceId).toBe('ws-1');
      expect(result!.configProfileId).toBe('profile-s3');
      expect(result!.command).toBeUndefined();
    });
  });
});
