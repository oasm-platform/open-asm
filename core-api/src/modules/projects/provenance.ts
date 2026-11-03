/**
 * Vulnerability provenance inside a project, computed at read time:
 *
 * - `new`: the project has reported it in one run only;
 * - `recurring`: reported again by later runs;
 * - `not_seen`: a later run scanned the same asset with the same tool and did
 *   not report it — possibly fixed.
 *
 * "Later run" is the reference run: the latest run of the project in which a
 * job of the vulnerability's tool completed on its asset. Comparing against
 * the project's latest run instead would mark everything outside a partial
 * run (an "assets added" run of six hosts) as not seen.
 */
export enum VulnerabilityProvenance {
  NEW = 'new',
  RECURRING = 'recurring',
  NOT_SEEN = 'not_seen',
}

export const PROVENANCE_VALUES = Object.values(VulnerabilityProvenance);

/**
 * Lateral join yielding `ref.id` / `ref."createdAt"`, the reference run of the
 * row `pv` (project_vulnerabilities) joined to `v` (vulnerabilities).
 */
export const REFERENCE_RUN_JOIN = `LEFT JOIN LATERAL (
  SELECT jh.id, jh."createdAt"
    FROM jobs j
    JOIN job_histories jh ON jh.id = j."jobHistoryId"
   WHERE jh."projectId" = pv."projectId"
     AND j."assetId" = v."assetId"
     AND j."toolId" = v."toolId"
     AND j.status = 'completed'
   ORDER BY jh."createdAt" DESC
   LIMIT 1
) ref ON true
LEFT JOIN job_histories ls ON ls.id = pv."lastSeenJobHistoryId"`;

/**
 * Provenance of the row, given {@link REFERENCE_RUN_JOIN}. `ls` is the run
 * that last reported it; when that run was deleted, the sighting time stands
 * in (cast to `timestamp`, the type of `job_histories.createdAt`).
 */
export const PROVENANCE_SQL = `CASE
  WHEN ref.id IS NOT NULL
   AND ref.id IS DISTINCT FROM pv."lastSeenJobHistoryId"
   AND ref."createdAt" > COALESCE(ls."createdAt", CAST(pv."lastSeenAt" AS timestamp))
    THEN '${VulnerabilityProvenance.NOT_SEEN}'
  WHEN pv."timesSeen" <= 1 THEN '${VulnerabilityProvenance.NEW}'
  ELSE '${VulnerabilityProvenance.RECURRING}'
END`;

/** Same decision as {@link PROVENANCE_SQL}, for rows already loaded. */
export function classifyProvenance(row: {
  timesSeen: number;
  lastSeenRunId: string | null;
  lastSeenAt: Date;
  referenceRunId?: string | null;
  referenceRunAt?: Date | null;
}): VulnerabilityProvenance {
  if (
    row.referenceRunId &&
    row.referenceRunId !== row.lastSeenRunId &&
    row.referenceRunAt &&
    row.referenceRunAt.getTime() > row.lastSeenAt.getTime()
  ) {
    return VulnerabilityProvenance.NOT_SEEN;
  }
  return row.timesSeen <= 1
    ? VulnerabilityProvenance.NEW
    : VulnerabilityProvenance.RECURRING;
}

/**
 * Status of a project run, derived from its jobs (alias `jh`). Same rollup as
 * the jobs registry's run list, so both pages agree.
 */
export const RUN_STATUS_SQL = `(
  SELECT CASE
    WHEN COUNT(*) FILTER (WHERE status = 'cancelled') > 0
         AND COUNT(*) FILTER (WHERE status IN ('pending', 'in_progress')) = 0 THEN 'cancelled'
    WHEN COUNT(*) FILTER (WHERE status = 'failed') > 0 THEN 'failed'
    WHEN COUNT(*) FILTER (WHERE status = 'in_progress') > 0 THEN 'in_progress'
    WHEN COUNT(*) FILTER (WHERE status = 'completed') = COUNT(*) AND COUNT(*) > 0 THEN 'completed'
    WHEN COUNT(*) FILTER (WHERE status = 'skipped') = COUNT(*) AND COUNT(*) > 0 THEN 'skipped'
    ELSE 'pending'
  END
  FROM jobs WHERE "jobHistoryId" = jh.id
)`;

/** critical → 5 … info → 1, for ordering (alias `v`). */
export const SEVERITY_RANK_SQL = `CASE v.severity WHEN 'critical' THEN 5 WHEN 'high' THEN 4 WHEN 'medium' THEN 3 WHEN 'low' THEN 2 ELSE 1 END`;
