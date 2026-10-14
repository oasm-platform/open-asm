import { RedisLockService } from '@/services/redis/distributed-lock.service';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { WorkflowRunnerService } from './workflow-runner.service';

/** How far back a stalled run is still worth rescuing. */
const RECONCILE_LOOKBACK_DAYS = 7;
/** Cap per sweep so a backlog is drained over several runs. */
const RECONCILE_BATCH = 50;

/**
 * Self-heals workflow runs that stopped advancing.
 *
 * The engine advances a run when one of its jobs reaches a terminal state, so a
 * lost advance — the transaction failed, the process restarted mid-advance, the
 * result was processed by a previous build — leaves the run with every job done,
 * its next step never dispatched, and nothing left to wake it up. That is
 * invisible until someone notices the run never finished.
 *
 * This sweep finds exactly that state (unfinished, has jobs, none pending or
 * in progress) and asks the runner to advance it again. `advanceRun` is
 * idempotent and no-ops on a finished run, so a healthy run is unaffected.
 *
 * Runs on every replica but is guarded by a Redis lock, so only one performs the
 * sweep. Bounded by lookback + batch so it never scans unbounded history.
 */
@Injectable()
export class WorkflowRunReconcilerService {
  private readonly logger = new Logger(WorkflowRunReconcilerService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly workflowRunnerService: WorkflowRunnerService,
    private readonly redisLockService: RedisLockService,
  ) {}

  @Cron('*/2 * * * *')
  async reconcileStalledRuns(): Promise<void> {
    await this.redisLockService.withLock(
      'cron:workflow-run-reconcile',
      2 * 60 * 1000,
      async () => {
        const stalled: { id: string }[] = await this.dataSource.query(
          `SELECT h.id
             FROM job_histories h
            WHERE h."isCompleted" = false
              AND h."workflowId" IS NOT NULL
              AND h."createdAt" > now() - make_interval(days => $1)
              AND EXISTS (SELECT 1 FROM jobs j WHERE j."jobHistoryId" = h.id)
              AND NOT EXISTS (
                SELECT 1 FROM jobs j
                 WHERE j."jobHistoryId" = h.id
                   AND j.status IN ('pending', 'in_progress')
              )
            ORDER BY h."createdAt" DESC
            LIMIT $2`,
          [RECONCILE_LOOKBACK_DAYS, RECONCILE_BATCH],
        );

        if (stalled.length === 0) return;

        this.logger.log(
          `Reconciling ${stalled.length} workflow run(s) whose jobs all finished but whose run is not complete`,
        );

        for (const { id } of stalled) {
          try {
            await this.workflowRunnerService.advanceRun(id);
          } catch (error) {
            // One bad run must not stop the sweep.
            this.logger.warn(
              `Failed to reconcile run ${id}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }
      },
    );
  }
}
