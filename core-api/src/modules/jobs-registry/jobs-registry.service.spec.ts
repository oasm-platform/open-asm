import {
  BullMQName,
  DataKind,
  JobPriority,
  JobRunType,
  JobStatus,
  TargetType,
  ToolCategory,
  WorkerScope,
  WorkerType,
} from '@/common/enums/enum';
import { getQueueToken } from '@nestjs/bullmq';
import { NotFoundException } from '@nestjs/common';
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
import { WorkerInstance } from '../workers/entities/worker.entity';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { JobErrorLog } from './entities/job-error-log.entity';
import { JobHistory } from './entities/job-history.entity';
import { Job } from './entities/job.entity';
import { JobsRegistryService } from './jobs-registry.service';

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
      ).rejects.toThrow(NotFoundException);

      expect(qr.rollbackTransaction).toHaveBeenCalled();
      expect(qr.updateBuilder.execute).not.toHaveBeenCalled();
      expect(qr.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a history that does not exist', async () => {
      const qr = buildQueryRunner({ belongsToWorkspace: false });
      mockDataSource.createQueryRunner.mockReturnValue(qr);

      await expect(
        service.cancelJobHistory(mockWorkspaceId, 'missing-history'),
      ).rejects.toThrow(NotFoundException);
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
      steps: {},
      workflow: {
        name: 'test-workflow',
        content: {
          jobs: { test_step: { name: 'Test Step', run: 'test-tool' } },
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
        categories: [{ name: ToolCategory.SUBDOMAINS, targetTypes: HOST }],
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
        steps: [
          {
            id: 'test_step',
            name: 'Test Step',
            run: 'test-tool',
            category: 'subdomains',
            needs: [],
            // Derived from the job rows for a run created before the engine.
            status: 'done',
            jobs: 0,
            toolId: 'tool-uuid',
            logoUrl: 'http://example.com/logo.png',
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

    it('should report a tool as cancelled rather than completed once the run was cancelled', async () => {
      mockJobHistoryRepository.findOne.mockResolvedValue(mockJobHistory);
      mockJobHistoryRepository.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getExists: jest.fn().mockResolvedValue(true),
      });
      mockJobRepository.getRawMany.mockResolvedValue([]);
      mockToolsService.getInstalledTools.mockResolvedValue({ data: [] });

      await service.getJobHistoryDetail(mockWorkspaceId, mockHistoryId);

      // The tool status query is not the only one on the job repository, so
      // look for its CASE expression across every select call.
      const selectArgs = (mockJobRepository.select.mock.calls as unknown[][])
        .map(([arg]) => arg)
        .filter((arg): arg is string[] => Array.isArray(arg))
        .flat();
      const statusExpr = selectArgs.find((s) => s.includes('CASE'))!;
      // Regression: a tool whose jobs finished before the cancel used to keep a
      // green check, because the COMPLETED branch was reached first.
      expect(statusExpr).toContain(
        `WHEN COUNT(CASE WHEN job.status = '${JobStatus.CANCELLED}' THEN 1 END) > 0`,
      );
      expect(statusExpr.indexOf(JobStatus.CANCELLED)).toBeLessThan(
        statusExpr.indexOf(JobStatus.COMPLETED),
      );
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
        steps: [
          {
            id: 'test_step',
            name: 'Test Step',
            run: 'test-tool',
            needs: [],
            status: 'pending',
            jobs: 0,
            toolId: 'tool-uuid',
            logoUrl: 'http://example.com/logo.png',
          },
        ],
      });
    });

    it('exposes the persisted step state of a DAG run', async () => {
      const dagHistory = {
        ...mockJobHistory,
        steps: {
          scan_subdomain: {
            status: 'done',
            jobs: 1,
            dispatchedAt: '2026-01-01T00:00:00.000Z',
            finishedAt: '2026-01-01T00:05:00.000Z',
          },
          port_scan: { status: 'dispatched', jobs: 3, failed: 1 },
          http_probe: {
            status: 'skipped',
            jobs: 0,
            reason: 'blocked-by-failure',
          },
        },
        workflow: {
          name: 'test-workflow',
          content: {
            // Stored in jsonb key order, NOT authored order, exactly as Postgres
            // hands it back — the response must still come out dependencies-first.
            jobs: {
              http_probe: {
                name: 'HTTP Probe',
                run: 'httpx',
                needs: ['port_scan'],
              },
              take_screenshot: {
                name: 'Take Screenshot',
                run: 'screenshot',
                needs: ['http_probe'],
              },
              scan_subdomain: {
                name: 'Scan Subdomain',
                run: 'subfinder',
              },
              port_scan: {
                name: 'Port Scan',
                run: 'naabu',
                needs: ['scan_subdomain'],
              },
            },
          },
        },
      };
      mockJobHistoryRepository.findOne.mockResolvedValue(dagHistory);
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

      expect(result.steps).toEqual([
        {
          id: 'scan_subdomain',
          name: 'Scan Subdomain',
          run: 'subfinder',
          needs: [],
          status: 'done',
          jobs: 1,
          dispatchedAt: new Date('2026-01-01T00:00:00.000Z'),
          finishedAt: new Date('2026-01-01T00:05:00.000Z'),
        },
        {
          id: 'port_scan',
          name: 'Port Scan',
          run: 'naabu',
          needs: ['scan_subdomain'],
          status: 'dispatched',
          jobs: 3,
          failed: 1,
        },
        {
          id: 'http_probe',
          name: 'HTTP Probe',
          run: 'httpx',
          needs: ['port_scan'],
          status: 'skipped',
          reason: 'blocked-by-failure',
          jobs: 0,
        },
        {
          id: 'take_screenshot',
          name: 'Take Screenshot',
          run: 'screenshot',
          needs: ['http_probe'],
          status: 'pending',
          jobs: 0,
        },
      ]);
    });

    it('lists each step with its category and the legacy tool list once per tool', async () => {
      mockJobHistoryRepository.findOne.mockResolvedValue({
        ...mockJobHistory,
        steps: {},
        workflow: {
          name: 'test-workflow',
          content: {
            jobs: {
              ports: { run: 'nmap', category: 'ports_scanner' },
              vulns: { run: 'nmap', category: 'vulnerabilities', needs: ['ports'] },
              probe: { run: 'httpx', needs: ['vulns'] },
            },
          },
        },
      });
      mockJobHistoryRepository.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getExists: jest.fn().mockResolvedValue(true),
      });
      mockJobRepository.getRawMany.mockResolvedValue([]);
      mockToolsService.getInstalledTools.mockResolvedValue({
        data: [
          {
            id: 'tool-nmap',
            name: 'nmap',
            categories: [
              { name: ToolCategory.PORTS_SCANNER, targetTypes: [] },
              { name: ToolCategory.VULNERABILITIES, targetTypes: [] },
            ],
          },
          {
            id: 'tool-httpx',
            name: 'httpx',
            categories: [{ name: ToolCategory.HTTP_PROBE, targetTypes: [] }],
          },
        ],
      });

      const result = await service.getJobHistoryDetail(mockWorkspaceId, mockHistoryId);

      expect(result.steps!.map((step) => [step.id, step.category])).toEqual([
        ['ports', 'ports_scanner'],
        ['vulns', 'vulnerabilities'],
        ['probe', 'http_probe'],
      ]);
      expect(result.tools!.map((tool) => tool.name)).toEqual(['nmap', 'httpx']);
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


  describe('getJobHistoryWorkflow', () => {
    const mockWorkspaceId = 'workspace-uuid';
    const mockHistoryId = 'history-uuid';
    const mockJobHistory = {
      id: mockHistoryId,
      createdAt: new Date(),
      updatedAt: new Date(),
      steps: {},
      jobHistoryName: 'test-job-history',
      workflow: {
        id: 'workflow-uuid',
        name: 'test-workflow',
        content: {
          name: 'test-workflow',
          jobs: { test_step: { name: 'Test Step', run: 'test-tool' } },
        },
      },
    };

    beforeEach(() => {
      jest.clearAllMocks();
      mockJobHistoryRepository.findOne.mockResolvedValue(mockJobHistory);
      mockJobHistoryRepository.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getExists: jest.fn().mockResolvedValue(true),
      });
      mockJobRepository.getRawMany.mockResolvedValue([]);
      mockToolsService.getInstalledTools.mockResolvedValue({ data: [] });
    });

    it('should return the workflow definition of the run as stored', async () => {
      // Scrambled on purpose: jsonb returns object keys in its own order.
      mockJobHistory.workflow.content = {
        jobs: { test_step: { name: 'Test Step', run: 'test-tool' } },
        name: 'test-workflow',
      };
      const result = await service.getJobHistoryWorkflow(
        mockWorkspaceId,
        mockHistoryId,
      );

      expect(result.workflowId).toBe('workflow-uuid');
      expect(result.workflowName).toBe('test-workflow');
      expect(result.content).toEqual(mockJobHistory.workflow.content);
      // Regression: jsonb does not keep key order, so the code view used to
      // print `jobs` before `name` — the opposite of every workflow template.
      expect(Object.keys(result.content!)).toEqual(['name', 'jobs']);
    });

    it('should keep each job category in the stored definition', async () => {
      mockJobHistoryRepository.findOne.mockResolvedValueOnce({
        ...mockJobHistory,
        workflow: {
          ...mockJobHistory.workflow,
          content: {
            name: 'test-workflow',
            jobs: {
              ports: { run: 'nmap', category: 'ports_scanner' },
              vulns: { run: 'nmap', category: 'vulnerabilities', needs: ['ports'] },
            },
          },
        },
      });

      const result = await service.getJobHistoryWorkflow(mockWorkspaceId, mockHistoryId);

      expect(result.content!.jobs).toEqual({
        ports: { run: 'nmap', category: 'ports_scanner' },
        vulns: { run: 'nmap', category: 'vulnerabilities', needs: ['ports'] },
      });
    });

    it('should count the jobs a worker is executing per step (tool + category)', async () => {
      mockJobHistoryRepository.findOne.mockResolvedValueOnce({
        ...mockJobHistory,
        steps: {
          ports: { status: 'dispatched', jobs: 3 },
          vulns: { status: 'dispatched', jobs: 2 },
        },
        workflow: {
          ...mockJobHistory.workflow,
          content: {
            name: 'test-workflow',
            jobs: {
              ports: { run: 'nmap', category: 'ports_scanner' },
              vulns: { run: 'nmap', category: 'vulnerabilities' },
            },
          },
        },
      });
      mockToolsService.getInstalledTools.mockResolvedValue({
        data: [
          {
            id: 'tool-nmap',
            name: 'nmap',
            categories: [
              { name: ToolCategory.PORTS_SCANNER, targetTypes: HOST },
              { name: ToolCategory.VULNERABILITIES, targetTypes: HOST },
            ],
          },
        ],
      });
      mockJobRepository.getRawMany
        // Tool badge statuses.
        .mockResolvedValueOnce([])
        // In-progress jobs per step: the same tool in two categories stays apart.
        .mockResolvedValueOnce([
          { toolId: 'tool-nmap', category: 'ports_scanner', running: '2' },
          { toolId: 'tool-nmap', category: 'vulnerabilities', running: '0' },
        ]);

      const result = await service.getJobHistoryWorkflow(
        mockWorkspaceId,
        mockHistoryId,
      );

      expect(result.steps).toEqual([
        expect.objectContaining({ id: 'ports', status: 'dispatched', running: 2 }),
        // Dispatched but not picked up by a worker yet: no running count.
        expect.objectContaining({ id: 'vulns', status: 'dispatched' }),
      ]);
      expect(result.steps[1].running).toBeUndefined();
    });

    it('should include the run steps so the page can show state next to the definition', async () => {
      const result = await service.getJobHistoryWorkflow(
        mockWorkspaceId,
        mockHistoryId,
      );

      expect(result.steps).toEqual([
        expect.objectContaining({ id: 'test_step', run: 'test-tool' }),
      ]);
    });

    it('should throw NotFoundException when the run is not in the workspace', async () => {
      mockJobHistoryRepository.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getExists: jest.fn().mockResolvedValue(false),
      });

      await expect(
        service.getJobHistoryWorkflow(mockWorkspaceId, mockHistoryId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getJobsTimeline', () => {
    // Two categories of one tool on one target in one run (e.g. nmap ports,
    // then nmap vulnerabilities) are separate steps and must stay separate bars.
    it('starts a new group when the job category changes and groups by it', async () => {
      const query = jest.fn().mockResolvedValue([]);
      (mockDataSource as Record<string, unknown>).query = query;

      await service.getJobsTimeline('ws-1');

      const sql = (query.mock.calls[0][0] as string).replace(/\s+/g, ' ');
      expect(sql).toContain(
        'lag(jobs.category) over (partition by jobs."jobHistoryId" order by jobs."createdAt" desc) = jobs.category',
      );
      expect(sql).toContain('group by grp_id, name, tool_category, target, target_id, "jobHistoryId"');
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

  describe('getManyJobHistories', () => {
    const mockWorkspaceId = 'workspace-uuid';

    interface HistoryQueryBuilder {
      innerJoin: jest.Mock<HistoryQueryBuilder>;
      leftJoin: jest.Mock<HistoryQueryBuilder>;
      where: jest.Mock<HistoryQueryBuilder>;
      andWhere: jest.Mock<HistoryQueryBuilder>;
      select: (args: unknown[]) => HistoryQueryBuilder;
      groupBy: jest.Mock<HistoryQueryBuilder>;
      addGroupBy: jest.Mock<HistoryQueryBuilder>;
      having: jest.Mock<HistoryQueryBuilder>;
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
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn((args: unknown[]) => {
          selectArgs.push(args);
          return qb;
        }),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        having: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
      };
      return { qb, selectArgs };
    };

    /**
     * The method builds a SINGLE query builder. `total` used to require a
     * second, distinct-id aggregate pass; it now rides on the paged select as a
     * `COUNT(*) OVER ()` window, so tests drive one builder and the row count
     * arrives in the same rows.
     */
    const stubHistoryQueryBuilder = () => {
      const paged = buildHistoryQueryBuilder();
      mockJobHistoryRepository.createQueryBuilder.mockReset();
      mockJobHistoryRepository.createQueryBuilder.mockReturnValue(paged.qb);
      return { paged };
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should compute totalJobs and status from joined jobs without correlated subqueries', async () => {
      const { paged } = stubHistoryQueryBuilder();
      const { qb, selectArgs } = paged;
      qb.getRawMany.mockResolvedValue([
        {
          id: 'history-1',
          createdAt: new Date('2024-01-01T00:00:00Z'),
          updatedAt: new Date('2024-01-02T00:00:00Z'),
          totalJobs: '4',
          status: JobStatus.IN_PROGRESS,
          workflowName: 'workflow-1',
          jobHistoryName: 'run-1',
          jobRunType: JobRunType.MANUAL,
          total: '2',
        },
      ]);

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
      expect(selectArgs[0]).toContain('COUNT(*) OVER () as "total"');
      // One query serves both the page and its total
      expect(mockJobHistoryRepository.createQueryBuilder).toHaveBeenCalledTimes(
        1,
      );
      expect(result.total).toBe(2);
    });

    it('should aggregate terminal cancelled status when all jobs are cancelled', async () => {
      const { paged } = stubHistoryQueryBuilder();
      const { qb, selectArgs } = paged;
      qb.getRawMany.mockResolvedValue([]);

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
      expect(statusExpr).toContain(`THEN '${JobStatus.CANCELLED}'`);
      expect(statusExpr).toContain(
        `job.status = '${JobStatus.CANCELLED}') > 0`,
      );
    });

    it('should surface a cancelled run even when some jobs already completed', async () => {
      const { paged } = stubHistoryQueryBuilder();
      const { qb, selectArgs } = paged;
      qb.getRawMany.mockResolvedValue([]);

      await service.getManyJobHistories(mockWorkspaceId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      } as any);

      const statusExpr = selectArgs[0].find(
        (s) => typeof s === 'string' && s.includes('FILTER'),
      ) as string;
      // Derived purely from the child jobs: a cancelled job with nothing left
      // pending/in-progress means the user stopped the run. Without this branch
      // a run cancelled after 30/100 jobs would fall through to "pending".
      expect(statusExpr).toContain(
        `WHEN COUNT(*) FILTER (WHERE job.status = '${JobStatus.CANCELLED}') > 0`,
      );
      expect(statusExpr).toContain(
        `COUNT(*) FILTER (WHERE job.status IN ('${JobStatus.PENDING}', '${JobStatus.IN_PROGRESS}')) = 0`,
      );
      expect(statusExpr.indexOf(JobStatus.CANCELLED)).toBeLessThan(
        statusExpr.indexOf(JobStatus.FAILED),
      );
    });

    it('should aggregate terminal skipped status when all jobs are skipped', async () => {
      const { paged } = stubHistoryQueryBuilder();
      const { qb, selectArgs } = paged;
      qb.getRawMany.mockResolvedValue([]);

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
      const { paged } = stubHistoryQueryBuilder();
      const { qb } = paged;

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
      const { paged } = stubHistoryQueryBuilder();
      const { qb } = paged;

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
      const { paged } = stubHistoryQueryBuilder();
      const { qb } = paged;
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

    it('should apply the search predicate to the page query', async () => {
      const { paged } = stubHistoryQueryBuilder();

      await service.getManyJobHistories(mockWorkspaceId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
        search: 'nightly',
      } as any);

      expect(paged.qb.andWhere).toHaveBeenCalledWith(
        '(jobHistory.jobHistoryName ILIKE :search OR workflow.name ILIKE :search)',
        { search: '%nightly%' },
      );
    });

    it('should filter on the status rollup via HAVING, and skip it for "all"', async () => {
      const filtered = stubHistoryQueryBuilder();

      await service.getManyJobHistories(mockWorkspaceId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
        jobStatus: JobStatus.FAILED,
      } as any);

      const [havingSql, havingParams] = filtered.paged.qb.having.mock.calls[0] as [
        string,
        { jobStatus: string },
      ];
      expect(havingSql).toContain('FILTER');
      expect(havingParams).toEqual({ jobStatus: JobStatus.FAILED });

      const unfiltered = stubHistoryQueryBuilder();
      await service.getManyJobHistories(mockWorkspaceId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
        jobStatus: 'all',
      } as any);
      expect(unfiltered.paged.qb.having).not.toHaveBeenCalled();
    });

    it('should filter by run type and a creation-date range on the page query', async () => {
      const { paged } = stubHistoryQueryBuilder();

      await service.getManyJobHistories(mockWorkspaceId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
        jobRunType: JobRunType.SCHEDULED,
        createdFrom: '2026-01-01',
        createdTo: '2026-01-31',
      } as any);

      const ranged = (qb: typeof paged.qb) => {
        expect(qb.andWhere).toHaveBeenCalledWith(
          'jobHistory.jobRunType = :jobRunType',
          { jobRunType: JobRunType.SCHEDULED },
        );
        expect(qb.andWhere).toHaveBeenCalledWith(
          'jobHistory.createdAt >= :createdFrom',
          { createdFrom: new Date('2026-01-01') },
        );
        const [, params] = qb.andWhere.mock.calls.find(
          ([sql]) => sql === 'jobHistory.createdAt <= :createdTo',
        ) as [string, { createdTo: Date }];
        // A bare date means "through the end of that day".
        expect(params.createdTo.getHours()).toBe(23);
        expect(params.createdTo.getMilliseconds()).toBe(999);
      };

      ranged(paged.qb);
    });

    it('should skip run type and date filters for "all" / absent values', async () => {
      const { paged } = stubHistoryQueryBuilder();

      await service.getManyJobHistories(mockWorkspaceId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
        jobRunType: 'all',
      } as any);

      expect(paged.qb.andWhere).not.toHaveBeenCalled();
    });
  });

  // ── SCREENSHOT live asset-service filter ─────────────────────────────

  describe('createNewJob', () => {
    const mockJobRepo = {
      create: jest
        .fn()
        .mockImplementation((partial: Record<string, unknown>) => ({
          id: 'job-uuid',
          ...partial,
        })),
      save: jest
        .fn()
        .mockImplementation((jobs: unknown) => Promise.resolve(jobs)),
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
      expect(mockJobRepo.save).toHaveBeenCalledTimes(1);
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
      expect(mockJobRepo.save).not.toHaveBeenCalled();
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

  describe('getNextJobs — batched claim', () => {
    const buildWorker = (
      overrides: Record<string, unknown> = {},
    ): Record<string, unknown> => ({
      id: 'worker-uuid',
      type: WorkerType.BUILT_IN,
      scope: WorkerScope.CLOUD,
      runMode: 'node',
      internalNetworkId: null,
      workspace: { id: 'workspace-uuid' },
      tool: null,
      ...overrides,
    });

    const buildQueryRunner = (jobs: unknown[]) => {
      const qb = {
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(jobs),
      };

      const queryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        manager: {
          createQueryBuilder: jest.fn().mockReturnValue(qb),
          update: jest.fn().mockResolvedValue({ affected: jobs.length }),
        },
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
      };

      return { qb, queryRunner };
    };

    const givenWorkerAndQueue = (worker: unknown, jobs: unknown[]) => {
      const { qb, queryRunner } = buildQueryRunner(jobs);
      mockDataSource.getRepository.mockReturnValue({
        findOne: jest.fn().mockResolvedValue(worker),
      } as any);
      mockDataSource.createQueryRunner.mockReturnValue(queryRunner as any);
      return { qb, queryRunner };
    };

    beforeEach(() => {
      mockConnectorRegistryService.getAllConnectors.mockReturnValue([]);
    });

    it('claims up to `limit` jobs in one query and one update', async () => {
      // Given: three pending jobs and a worker with three free slots
      const jobs = [
        { id: 'job-1', asset: { id: 'a1', value: 'x' } },
        { id: 'job-2', asset: { id: 'a2', value: 'y' } },
        { id: 'job-3', asset: { id: 'a3', value: 'z' } },
      ];
      const { qb, queryRunner } = givenWorkerAndQueue(buildWorker(), jobs);

      // When
      const result = await service.getNextJobs('worker-uuid', 3);

      // Then: a single claim replaces three per-slot claims
      expect(result).toHaveLength(3);
      expect(mockDataSource.getRepository).toHaveBeenCalledWith(WorkerInstance);
      expect(qb.limit).toHaveBeenCalledWith(3);
      expect(queryRunner.manager.update).toHaveBeenCalledTimes(1);
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
      expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    });

    it('caps the claim so a worker cannot drain the whole queue', async () => {
      // Given: a worker asking for far more than the server-side ceiling
      const { qb } = givenWorkerAndQueue(buildWorker(), []);

      // When
      await service.getNextJobs('worker-uuid', 100000);

      // Then
      expect(qb.limit).toHaveBeenCalledWith(100);
    });

    it('returns an empty list and rolls back when nothing is claimable', async () => {
      // Given: an idle queue
      const { queryRunner } = givenWorkerAndQueue(buildWorker(), []);

      // When
      const result = await service.getNextJobs('worker-uuid', 5);

      // Then: no work is claimed and nothing is written
      expect(result).toEqual([]);
      expect(queryRunner.manager.update).not.toHaveBeenCalled();
      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('enforces job eligibility in SQL instead of dropping the whole claim', async () => {
      // Given: a node worker that is allowed to run connectors
      mockConnectorRegistryService.getAllConnectors.mockReturnValue([
        { slug: 'nuclei' },
      ]);
      const { qb } = givenWorkerAndQueue(buildWorker(), []);

      // When
      await service.getNextJobs('worker-uuid', 2);

      // Then: "has a command or belongs to a connector" is a WHERE clause, so a
      // command-less non-connector job at the head of the queue can no longer
      // starve the rest of the batch (the previous post-query filter did).
      const predicates = qb.andWhere.mock.calls.map((call) => String(call[0]));
      expect(
        predicates.some((sql) => sql.includes('jobs.command IS NOT NULL')),
      ).toBe(true);
      expect(predicates.some((sql) => sql.includes('connectorSlugs'))).toBe(
        true,
      );
    });

    it('does not require the connector clause on a cli-mode worker', async () => {
      // Given: a CLI worker that has no Docker and therefore no connector tools
      const { qb } = givenWorkerAndQueue(buildWorker({ runMode: 'cli' }), []);

      // When
      await service.getNextJobs('worker-uuid', 2);

      // Then: only the command check applies
      const predicates = qb.andWhere.mock.calls.map((call) => String(call[0]));
      expect(
        predicates.some((sql) => sql.includes('jobs.command IS NOT NULL')),
      ).toBe(true);
      expect(predicates.some((sql) => sql.includes('connectorSlugs'))).toBe(
        false,
      );
    });

    it('getNextJob delegates to the batched claim', async () => {
      // Given: one claimable job
      const { qb } = givenWorkerAndQueue(buildWorker(), [
        { id: 'job-1', asset: { id: 'a1', value: 'x' } },
      ]);

      // When
      const job = await service.getNextJob('worker-uuid');

      // Then
      expect(job?.id).toBe('job-1');
      expect(qb.limit).toHaveBeenCalledWith(1);
    });

    it('getNextJob returns null when the claim is empty', async () => {
      givenWorkerAndQueue(buildWorker(), []);

      await expect(service.getNextJob('worker-uuid')).resolves.toBeNull();
    });

    it('does not roll back a committed claim when attaching templates fails', async () => {
      const { queryRunner } = givenWorkerAndQueue(buildWorker(), [
        { id: 'job-1', asset: { id: 'a1', value: 'x' } },
      ]);
      (queryRunner as any).isTransactionActive = true;
      queryRunner.commitTransaction.mockImplementation(() => {
        (queryRunner as any).isTransactionActive = false;
      });
      jest
        .spyOn(service as any, 'attachCustomTemplates')
        .mockRejectedValue(new Error('boom'));

      await expect(service.getNextJobs('worker-uuid', 1)).resolves.toEqual([]);

      expect(queryRunner.commitTransaction).toHaveBeenCalled();
      expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    });

    it('rolls back and returns [] when the claim fails before commit', async () => {
      const { queryRunner } = givenWorkerAndQueue(buildWorker(), [
        { id: 'job-1', asset: { id: 'a1', value: 'x' } },
      ]);
      (queryRunner as any).isTransactionActive = true;
      queryRunner.manager.update.mockRejectedValue(new Error('update failed'));

      await expect(service.getNextJobs('worker-uuid', 1)).resolves.toEqual([]);

      expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    describe('custom templates', () => {
      const templateJob = (id: string) => ({
        id,
        retryCount: 0,
        tool: { id: 'tool-1', name: 'nuclei' },
        asset: { id: `a-${id}`, value: 'x', target: { workspaceId: 'ws-1' } },
        config: { rateLimit: 10, customTemplateIds: ['t1', 't2'] },
      });

      const givenTemplates = (rows: unknown[]) => {
        const artifactRepo = { find: jest.fn().mockResolvedValue(rows) };
        mockDataSource.getRepository.mockImplementation((entity: unknown) =>
          entity === WorkerInstance
            ? { findOne: jest.fn().mockResolvedValue(buildWorker()) }
            : artifactRepo,
        );
        return artifactRepo;
      };

      beforeEach(() => {
        (mockStorageService as Record<string, jest.Mock>).getPresignedDownloadUrl =
          jest.fn(({ key }: { key: string }) =>
            Promise.resolve({ url: `http://rustfs:9000/${key}?sig`, expiresIn: 3600 }),
          );
      });

      it('swaps template ids for presigned urls, signing each run once', async () => {
        givenWorkerAndQueue(buildWorker(), [templateJob('j1'), templateJob('j2')]);
        const artifactRepo = givenTemplates([
          { id: 't2', bucket: 'artifacts', objectKey: 'k2', updatedAt: new Date(7) },
          { id: 't1', bucket: 'artifacts', objectKey: 'k1', updatedAt: new Date(5) },
        ]);

        const result = await service.getNextJobs('worker-uuid', 2);

        expect(result).toHaveLength(2);
        expect(result[0].config).toEqual({
          rateLimit: 10,
          customTemplates: [
            { url: 'http://rustfs:9000/k1?sig', cacheKey: 't1-5' },
            { url: 'http://rustfs:9000/k2?sig', cacheKey: 't2-7' },
          ],
        });
        expect(artifactRepo.find).toHaveBeenCalledTimes(1);
        expect(artifactRepo.find).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ workspaceId: 'ws-1' }),
          }),
        );
        expect(
          (mockStorageService as Record<string, jest.Mock>).getPresignedDownloadUrl,
        ).toHaveBeenCalledWith(expect.objectContaining({ absolute: true }));
      });

      it('fails a job whose template is gone instead of dispatching it', async () => {
        givenWorkerAndQueue(buildWorker(), [templateJob('j1')]);
        givenTemplates([
          { id: 't1', bucket: 'artifacts', objectKey: 'k1', updatedAt: new Date(5) },
        ]);
        mockJobRepository.update.mockClear();

        const result = await service.getNextJobs('worker-uuid', 1);

        expect(result).toEqual([]);
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

      it('still dispatches the rest of the batch when failing a job throws', async () => {
        givenWorkerAndQueue(buildWorker(), [
          templateJob('j1'),
          { id: 'j2', retryCount: 0, tool: { id: 'tool-1', name: 'nuclei' }, asset: { id: 'a-j2', value: 'x' }, config: {} },
        ]);
        givenTemplates([
          { id: 't1', bucket: 'artifacts', objectKey: 'k1', updatedAt: new Date(5) },
        ]);
        jest
          .spyOn(service as any, 'handleJobError')
          .mockRejectedValue(new Error('db down'));

        const result = await service.getNextJobs('worker-uuid', 2);

        expect(result.map((j) => (j as { id: string }).id)).toEqual(['j2']);
      });
    });
  });

});
