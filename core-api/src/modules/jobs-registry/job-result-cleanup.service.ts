import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { StorageService } from '@/modules/storage/storage.service';
import { RedisLockService } from '@/services/redis/distributed-lock.service';

/** Bucket where worker job results are temporarily staged. */
export const JOB_RESULTS_BUCKET = 'job-results';

/** Result files older than this are considered orphaned garbage. */
export const MAX_RESULT_FILE_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Cron service that removes expired/orphaned files from the `job-results`
 * bucket. Results are normally deleted by `JobResultProcessor` right after
 * processing, but files can be left behind when the queue entry is lost
 * (Redis restart/flush), the job row is gone (`findJobForUpdate` → null),
 * or the process dies between enqueue and delete.
 *
 * Runs daily at 03:00, guarded by a Redis distributed lock (30 min TTL) so
 * only one backend instance performs the cleanup across replicas.
 */
@Injectable()
export class JobResultCleanupService {
  private readonly logger = new Logger(JobResultCleanupService.name);

  constructor(
    private readonly storageService: StorageService,
    private readonly redisLockService: RedisLockService,
  ) {}

  @Cron('0 3 * * *')
  async cleanupExpiredResultFiles(): Promise<void> {
    await this.redisLockService.withLock(
      'cron:job-results-cleanup',
      30 * 60 * 1000,
      async () => {
        const cutoff = new Date(Date.now() - MAX_RESULT_FILE_AGE_MS);
        const files = await this.storageService.listFiles(JOB_RESULTS_BUCKET);

        let deleted = 0;
        let failed = 0;
        for (const file of files) {
          // Keep files without a known age — never delete what we can't date.
          if (!file.lastModified || file.lastModified >= cutoff) {
            continue;
          }
          try {
            await this.storageService.deleteFile(
              file.key,
              JOB_RESULTS_BUCKET,
            );
            deleted += 1;
          } catch (error) {
            failed += 1;
            this.logger.error(
              `Failed to delete expired result file ${file.key}:`,
              error,
            );
          }
        }

        if (deleted > 0 || failed > 0) {
          this.logger.log(
            `Job-results cleanup: ${deleted} expired file(s) deleted, ` +
              `${failed} failed out of ${files.length} scanned`,
          );
        }
      },
    );
  }
}
