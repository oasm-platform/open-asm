import { JobStatus, WorkerType } from '@/common/enums/enum';
import { DataAdapterService } from '@/modules/data-adapter/data-adapter.service';
import { StorageService } from '@/modules/storage/storage.service';
import { RedisService } from '@/services/redis/redis.service';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Job } from '../entities/job.entity';
import { JobsRegistryService } from '../jobs-registry.service';
import { JobResultProcessor } from './job-result.processor';

describe('JobResultProcessor', () => {
  let processor: JobResultProcessor;
  let storageService: StorageService;

  const mockJobsRegistryService = {
    findJobForUpdate: jest.fn(),
    getNextStepForJob: jest.fn(),
    markWorkflowDone: jest.fn(),
    handleJobError: jest.fn(),
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
    save: jest.fn(),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobResultProcessor,
        {
          provide: JobsRegistryService,
          useValue: mockJobsRegistryService,
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
      expect(mockJobRepository.save).not.toHaveBeenCalled();
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
      expect(mockJobRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('when processing succeeds for an external tool', () => {
    it('should save the job as completed and delete the result file', async () => {
      mockJobsRegistryService.findJobForUpdate.mockResolvedValue(baseJob);
      mockStorageService.readJsonFile.mockResolvedValue({
        jobId: 'job-1',
        error: false,
        raw: null,
        payload: { domains: ['example.com'] },
      });
      mockJobsRegistryService.getNextStepForJob.mockResolvedValue(1);
      mockJobRepository.save.mockImplementation((job: Job) => job);

      await processor.process(baseBullJob);

      expect(mockDataAdapterService.syncData).toHaveBeenCalledWith({
        data: { domains: ['example.com'] },
        job: baseJob,
      });
      expect(mockJobRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: JobStatus.COMPLETED }),
      );
      expect(mockJobsRegistryService.markWorkflowDone).not.toHaveBeenCalled();
      expect(storageService.deleteFile).toHaveBeenCalledWith(
        'job-1-1710000000000.json',
        'job-results',
      );
    });
  });
});
