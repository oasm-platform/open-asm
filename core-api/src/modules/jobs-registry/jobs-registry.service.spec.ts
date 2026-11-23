import { BullMQName, DataKind, JobStatus, TargetType, ToolCategory, WorkerType } from '@/common/enums/enum';
import { getQueueToken } from '@nestjs/bullmq';

import { EventEmitter2 } from '@nestjs/event-emitter';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ProjectWorkflow } from '../projects/entities/project-workflow.entity';
import { ConnectorRegistryService } from '../connectors/connector-registry.service';
import { DataAdapterService } from '../data-adapter/data-adapter.service';
import { StorageService } from '../storage/storage.service';
import { ToolConfigProfilesService } from '../tools/tool-config-profiles.service';
import type { Tool } from '../tools/entities/tools.entity';
import { ToolsService } from '../tools/tools.service';
import { WorkerStreamRegistry } from '../workers/worker-stream-registry.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { JobErrorLog } from './entities/job-error-log.entity';
import { JobHistory } from './entities/job-history.entity';
import type { UpdateResultDto } from './dto/jobs-registry.dto';
import { Job } from './entities/job.entity';
import { JobsRegistryService } from './jobs-registry.service';
import { NotFoundError } from '@/common/errors/domain.errors';

const HOST = [TargetType.DOMAIN, TargetType.IP, TargetType.CIDR];

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
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    count: jest.fn(),
    exists: jest.fn(),
  };

  const mockJobHistoryRepository = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockJobErrorLogRepository = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockProjectWorkflowRepository = {
    createQueryBuilder: jest.fn(),
  };

  let mockProjectWorkflowQB: {
    select: jest.Mock;
    innerJoin: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    getOne: jest.Mock;
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
    resolveConfigForJob: jest.fn(),
    sealJobConfig: jest.fn(
      (_workspaceId: string, _tool: string, config: unknown) =>
        Promise.resolve(config ?? null),
    ),
  };

  const mockWorkerStreamRegistry = {
    publishCancel: jest.fn().mockResolvedValue(undefined),
    publishJobsAvailable: jest.fn().mockResolvedValue(undefined),
    register: jest.fn(),
    unregister: jest.fn(),
  };

  beforeEach(async () => {
    mockProjectWorkflowQB = {
      select: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    mockProjectWorkflowRepository.createQueryBuilder.mockReturnValue(
      mockProjectWorkflowQB,
    );

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
          provide: getRepositoryToken(ProjectWorkflow),
          useValue: mockProjectWorkflowRepository,
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
        {
          provide: WorkerStreamRegistry,
          useValue: mockWorkerStreamRegistry,
        },
        JobsRegistryService,
      ],
    }).compile();

    service = module.get<JobsRegistryService>(JobsRegistryService);
    // Manually set optional toolsService since @Optional() dependencies may not be injected in tests
    (service as any).toolsService = mockToolsService;
    // The mocks are module-scoped, so cancel pushes must not leak between tests.
    mockWorkerStreamRegistry.publishCancel.mockClear();
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
      // Workers in the workspace are nudged to claim it now, not on next poll.
      expect(mockWorkerStreamRegistry.publishJobsAvailable).toHaveBeenCalledWith(
        mockWorkspaceId,
      );

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
      ).rejects.toThrow(NotFoundError);
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

    it('publishes a cancel to the worker stream when the job was running', async () => {
      // Given: a job that a worker is executing right now
      const runningJob = {
        id: mockJobId,
        status: JobStatus.IN_PROGRESS,
        workerId: 'worker-uuid',
        retryCount: 0,
        asset: { target: { id: 'target-uuid' } },
      };
      const mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        manager: { save: jest.fn().mockResolvedValue(runningJob) },
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
      };
      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
      mockJobRepository.getOne.mockResolvedValue(runningJob);
      mockWorkerStreamRegistry.publishCancel.mockClear();

      // When: the job is cancelled from the console
      await service.cancelJob(mockWorkspaceId, mockJobId);

      // Then: the owning worker is told to stop, after the DB commit
      expect(mockWorkerStreamRegistry.publishCancel).toHaveBeenCalledWith({
        workerId: 'worker-uuid',
        jobId: mockJobId,
        reason: 'cancelled by user',
      });
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('does not publish a cancel when no worker was running the job', async () => {
      // Given: a queued job that no worker has picked up
      const pendingJob = {
        id: mockJobId,
        status: JobStatus.PENDING,
        retryCount: 0,
        asset: { target: { id: 'target-uuid' } },
      };
      const mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        manager: { save: jest.fn().mockResolvedValue(pendingJob) },
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
      };
      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
      mockJobRepository.getOne.mockResolvedValue(pendingJob);
      mockWorkerStreamRegistry.publishCancel.mockClear();

      // When
      await service.cancelJob(mockWorkspaceId, mockJobId);

      // Then: nobody is told to stop anything
      expect(mockWorkerStreamRegistry.publishCancel).not.toHaveBeenCalled();
    });

    it('still reports success when publishing the cancel fails', async () => {
      // Given: a running job whose stream cannot be reached
      const runningJob = {
        id: mockJobId,
        status: JobStatus.IN_PROGRESS,
        workerId: 'worker-uuid',
        retryCount: 0,
        asset: { target: { id: 'target-uuid' } },
      };
      const mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        manager: { save: jest.fn().mockResolvedValue(runningJob) },
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
      };
      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
      mockJobRepository.getOne.mockResolvedValue(runningJob);
      mockWorkerStreamRegistry.publishCancel.mockRejectedValueOnce(
        new Error('redis down'),
      );

      // When / Then: the cancellation itself still succeeds (best-effort push)
      await expect(
        service.cancelJob(mockWorkspaceId, mockJobId),
      ).resolves.toEqual({ message: 'Job cancelled successfully' });
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
      ).rejects.toThrow(NotFoundError);
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

  describe('cancelJobHistory', () => {
    const mockWorkspaceId = 'workspace-uuid';
    const mockHistoryId = 'history-uuid';

    const buildQueryRunner = ({
      belongsToWorkspace = true,
      affected = 3,
      running = [] as { jobId: string; workerId: string }[],
      steps = {},
    } = {}) => {
      const ownershipBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getExists: jest.fn().mockResolvedValue(belongsToWorkspace),
      };
      const runningBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(running),
      };
      const updateBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected }),
      };
      const findOne = jest.fn().mockResolvedValue({
        id: mockHistoryId,
        steps,
        isCompleted: false,
      });
      const update = jest.fn().mockResolvedValue({ affected: 1 });
      const manager = {
        // Three shapes: the 'jobHistory' alias is the ownership lookup, the
        // 'job' alias is the "which jobs are executing right now" lookup, and
        // no alias is the bulk update.
        createQueryBuilder: jest.fn((entity?: unknown, alias?: string) => {
          if (alias === 'job') return runningBuilder;
          return entity ? ownershipBuilder : updateBuilder;
        }),
        findOne,
        update,
      };

      return {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        manager,
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
        ownershipBuilder,
        runningBuilder,
        updateBuilder,
        findOne,
        update,
      };
    };

    it('cancels every job of the run, keeping the completion time of finished ones', async () => {
      const qr = buildQueryRunner({ affected: 100 });
      mockDataSource.createQueryRunner.mockReturnValue(qr);

      const result = await service.cancelJobHistory(
        mockWorkspaceId,
        mockHistoryId,
      );

      // COALESCE keeps the real completedAt so an already-finished job does not
      // look like it completed at cancel time.
      expect(qr.updateBuilder.set).toHaveBeenCalledWith({
        status: JobStatus.CANCELLED,
        completedAt: expect.any(Function),
      });
      expect(qr.updateBuilder.where).toHaveBeenCalledWith(
        '"jobHistoryId" = :jobHistoryId',
        { jobHistoryId: mockHistoryId },
      );
      expect(qr.commitTransaction).toHaveBeenCalled();
      expect(result.message).toContain('100');
      // Nothing was executing, so no worker is told to stop.
      expect(mockWorkerStreamRegistry.publishCancel).not.toHaveBeenCalled();
    });

    it('stops every job of the run that a worker was executing', async () => {
      const qr = buildQueryRunner({
        affected: 2,
        running: [
          { jobId: 'job-a', workerId: 'worker-1' },
          { jobId: 'job-b', workerId: 'worker-2' },
        ],
      });
      mockDataSource.createQueryRunner.mockReturnValue(qr);
      mockWorkerStreamRegistry.publishCancel.mockClear();

      await service.cancelJobHistory(mockWorkspaceId, mockHistoryId);

      expect(mockWorkerStreamRegistry.publishCancel).toHaveBeenCalledTimes(2);
      expect(mockWorkerStreamRegistry.publishCancel).toHaveBeenCalledWith({
        workerId: 'worker-1',
        jobId: 'job-a',
        reason: 'run cancelled by user',
      });
      expect(mockWorkerStreamRegistry.publishCancel).toHaveBeenCalledWith({
        workerId: 'worker-2',
        jobId: 'job-b',
        reason: 'run cancelled by user',
      });
    });

    it('closes the run so no further step can ever be dispatched', async () => {
      const qr = buildQueryRunner({
        steps: {
          'Port Scan': { status: 'pending', jobs: 0 },
          'HTTP Probe': { status: 'dispatched', jobs: 2 },
          'Vuln Scan': { status: 'done', jobs: 1 },
        },
      });
      mockDataSource.createQueryRunner.mockReturnValue(qr);

      await service.cancelJobHistory(mockWorkspaceId, mockHistoryId);

      const [, , patch]: [unknown, unknown, Record<string, unknown>] = qr
        .update.mock.calls[0] as [unknown, unknown, Record<string, unknown>];
      expect(qr.update).toHaveBeenCalledWith(
        JobHistory,
        { id: mockHistoryId },
        expect.objectContaining({ isCompleted: true }),
      );
      expect(patch.steps).toMatchObject({
        'Port Scan': { status: 'skipped', reason: 'run-cancelled' },
        'HTTP Probe': { status: 'skipped', reason: 'run-cancelled' },
        'Vuln Scan': { status: 'done' },
      });
    });

    it('throws NotFoundException and rolls back for a history outside the workspace', async () => {
      const qr = buildQueryRunner({ belongsToWorkspace: false });
      mockDataSource.createQueryRunner.mockReturnValue(qr);

      await expect(
        service.cancelJobHistory(mockWorkspaceId, mockHistoryId),
      ).rejects.toThrow(NotFoundError);

      expect(qr.rollbackTransaction).toHaveBeenCalled();
      expect(qr.updateBuilder.execute).not.toHaveBeenCalled();
      expect(qr.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a history that does not exist', async () => {
      const qr = buildQueryRunner({ belongsToWorkspace: false });
      mockDataSource.createQueryRunner.mockReturnValue(qr);

      await expect(
        service.cancelJobHistory(mockWorkspaceId, 'missing-history'),
      ).rejects.toThrow(NotFoundError);
      expect(qr.commitTransaction).not.toHaveBeenCalled();
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
      ).rejects.toThrow(NotFoundError);
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

    it('should mask secrets in the returned job config', async () => {
      mockJobRepository.getManyAndCount.mockResolvedValue([
        [
          {
            id: 'job-1',
            tool: { name: 'acunetix' },
            config: {
              url: 'https://acunetix.local',
              apiKey: 'super-secret-key',
            },
          },
        ],
        1,
      ]);
      mockConnectorRegistryService.getConnector.mockReturnValue({
        configSchema: {
          properties: { apiKey: { type: 'string', 'ui:widget': 'password' } },
        },
      });

      const result = await service.getManyJobs(mockWorkspaceId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      } as any);

      expect(result.data[0].config).toEqual({
        url: 'https://acunetix.local',
        apiKey: '****-key',
      });
    });

    it('should still mask secret-named config keys when no connector schema resolves', async () => {
      mockJobRepository.getManyAndCount.mockResolvedValue([
        [
          {
            id: 'job-2',
            tool: { name: 'unknown-connector' },
            config: { url: 'https://x.local', password: 'hunter2' },
          },
        ],
        1,
      ]);
      mockConnectorRegistryService.getConnector.mockReturnValue(null);

      const result = await service.getManyJobs(mockWorkspaceId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      } as any);

      expect(result.data[0].config).toEqual({
        url: 'https://x.local',
        password: '****ter2',
      });
    });
  });

  // ── SCREENSHOT live asset-service filter ─────────────────────────────

  describe('failUndispatchableJob', () => {
    it('fails the job only while it is still in progress and logs why', async () => {
      await service.failUndispatchableJob('job-1', 'Not dispatched: reason');

      expect(mockJobRepository.update).toHaveBeenCalledWith(
        { id: 'job-1', status: JobStatus.IN_PROGRESS },
        { status: JobStatus.FAILED },
      );
      expect(mockJobErrorLogRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          job: { id: 'job-1' },
          logMessage: 'Not dispatched: reason',
        }),
      );
    });
  });

  describe('handleJobError', () => {
    const failing = { id: 'j1', retryCount: 0 } as Job;

    it('fails the job only while it is still in progress and logs the error', async () => {
      mockJobRepository.update.mockClear();
      mockJobErrorLogRepository.findOne.mockResolvedValue(null);

      await service.handleJobError(
        { jobId: 'j1', data: {} as UpdateResultDto['data'] },
        failing,
        new Error('A custom template of this run no longer exists'),
      );

      expect(mockJobRepository.update).toHaveBeenCalledWith(
        { id: 'j1', status: JobStatus.IN_PROGRESS },
        expect.objectContaining({ status: JobStatus.FAILED }),
      );
      expect(mockJobErrorLogRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          logMessage: 'A custom template of this run no longer exists',
        }),
      );
    });
  });

  describe('createNewJob', () => {
    const mockJobRepo = {
      create: jest
        .fn()
        .mockImplementation((partial: Record<string, unknown>) => ({
          id: 'job-uuid',
          ...partial,
        })),
      insert: jest.fn().mockResolvedValue({ identifiers: [] }),
    };

    const apex = { id: 'a-apex', value: 'example.com', isPrimary: true, target: { type: TargetType.DOMAIN } };
    const app = { id: 'a-app', value: 'app.example.com', isPrimary: false, target: { type: TargetType.DOMAIN } };
    const web8443 = { id: 's-8443', assetId: 'a-app', value: 'app.example.com:8443', port: 8443 };

    /** What the step-scope loader returns: apex never probed, app with one web service. */
    const loadedScope = () => ({
      scope: {
        assets: [
          { id: apex.id, value: apex.value, isPrimary: true, targetType: TargetType.DOMAIN },
          { id: app.id, value: app.value, isPrimary: false, targetType: TargetType.DOMAIN },
        ],
        services: new Map([['a-app', [web8443]]]),
        web: new Map([['a-app', [{ ...web8443, scheme: 'https' as const }]]]),
      },
      assets: new Map<string, unknown>([
        [apex.id, apex],
        [app.id, app],
      ]),
      services: new Map<string, unknown>([[web8443.id, web8443]]),
    });

    let load: jest.SpyInstance;

    const tool = (name: string, categories: unknown[]): Tool =>
      ({ id: `tool-${name}`, name, categories, priority: 4 }) as unknown as Tool;
    const nikto = tool('nikto', [
      {
        name: ToolCategory.VULNERABILITIES,
        targetTypes: [TargetType.DOMAIN, TargetType.IP],
        inputs: [DataKind.WEB, DataKind.HOST],
      },
    ]);
    const httpx = tool('httpx', [{ name: ToolCategory.HTTP_PROBE, targetTypes: HOST }]);
    const nmap = tool('nmap', [
      { name: ToolCategory.PORTS_SCANNER, targetTypes: [TargetType.DOMAIN, TargetType.IP] },
      { name: ToolCategory.HTTP_PROBE, targetTypes: [TargetType.DOMAIN] },
    ]);
    const run = (args: Record<string, unknown>) =>
      service.createNewJob({
        workspaceId: 'ws-1',
        workflow: { id: 'wf-1' } as any,
        ...args,
      } as any);

    beforeEach(() => {
      jest.clearAllMocks();
      mockJobHistoryRepository.create = jest.fn().mockReturnValue({ id: 'jh-1' });
      mockJobHistoryRepository.save = jest.fn().mockResolvedValue({ id: 'jh-1' });
      mockConnectorRegistryService.getConnector.mockReturnValue(null);
      mockDataSource.getRepository.mockReturnValue(mockJobRepo);
      load = jest
        .spyOn((service as any).stepScope, 'load')
        .mockResolvedValue(loadedScope());
    });

    it("plans the jobs over the scope with the category's inputs", async () => {
      const jobs = await run({ tool: nikto, targetIds: ['t-1'] });

      expect(load).toHaveBeenCalledWith([DataKind.WEB, DataKind.HOST], {
        targetIds: ['t-1'],
        assetIds: undefined,
        assetServiceIds: undefined,
        workspaceId: 'ws-1',
        targetTypes: [TargetType.DOMAIN, TargetType.IP],
      });
      // The apex was never probed: its host. The app: its web service.
      expect(jobs.map((job) => [job.asset, job.assetService])).toEqual([
        [apex, undefined],
        [app, web8443],
      ]);
      expect(jobs.every((job) => job.category === ToolCategory.VULNERABILITIES)).toBe(true);
      expect(mockJobRepo.insert).toHaveBeenCalledTimes(1);
      expect(mockWorkerStreamRegistry.publishJobsAvailable).toHaveBeenCalledWith('ws-1');
    });

    it("runs the step's own input instead of the category's", async () => {
      const jobs = await run({ tool: nikto, input: [DataKind.WEB] });

      expect(load).toHaveBeenCalledWith([DataKind.WEB], expect.anything());
      expect(jobs.map((job) => job.assetService?.id)).toEqual(['s-8443']);
    });

    it('rejects an input the category does not take', async () => {
      await expect(run({ tool: nikto, input: [DataKind.URL] })).rejects.toThrow(
        '"nikto" (vulnerabilities) takes web, host; it cannot take url',
      );
      expect(load).not.toHaveBeenCalled();
    });

    it('stores the connector inputs on the job, the URL in target', async () => {
      mockConnectorRegistryService.getConnector.mockReturnValue({ image: 'ghcr.io/nikto' });
      mockToolConfigProfilesService.resolveConfigForJob.mockResolvedValue({ level: 1 });

      const jobs = await run({ tool: nikto });

      expect(jobs.map((job) => job.inputs)).toEqual([
        { target: 'example.com' },
        { target: 'https://app.example.com:8443' },
      ]);
      expect(jobs.every((job) => job.command === undefined)).toBe(true);
    });

    it('stores the connector config sealed, never the decrypted secret', async () => {
      mockConnectorRegistryService.getConnector.mockReturnValue({ image: 'ghcr.io/nikto' });
      mockToolConfigProfilesService.resolveConfigForJob.mockResolvedValue({
        apiKey: 'plain-key',
        level: 1,
      });
      mockToolConfigProfilesService.sealJobConfig.mockResolvedValueOnce({
        apiKey: 'v2:dek:sealed',
        level: 1,
      });

      const jobs = await run({ tool: nikto });

      expect(mockToolConfigProfilesService.sealJobConfig).toHaveBeenCalledWith(
        'ws-1',
        'nikto',
        { apiKey: 'plain-key', level: 1 },
      );
      expect(jobs.map((job) => job.config)).toEqual([
        { apiKey: 'v2:dek:sealed', level: 1 },
        { apiKey: 'v2:dek:sealed', level: 1 },
      ]);
    });

    it('binds a built-in command to the service, with no stored inputs', async () => {
      const jobs = await run({ tool: httpx });

      expect(load).toHaveBeenCalledWith([DataKind.SERVICE], expect.anything());
      expect(jobs).toHaveLength(1);
      expect(jobs[0].assetService).toBe(web8443);
      expect(jobs[0].inputs).toBeNull();
    });

    it('creates no job when nothing in scope fits (the step is skipped)', async () => {
      load.mockResolvedValue({ scope: { assets: [] }, assets: new Map(), services: new Map() });

      expect(await run({ tool: nikto })).toEqual([]);
      expect(mockJobRepo.insert).not.toHaveBeenCalled();
    });

    it('inserts a big step in chunks of JOB_INSERT_CHUNK', async () => {
      // Given: 2,500 never-probed hosts in scope
      const hosts = Array.from({ length: 2_500 }, (_, i) => ({
        id: `a-${i}`,
        value: `h${i}.example.com`,
        isPrimary: false,
        targetType: TargetType.DOMAIN,
      }));
      load.mockResolvedValue({
        scope: { assets: hosts },
        assets: new Map(hosts.map((host) => [host.id, host])),
        services: new Map(),
      });

      // When
      const jobs = await run({ tool: nikto });

      // Then: three statements, none over the chunk size, every job written once
      const sizes = mockJobRepo.insert.mock.calls.map(
        ([rows]: [unknown[]]) => rows.length,
      );
      expect(sizes).toEqual([1_000, 1_000, 500]);
      expect(jobs).toHaveLength(2_500);
      expect(mockWorkerStreamRegistry.publishJobsAvailable).toHaveBeenCalledTimes(1);
    });

    it("writes on the caller's transaction and leaves the hint to the caller", async () => {
      // Given: a caller transaction whose savepoint hands out its own repository
      const txRepo = { insert: jest.fn().mockResolvedValue({ identifiers: [] }) };
      const manager = {
        transaction: jest.fn((work: (m: unknown) => Promise<unknown>) =>
          work({ getRepository: () => txRepo }),
        ),
      };

      // When
      await service.createNewJob(
        { workspaceId: 'ws-1', workflow: { id: 'wf-1' }, tool: nikto } as any,
        { manager: manager as any },
      );

      // Then
      expect(manager.transaction).toHaveBeenCalledTimes(1);
      expect(txRepo.insert).toHaveBeenCalledTimes(1);
      expect(mockJobRepo.insert).not.toHaveBeenCalled();
      expect(mockWorkerStreamRegistry.publishJobsAvailable).not.toHaveBeenCalled();
    });

    describe('category selection', () => {
      it('defaults the category, its inputs and target types to the first one', async () => {
        const jobs = await run({ tool: nmap });

        expect(load).toHaveBeenCalledWith(
          [DataKind.HOST],
          expect.objectContaining({ targetTypes: [TargetType.DOMAIN, TargetType.IP] }),
        );
        expect(new Set(jobs.map((j) => j.category))).toEqual(new Set([ToolCategory.PORTS_SCANNER]));
      });

      it('uses the requested category for inputs and target types', async () => {
        await run({ tool: nmap, category: ToolCategory.HTTP_PROBE });

        expect(load).toHaveBeenCalledWith(
          [DataKind.SERVICE],
          expect.objectContaining({ targetTypes: [TargetType.DOMAIN] }),
        );
      });

      it('rejects a category the tool does not declare', async () => {
        await expect(run({ tool: nmap, category: ToolCategory.SCREENSHOT })).rejects.toThrow(
          'Tool "nmap" has no category "screenshot"',
        );
      });

      it('treats a category without declared target types as a host scanner', async () => {
        await run({ tool: tool('naabu', [{ name: ToolCategory.PORTS_SCANNER, targetTypes: [] }]) });

        expect(load).toHaveBeenCalledWith(
          [DataKind.HOST],
          expect.objectContaining({ targetTypes: HOST }),
        );
      });
    });

    it('passes the explicit scope of a project run through to the loader', async () => {
      await run({ tool: nikto, assetIds: ['a-1', 'a-2'], assetServiceIds: ['s-1'] });

      expect(load).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ assetIds: ['a-1', 'a-2'], assetServiceIds: ['s-1'], targetIds: undefined }),
      );
    });
  });

});
