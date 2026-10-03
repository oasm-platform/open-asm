/**
 * Jest `globalTeardown` — drops the throwaway database when the run asked for
 * it (`E2E_DROP_DB=1`, which CI sets).
 *
 * Locally the database is kept on purpose: the 62 migrations are idempotent,
 * so re-running `task api:test:e2e` reuses the existing schema instead of
 * replaying all of them, which is both faster and a useful sanity check that
 * the migrations are re-runnable.
 */
import { Client } from 'pg';
import { databaseConnectionConfig } from '../src/database/database-config';
import { pinTestEnv, shouldDropDatabase } from './pin-test-env';

async function globalTeardown(): Promise<void> {
  if (!shouldDropDatabase()) return;

  const database = pinTestEnv();
  const admin = new Client({ ...databaseConnectionConfig, database: 'postgres' });

  await admin.connect();
  try {
    // `WITH (FORCE)` terminates leftover backends. Without it the DROP fails
    // whenever a pooled connection from a spec outlives its `app.close()`.
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  } finally {
    await admin.end();
  }
}

// Jest checks `typeof module.exports === 'function'` and SWC's `noInterop`
// leaves `export default` as `exports.default`, so the teardown function must
// be exposed as the module itself here.
export = globalTeardown;