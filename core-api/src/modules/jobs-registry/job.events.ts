import type { Job } from './entities/job.entity';

/**
 * In-process hook `JobResultProcessor` emits with `emitAsync`, and awaits,
 * once a job's result is synced and the job marked completed, before the
 * workflow engine moves the run on. A benign "nothing to scan" outcome, a
 * failed or discarded result and a job that saves no data are not announced:
 * they prove nothing about what the scan covers.
 *
 * Listeners must not throw (register without `suppressErrors: false`): the
 * processor only logs a failure, and the job stays completed. The vulnerabilities
 * module auto-closes findings on it.
 */
export const JOB_RESULT_SYNCED_EVENT = 'job.result.synced';

export interface JobResultSyncedEvent {
  job: Job;
  /** Taken before the sync: rows the job wrote are at or after it. */
  syncStartedAt: Date;
}
