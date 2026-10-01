import {
  JOB_RETENTION_DAYS,
  JOB_RETENTION_DELETE_BATCH,
} from '@/common/constants/app.constants';
import { JobStatus } from '@/common/enums/enum';
import { RedisLockService } from '@/services/redis/distributed-lock.service';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

/**
 * Statuses a job can be in once it will never run again. Only these are
 * eligible for pruning — a pending or in-progress job is live work regardless
 * of how old its row is.
 */
const PRUNABLE_JOB_STATUSES: string[] = [
  JobStatus.COMPLETED,
  JobStatus.FAILED,
  JobStatus.CANCELLED,
  JobStatus.SKIPPED,
];

/**
 * Prunes terminal job rows older than {@link JOB_RETENTION_DAYS}.
 *
 * WHAT IT DELETES
 * Rows in `jobs` only, and only terminal ones. The delete cascades to
 * `job_error_log` (ON DELETE CASCADE on `jobId`), which belongs to the job.
 *
 * WHAT IT DELIBERATELY DOES NOT DELETE
 * `job_histories` rows are kept. `http_responses`, `discovered_urls` and
 * `ports` reference a history with ON DELETE CASCADE, so deleting an old
 * history would destroy the workspace's actual scan results — the exact
 * opposite of housekeeping. `assets`, `targets` and `vulnerabilities` are never
 * touched. The consequence of keeping the history is that a pruned run keeps a
 * thin row here; that is the deliberate price of not being able to cascade into
 * findings.
 *
 * VISIBLE EFFECT
 * A run whose jobs have all been pruned drops out of the `/jobs` list, because
 * `getManyJobHistories` INNER JOINs `jobs`. The dashboard timeline is unaffected
 * (it is already bounded to 30 days) and the statistics module reads assets,
 * targets, vulnerabilities and http responses — never `jobs` — so counts do not
 * move.
 *
 * Runs daily, guarded by a Redis lock so only one backend replica prunes.
 */
@Injectable()
export class JobRetentionService {
  private readonly logger = new Logger(JobRetentionService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly redisLockService: RedisLockService,
  ) {}

  @Cron('30 3 * * *')
  async pruneExpiredJobs(): Promise<void> {
    await this.redisLockService.withLock(
      'cron:jobs-retention',
      30 * 60 * 1000,
      async () => {
        let deleted = 0;

        // Delete in batches so a first run on a large table never holds a long
        // lock. Loop until a batch comes back short, which means we are done.
        for (;;) {
          const rows: { id: string }[] = await this.dataSource.query(
            `WITH doomed AS (
               SELECT id FROM jobs
               WHERE "createdAt" < now() - make_interval(days => $1)
                 AND status::text = ANY($2::text[])
               LIMIT $3
             )
             DELETE FROM jobs j USING doomed
             WHERE j.id = doomed.id
             RETURNING j.id`,
            [JOB_RETENTION_DAYS, PRUNABLE_JOB_STATUSES, JOB_RETENTION_DELETE_BATCH],
          );

          deleted += rows.length;
          if (rows.length < JOB_RETENTION_DELETE_BATCH) {
            break;
          }
        }

        if (deleted > 0) {
          this.logger.log(
            `Job retention: pruned ${deleted} job(s) older than ${JOB_RETENTION_DAYS} day(s)`,
          );
        }
      },
    );
  }
}
