import type { DataSource } from 'typeorm';

/** Where a listed row came from: the run that first found it, on which target. */
export interface RowProvenance {
  jobHistoryId?: string | null;
  targetId?: string | null;
}

/** Key of one (run, target) pair in the set {@link findFreshRuns} returns. */
export function runKey(jobHistoryId: string, targetId: string): string {
  return `${jobHistoryId}:${targetId}`;
}

/** Whether a row was found by one of the fresh runs. */
export function isFresh(fresh: Set<string>, row: RowProvenance): boolean {
  return (
    !!row.jobHistoryId &&
    !!row.targetId &&
    fresh.has(runKey(row.jobHistoryId, row.targetId))
  );
}

/**
 * SQL predicate: the run in `runColumn` is fresh for the target in
 * `targetColumn` (see {@link findFreshRuns}). The single definition of "new",
 * shared by the per-page badges and the `isNew` list filter.
 */
export function freshRunSql(runColumn: string, targetColumn: string): string {
  return `EXISTS (
    SELECT 1 FROM job_histories run
     WHERE run.id = ${runColumn}
       AND run."isCompleted" = true
       AND NOT EXISTS (
         SELECT 1 FROM job_histories later
          WHERE later."workflowId" = run."workflowId"
            AND later."isCompleted" = true
            AND later."createdAt" > run."createdAt"
            AND later.scope -> 'targetIds' @> jsonb_build_array((${targetColumn})::text)
       )
  )`;
}

/** Name of the CTE {@link latestCoveringRunsCte} defines. */
export const LATEST_RUNS_CTE = 'asq_latest';

/**
 * CTE body: for each (workflow, target) of one workspace, the newest completed
 * run that recorded the target in its scope. With it, {@link freshRunInCteSql}
 * gives the same answer as {@link freshRunSql} while reading `job_histories`
 * once per query instead of once per row.
 *
 * @param workspaceParam - Bound parameter holding the workspace id.
 */
export function latestCoveringRunsCte(workspaceParam: string): string {
  return `SELECT later."workflowId", t.id AS "targetId", max(later."createdAt") AS "latestAt"
      FROM job_histories later
      JOIN targets t
        ON t."workspaceId" = ${workspaceParam}
       AND later.scope -> 'targetIds' @> jsonb_build_array(t.id::text)
     WHERE later."isCompleted" = true
     GROUP BY later."workflowId", t.id`;
}

/**
 * Boolean SQL, never NULL: the run in `runColumn` is fresh for the target in
 * `targetColumn`, read from the {@link LATEST_RUNS_CTE} CTE. Same rule as
 * {@link freshRunSql}: completed, and no later completed run of the same
 * workflow on that target.
 */
export function freshRunInCteSql(runColumn: string, targetColumn: string): string {
  return `COALESCE((
    SELECT run."isCompleted" AND NOT EXISTS (
             SELECT 1 FROM ${LATEST_RUNS_CTE} latest
              WHERE latest."workflowId" = run."workflowId"
                AND latest."targetId" = ${targetColumn}
                AND latest."latestAt" > run."createdAt")
      FROM job_histories run
     WHERE run.id = ${runColumn}
  ), false)`;
}

/**
 * The (run, target) pairs whose rows still count as new: the run has finished,
 * and no later run of the same workflow has finished on that target since.
 *
 * So a row is badged once the scan that found it is done, not while it runs,
 * and stops being new when the next scan of the same kind finishes, whether or
 * not that scan found anything. A run of another workflow (a vulnerability scan
 * after a discovery) leaves it alone.
 *
 * "Later run on that target" is read from the run's scope, which only target-
 * triggered and manual runs record by target; a project run therefore
 * never clears another run's rows.
 */
export async function findFreshRuns(
  dataSource: DataSource,
  rows: RowProvenance[],
): Promise<Set<string>> {
  const pairs = new Map<string, [string, string]>();
  for (const { jobHistoryId, targetId } of rows) {
    if (jobHistoryId && targetId) {
      pairs.set(runKey(jobHistoryId, targetId), [jobHistoryId, targetId]);
    }
  }
  if (pairs.size === 0) return new Set();

  const values = [...pairs.values()];
  const fresh = await dataSource.query<
    Array<{ jobHistoryId: string; targetId: string }>
  >(
    `SELECT p."jobHistoryId", p."targetId"
       FROM unnest($1::uuid[], $2::text[]) AS p("jobHistoryId", "targetId")
      WHERE ${freshRunSql('p."jobHistoryId"', 'p."targetId"')}`,
    [values.map(([run]) => run), values.map(([, target]) => target)],
  );
  return new Set(fresh.map((row) => runKey(row.jobHistoryId, row.targetId)));
}
