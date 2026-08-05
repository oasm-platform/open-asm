import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { StorageService } from '@/modules/storage/storage.service';
import { RedisLockService } from '@/services/redis/distributed-lock.service';
import {
  JobResultCleanupService,
  MAX_RESULT_FILE_AGE_MS,
} from './job-result-cleanup.service';

describe('JobResultCleanupService', () => {
  let service: JobResultCleanupService;

  const mockRedisLockService = {
    withLock: jest
      .fn()
      .mockImplementation(
        async <T>(_key: string, _ttl: number, action: () => Promise<T>) => {
          return action();
        },
      ),
    acquireLock: jest.fn(),
    releaseLock: jest.fn(),
    lockWithTimeOut: jest.fn(),
    isWithoutLock: jest.fn(),
  };

  const mockStorageService = {
    listFiles: jest.fn(),
    deleteFile: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobResultCleanupService,
        {
          provide: StorageService,
          useValue: mockStorageService,
        },
        {
          provide: RedisLockService,
          useValue: mockRedisLockService,
        },
      ],
    }).compile();

    service = module.get<JobResultCleanupService>(JobResultCleanupService);
  });

  describe('cleanupExpiredResultFiles', () => {
    it('should run the cleanup inside a redis lock', async () => {
      mockStorageService.listFiles.mockResolvedValue([]);

      await service.cleanupExpiredResultFiles();

      expect(mockRedisLockService.withLock).toHaveBeenCalledWith(
        'cron:job-results-cleanup',
        expect.any(Number),
        expect.any(Function),
      );
    });

    it('should delete only files older than 30 days', async () => {
      const olderThan30Days = new Date(
        Date.now() - MAX_RESULT_FILE_AGE_MS - 24 * 60 * 60 * 1000,
      );
      const newerThan30Days = new Date(
        Date.now() - MAX_RESULT_FILE_AGE_MS + 24 * 60 * 60 * 1000,
      );
      mockStorageService.listFiles.mockResolvedValue([
        { key: 'old.json', lastModified: olderThan30Days },
        { key: 'new.json', lastModified: newerThan30Days },
      ]);

      await service.cleanupExpiredResultFiles();

      expect(mockStorageService.deleteFile).toHaveBeenCalledTimes(1);
      expect(mockStorageService.deleteFile).toHaveBeenCalledWith(
        'old.json',
        'job-results',
      );
    });

    it('should keep files without a lastModified timestamp', async () => {
      mockStorageService.listFiles.mockResolvedValue([
        { key: 'no-date.json', lastModified: undefined },
      ]);

      await service.cleanupExpiredResultFiles();

      expect(mockStorageService.deleteFile).not.toHaveBeenCalled();
    });

    it('should not delete anything when the bucket is empty', async () => {
      mockStorageService.listFiles.mockResolvedValue([]);

      await service.cleanupExpiredResultFiles();

      expect(mockStorageService.deleteFile).not.toHaveBeenCalled();
    });

    it('should continue deleting remaining files when one delete fails', async () => {
      const oldDate = new Date(
        Date.now() - MAX_RESULT_FILE_AGE_MS - 24 * 60 * 60 * 1000,
      );
      mockStorageService.listFiles.mockResolvedValue([
        { key: 'a.json', lastModified: oldDate },
        { key: 'b.json', lastModified: oldDate },
      ]);
      mockStorageService.deleteFile.mockRejectedValueOnce(
        new Error('delete failed'),
      );

      await expect(service.cleanupExpiredResultFiles()).resolves.toBeUndefined();

      expect(mockStorageService.deleteFile).toHaveBeenCalledTimes(2);
    });

    it('should do nothing when the redis lock is not acquired', async () => {
      mockRedisLockService.withLock.mockResolvedValueOnce(null);

      await service.cleanupExpiredResultFiles();

      expect(mockStorageService.listFiles).not.toHaveBeenCalled();
    });
  });
});
