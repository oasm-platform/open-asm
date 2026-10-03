import type { DataSource } from 'typeorm';

/** Runs a parameterized statement and returns its rows. */
export async function rawQuery<T = unknown>(
  dataSource: DataSource,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return dataSource.query(sql, params);
}

/**
 * Tables discovered from the live entity metadata, minus the ones a
 * truncate must never touch.
 *
 * `workspaces`, `users` and `sessions`/`accounts` are intentionally excluded by
 * default: e2e suites clean those up by id in `afterAll`, and truncating them
 * in a beforeAll would wipe rows another still-running suite depends on if the
 * suite ever runs in parallel. In `--runInBand` (the configured default) this
 * distinction is cheap insurance against a future parallelisation.
 */
const DEFAULT_TRUNCATE_EXCLUDE = new Set([
  'workspaces',
  'users',
  'sessions',
  'accounts',
  'migrations',
  'typeorm_metadata',
]);

/**
 * All entity table names in the current data source, base exclusions applied.
 * Derived from `entityMetadatas`, so a new `@Entity()` is picked up without
 * editing this list — unlike a hand-maintained list, which drifts.
 */
export function tableList(
  dataSource: DataSource,
  extraExclude: Iterable<string> = [],
): string[] {
  const excluded = new Set([...DEFAULT_TRUNCATE_EXCLUDE, ...extraExclude]);
  return dataSource.entityMetadatas
    .map((m) => m.tableName)
    .filter((name) => !excluded.has(name));
}

/**
 * `TRUNCATE ... RESTART IDENTITY CASCADE` over the entity tables.
 *
 * The escape hatch for suites that assert on global counts or a clean slate
 * (jobs-registry, statistic). Safe only because e2e runs `--runInBand`.
 */
export async function truncateAll(
  dataSource: DataSource,
  extraExclude: Iterable<string> = [],
): Promise<void> {
  const tables = tableList(dataSource, extraExclude);
  if (tables.length === 0) return;

  const quoted = tables.map((t) => `"${t}"`).join(', ');
  await dataSource.query(
    `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`,
  );
}