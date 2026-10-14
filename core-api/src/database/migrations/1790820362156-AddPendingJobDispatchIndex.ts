import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rebuilds the dispatch index so it can satisfy the claim query's ORDER BY.
 *
 * The claim orders by `priority DESC, "createdAt" ASC`. The previous index was
 * `(status, priority, "createdAt")` all-ASC, so a backward scan could only give
 * `priority DESC, "createdAt" DESC` — the ascending `createdAt` tie-break (FIFO
 * within a priority band) still forced Postgres to Sort the whole matching set
 * before LIMIT could apply. Confirmed with EXPLAIN on the dev database, which
 * showed a `Sort` node sitting above the index scan.
 *
 * The replacement keeps the same three columns, so this replaces the index on
 * the hot `jobs` table rather than adding another one, and pins the per-column
 * direction. Verified with EXPLAIN that it removes the Sort under BOTH a custom
 * plan and a forced generic plan (`status = $1`). A partial index restricted to
 * pending rows was tried first and rejected: it is smaller, but the planner
 * cannot use it once the status predicate arrives as a parameter in a generic
 * plan, which would silently bring the Sort back.
 *
 * The direction is written literally because TypeORM's `@Index` decorator
 * cannot express per-column direction (this version supports only `where` and
 * `concurrent`). The entity declares the same column list without a direction,
 * and TypeORM does not read sort order back from Postgres, so the two stay in
 * sync across future `migration:generate` runs.
 *
 * NOTE for production: both statements run inside the migration transaction, so
 * the CREATE holds a SHARE lock on `jobs` while it builds and the DROP takes a
 * brief ACCESS EXCLUSIVE. On a large table, apply the equivalent
 * `DROP INDEX CONCURRENTLY` + `CREATE INDEX CONCURRENTLY` by hand, outside a
 * transaction, during a maintenance window.
 */
export class AddPendingJobDispatchIndex1790820362156
  implements MigrationInterface
{
  name = 'AddPendingJobDispatchIndex1790820362156';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_jobs_status_priority_createdAt"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_jobs_dispatch" ON "jobs" ("status", "priority" DESC, "createdAt" ASC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_jobs_dispatch"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_jobs_status_priority_createdAt" ON "jobs" ("status", "priority", "createdAt")`,
    );
  }
}
