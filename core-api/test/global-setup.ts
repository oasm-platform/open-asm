/**
 * Jest `globalSetup` — makes `task api:test:e2e` work on an empty machine.
 *
 * Creates the throwaway database when missing and brings its schema up to date.
 * It cannot rely on `AppModule` doing this: `dataSourceOptions.migrationsRun`
 * is `NODE_ENV === 'development'`, and the e2e environment pins
 * `NODE_ENV=test` precisely so nothing auto-migrates by accident. So the
 * migrations are run explicitly here, against a throwaway DataSource that is
 * destroyed immediately afterwards.
 *
 * The migrations themselves are never hand-written (AGENTS.md hard rule) — this
 * only executes whatever is already in `src/database/migrations/`.
 */
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { databaseConnectionConfig, dataSourceOptions } from '../src/database/database-config';
import { pinTestEnv } from './pin-test-env';

async function globalSetup(): Promise<void> {
  const database = pinTestEnv();

  await ensureDatabaseExists(database);

  const dataSource = new DataSource({
    ...dataSourceOptions,
    database,
    // The taskfile owns migration execution; this harness only replays the
    // already-committed migrations against a disposable schema.
    migrationsRun: true,
    // The shared options carry an ioredis query cache. Skip it here: the setup
    // hook must not depend on Redis being reachable before tests even start.
    cache: false,
    logger: false,
  });

  await dataSource.initialize();
  try {
    await dataSource.destroy();
  } catch {
    // `initialize()` already ran the migrations; a teardown failure here would
    // mask a successful setup.
  }
}

/** Creates `database` if it is absent, connecting via the `postgres` catalog. */
async function ensureDatabaseExists(database: string): Promise<void> {
  const admin = new Client({ ...databaseConnectionConfig, database: 'postgres' });

  await admin.connect();
  try {
    const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      database,
    ]);
    if (existing.rowCount === 0) {
      // Identifier, not a value — hence quoted rather than parameterized.
      await admin.query(`CREATE DATABASE "${database}"`);
    }
  } finally {
    await admin.end();
  }
}

// Jest checks `typeof module.exports === 'function'` and SWC's `noInterop`
// leaves `export default` as `exports.default`, so the setup function must be
// exposed as the module itself here.
export = globalSetup;