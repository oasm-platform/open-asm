import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Widens the run-scoped job index from `(jobHistoryId)` to
 * `(jobHistoryId, status)`.
 *
 * `IDX_jobs_jobHistoryId` is a strict prefix of the new index, so this replaces
 * it rather than adding another index to the hot `jobs` table.
 *
 * Three queries are scoped to one run and filter on status on top of it:
 *
 * - `getJobHistoryDetail`'s per-tool status rollup
 *   (`WHERE jobHistoryId = ? GROUP BY toolId`). Confirmed with EXPLAIN: it now
 *   runs as an index scan on `(jobHistoryId, status)` instead of hitting the
 *   heap for every row of the run.
 * - `cancelJobHistory`'s "which jobs are executing right now" scan.
 * - `markWorkflowDone`'s "does this run still have pending or in-progress
 *   jobs?" EXISTS, which runs on EVERY job completion. This gives the planner a
 *   run-scoped path it previously lacked, though at the current dev data volume
 *   it still prefers `IDX_jobs_dispatch` there because the status predicate
 *   looks more selective. The choice is cost-based; the point is to make the
 *   other plan available rather than to force it.
 *
 * NOTE for production: both statements run inside the migration transaction, so
 * the CREATE holds a SHARE lock on `jobs` while it builds. On a large table,
 * apply the equivalent `DROP INDEX CONCURRENTLY` + `CREATE INDEX CONCURRENTLY`
 * by hand, outside a transaction, during a maintenance window.
 */
export class AddJobHistoryStatusIndex1790822179567
  implements MigrationInterface
{
  name = 'AddJobHistoryStatusIndex1790822179567';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_jobs_jobHistoryId"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_jobs_jobHistoryId_status" ON "jobs" ("jobHistoryId", "status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_jobs_jobHistoryId_status"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_jobs_jobHistoryId" ON "jobs" ("jobHistoryId")`,
    );
  }
}
