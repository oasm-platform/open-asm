import { JobStatus, ToolCategory, WorkerType } from '@/common/enums/enum';
import { DataAdapterService } from '@/modules/data-adapter/data-adapter.service';
import { StorageService } from '@/modules/storage/storage.service';
import { RedisService } from '@/services/redis/redis.service';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Job } from '@/modules/jobs-registry/entities/job.entity';
import { JobsRegistryService } from '@/modules/jobs-registry/jobs-registry.service';
import { JobResultProcessor } from '@/modules/jobs-registry/processors/job-result.processor';
import { WorkflowRunnerService } from '@/modules/jobs-registry/workflow-runner.service';

describe('JobResultProcessor', () => {
  let processor: JobResultProcessor;
  let storageService: StorageService;

  const mockJobsRegistryService = {
    findJobForUpdate: jest.fn(),
    handleJobError: jest.fn(),
  };

  const mockWorkflowRunnerService = {
    onJobTerminal: jest.fn(),
  };

  const mockDataAdapterService = {
    syncData: jest.fn(),
  };

  const mockRedisService = {
    publish: jest.fn(),
  };

  const mockStorageService = {
    readJsonFile: jest.fn(),
    deleteFile: jest.fn(),
  };

  const mockJobRepository = {
    update: jest.fn(),
  };

  const baseBullJob = {
    data: {
      workerId: 'worker-1',
      jobId: 'job-1',
      resultRef: 'job-results/job-1-1710000000000.json',
    },
    attemptsMade: 0,
    opts: { attempts: 3 },
  } as unknown as Parameters<JobResultProcessor['process']>[0];

  const baseJob = {
    id: 'job-1',
    tool: {
      name: 'http-probe',
      type: WorkerType.PROVIDER,
      category: 'http_probe',
    },
    isSaveData: true,
    isPublishEvent: false,
    jobHistory: { id: 'history-1' },
  } as unknown as Job;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockJobRepository.update.mockResolvedValue({ affected: 1 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobResultProcessor,
        {
          provide: JobsRegistryService,
          useValue: mockJobsRegistryService,
        },
        {
          provide: WorkflowRunnerService,
          useValue: mockWorkflowRunnerService,
        },
        {
          provide: DataAdapterService,
          useValue: mockDataAdapterService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: StorageService,
          useValue: mockStorageService,
        },
        {
          provide: getRepositoryToken(Job),
          useValue: mockJobRepository,
        },
      ],
    }).compile();

    processor = module.get<JobResultProcessor>(JobResultProcessor);
    storageService = module.get<StorageService>(StorageService);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('when the job is not found', () => {
    it('should delete the orphaned result file instead of leaking it', async () => {
      mockJobsRegistryService.findJobForUpdate.mockResolvedValue(null);

      await processor.process(baseBullJob);

      expect(storageService.deleteFile).toHaveBeenCalledWith(
        'job-1-1710000000000.json',
        'job-results',
      );
      expect(mockStorageService.readJsonFile).not.toHaveBeenCalled();
      expect(mockJobRepository.update).not.toHaveBeenCalled();
    });

    it('should not throw when the orphaned file is already deleted', async () => {
      mockJobsRegistryService.findJobForUpdate.mockResolvedValue(null);
      mockStorageService.deleteFile.mockRejectedValue(
        new Error('File not found'),
      );

      await expect(processor.process(baseBullJob)).resolves.toBeUndefined();
    });
  });

  describe('when the result reports an error', () => {
    it('should handle the error and delete the result file on the last attempt', async () => {
      mockJobsRegistryService.findJobForUpdate.mockResolvedValue(baseJob);
      mockStorageService.readJsonFile.mockResolvedValue({ error: true });
      const lastAttemptBullJob = {
        ...baseBullJob,
        attemptsMade: 2,
      } as unknown as Parameters<JobResultProcessor['process']>[0];

      await expect(processor.process(lastAttemptBullJob)).rejects.toThrow(
        'Job reported error',
      );

      expect(mockJobsRegistryService.handleJobError).toHaveBeenCalled();
      expect(mockStorageService.deleteFile).toHaveBeenCalledWith(
        'job-1-1710000000000.json',
        'job-results',
      );
      expect(mockJobRepository.update).not.toHaveBeenCalled();
      // The step is terminal, so the engine must decide what happens to the
      // dependents and whether the run is finished.
      expect(mockWorkflowRunnerService.onJobTerminal).toHaveBeenCalledWith(
        baseJob,
      );
    });

    // BullMQ retries the result processing, so advancing the run here would
    // skip the dependents of a job that may still succeed.
    it('should not advance the run while the result may still be retried', async () => {
      mockJobsRegistryService.findJobForUpdate.mockResolvedValue(baseJob);
      mockStorageService.readJsonFile.mockResolvedValue({ error: true });

      await expect(processor.process(baseBullJob)).rejects.toThrow();

      expect(mockWorkflowRunnerService.onJobTerminal).not.toHaveBeenCalled();
    });

    // Regression: the failure detail the worker collects (executor error,
    // adapter error, tail of the container log) is written into `raw`. Throwing
    // a fixed string discarded it, so the console could only ever show "Job
    // reported error" and an operator had to shell into the worker to find out
    // what actually broke.
    it('should surface the worker failure detail instead of a generic message', async () => {
      const detail =
        'fatal: nmap: cannot resolve "nope.invalid"\n--- container logs (last 100 lines) ---\n' +
        '[runtime] [ERROR] adapter error after 0 result(s) in 3s';
      mockJobsRegistryService.findJobForUpdate.mockResolvedValue(baseJob);
      mockStorageService.readJsonFile.mockResolvedValue({
        jobId: 'job-1',
        error: true,
        raw: detail,
        payload: [],
      });
      const lastAttemptBullJob = {
        ...baseBullJob,
        attemptsMade: 2,
      } as unknown as Parameters<JobResultProcessor['process']>[0];

      await expect(processor.process(lastAttemptBullJob)).rejects.toThrow(
        detail,
      );

      const [, , error] = mockJobsRegistryService.handleJobError.mock
        .calls[0] as [unknown, unknown, Error];
      expect(error.message).toBe(detail);
    });

    // The dialog shows the log's payload next to the message. A hardcoded `{}`
    // rendered an empty "Payload" box, so whatever the connector had collected
    // before failing (here: the open ports it had already parsed) was lost.
    it('should persist the partial payload the connector collected before failing', async () => {
      mockJobsRegistryService.findJobForUpdate.mockResolvedValue(baseJob);
      mockStorageService.readJsonFile.mockResolvedValue({
        jobId: 'job-1',
        error: true,
        raw: 'nmap exited with code 1',
        payload: [80, 443],
      });
      const lastAttemptBullJob = {
        ...baseBullJob,
        attemptsMade: 2,
      } as unknown as Parameters<JobResultProcessor['process']>[0];

      await expect(processor.process(lastAttemptBullJob)).rejects.toThrow(
        'nmap exited with code 1',
      );

      const [dto] = mockJobsRegistryService.handleJobError.mock.calls[0] as [
        { data: { payload: unknown } },
      ];
      expect(dto.data.payload).toEqual([80, 443]);
    });

    it('should fall back to the generic message when the failure detail is blank', async () => {
      mockJobsRegistryService.findJobForUpdate.mockResolvedValue(baseJob);
      mockStorageService.readJsonFile.mockResolvedValue({
        jobId: 'job-1',
        error: true,
        raw: '   \n  ',
      });
      const lastAttemptBullJob = {
        ...baseBullJob,
        attemptsMade: 2,
      } as unknown as Parameters<JobResultProcessor['process']>[0];

      await expect(processor.process(lastAttemptBullJob)).rejects.toThrow(
        'Job reported error',
      );
    });
  });

  describe('when a built-in tool finds nothing to scan', () => {
    const naabuJob = () =>
      ({
        ...baseJob,
        tool: {
          name: 'naabu',
          type: WorkerType.BUILT_IN,
          category: ToolCategory.PORTS_SCANNER,
        },
      }) as unknown as Job;

    // naabu exits non-zero when the host does not resolve. That is the target's
    // condition, not the tool's failure: the job must complete with an empty
    // result (previously it failed, and with the DAG engine a failed job skipped
    // every step that needed it — one unroutable host killed the whole chain).
    it('should complete the job instead of failing it', async () => {
      mockJobsRegistryService.findJobForUpdate.mockResolvedValue(naabuJob());
      mockStorageService.readJsonFile.mockResolvedValue({
        jobId: 'job-1',
        error: true,
        raw: '[FTL] Could not run enumeration = no valid ipv4 or ipv6 targets were found',
        payload: [],
      });

      await processor.process(baseBullJob);

      expect(mockDataAdapterService.syncData).not.toHaveBeenCalled();
      expect(mockJobsRegistryService.handleJobError).not.toHaveBeenCalled();
      expect(mockJobRepository.update).toHaveBeenCalledWith(
        { id: 'job-1', status: JobStatus.IN_PROGRESS },
        expect.objectContaining({ status: JobStatus.COMPLETED }),
      );
      expect(mockWorkflowRunnerService.onJobTerminal).toHaveBeenCalled();
    });

    it('should still fail the job on a real tool error', async () => {
      mockJobsRegistryService.findJobForUpdate.mockResolvedValue(naabuJob());
      mockStorageService.readJsonFile.mockResolvedValue({
        jobId: 'job-1',
        error: true,
        raw: 'naabu: permission denied',
      });
      const lastAttemptBullJob = {
        ...baseBullJob,
        attemptsMade: 2,
      } as unknown as Parameters<JobResultProcessor['process']>[0];

      await expect(processor.process(lastAttemptBullJob)).rejects.toThrow(
        'permission denied',
      );

      expect(mockJobsRegistryService.handleJobError).toHaveBeenCalled();
      expect(mockJobRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('when processing succeeds for an external tool', () => {
    it('should complete the job and delete the result file', async () => {
      mockJobsRegistryService.findJobForUpdate.mockResolvedValue(baseJob);
      mockStorageService.readJsonFile.mockResolvedValue({
        jobId: 'job-1',
        error: false,
        raw: null,
        payload: { domains: ['example.com'] },
      });

      await processor.process(baseBullJob);

      expect(mockDataAdapterService.syncData).toHaveBeenCalledWith({
        data: { domains: ['example.com'] },
        job: baseJob,
      });
      // Conditional on IN_PROGRESS so a concurrent cancel is not overwritten
      expect(mockJobRepository.update).toHaveBeenCalledWith(
        { id: 'job-1', status: JobStatus.IN_PROGRESS },
        expect.objectContaining({ status: JobStatus.COMPLETED }),
      );
      // The workflow engine decides what runs next (or that the run is done).
      expect(mockWorkflowRunnerService.onJobTerminal).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'job-1', status: JobStatus.COMPLETED }),
      );
      expect(storageService.deleteFile).toHaveBeenCalledWith(
        'job-1-1710000000000.json',
        'job-results',
      );
    });

    // Regression: naabu (and the other built-ins) exit 0 with an empty stdout
    // when they find nothing — a host with no open port, a name that does not
    // resolve, or a target dropping the probes. Failing the job there turns a
    // normal "nothing here" into a failed step whose dependents are then
    // skipped, so the whole recon chain died on wildcard-heavy domains.
    it('should complete a built-in job that produced no output instead of failing it', async () => {
      const naabuJob = {
        ...baseJob,
        tool: {
          name: 'naabu',
          type: WorkerType.BUILT_IN,
          category: ToolCategory.PORTS_SCANNER,
        },
      } as unknown as Job;
      mockJobsRegistryService.findJobForUpdate.mockResolvedValue(naabuJob);
      mockStorageService.readJsonFile.mockResolvedValue({
        jobId: 'job-1',
        error: false,
        raw: '',
        payload: undefined,
      });

      await processor.process(baseBullJob);

      expect(mockDataAdapterService.syncData).not.toHaveBeenCalled();
      expect(mockJobRepository.update).toHaveBeenCalledWith(
        { id: 'job-1', status: JobStatus.IN_PROGRESS },
        expect.objectContaining({ status: JobStatus.COMPLETED }),
      );
      expect(mockWorkflowRunnerService.onJobTerminal).toHaveBeenCalledWith(
        expect.objectContaining({ status: JobStatus.COMPLETED }),
      );
    });

    it('should discard the result and spawn nothing when the job was cancelled mid-flight', async () => {
      mockJobsRegistryService.findJobForUpdate.mockResolvedValue(baseJob);
      mockStorageService.readJsonFile.mockResolvedValue({
        jobId: 'job-1',
        error: false,
        raw: null,
        payload: { domains: ['example.com'] },
      });
      // The bulk cancel flipped the job out of IN_PROGRESS first.
      mockJobRepository.update.mockResolvedValue({ affected: 0 });

      await processor.process(baseBullJob);

      expect(mockWorkflowRunnerService.onJobTerminal).not.toHaveBeenCalled();
      expect(storageService.deleteFile).toHaveBeenCalledWith(
        'job-1-1710000000000.json',
        'job-results',
      );
    });
  });
});
