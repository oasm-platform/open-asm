/**
 * Single source of truth for the e2e environment pinning.
 *
 * Jest runs `globalSetup` BEFORE `setupFiles`, so both the setup/teardown
 * scripts and the per-worker `setup-env.ts` need this. Importing it is
 * side-effect free; call `pinTestEnv()`.
 */

/** A database name must end with this to be considered a throwaway schema. */
const TEST_DB_PATTERN = /_test$/;

export class TestEnvError extends Error {}

/**
 * Pins the e2e environment onto a throwaway database and returns its name.
 *
 * Throws when the resolved name does not look like a test database — this is
 * the single guard standing between a misconfigured run and a developer's real
 * data, so it must not be made configurable away.
 *
 * @throws {TestEnvError} when `POSTGRES_DB` does not end in `_test`.
 */
export function pinTestEnv(): string {
  /**
   * Dedicated test schema by default. `POSTGRES_DB` from `.env` is the
   * developer's real database and must never win this — the only legitimate
   * override is `E2E_POSTGRES_DB`, which a CI workflow sets explicitly.
   */
  const requested = process.env.E2E_POSTGRES_DB ?? 'open_asm_test';

  if (!TEST_DB_PATTERN.test(requested)) {
    throw new TestEnvError(
      `Refusing to run e2e against non-test database "${requested}". ` +
        'Set E2E_POSTGRES_DB (or POSTGRES_DB) to a name ending in "_test".',
    );
  }

  /**
   * `NODE_ENV=test` is deliberate: `dataSourceOptions.migrationsRun` is
   * `NODE_ENV === 'development'`, so booting `AppModule` will NOT auto-migrate
   * the test database. `global-setup.ts` migrates it explicitly instead.
   */
  process.env.NODE_ENV = 'test';
  process.env.E2E = '1';
  process.env.POSTGRES_DB = requested;

  /**
   * better-auth's limiter is hardcoded to 100 requests / 60s in-memory
   * (`src/modules/auth/auth.ts`). A suite that signs up users and fires guard
   * matrices trips it and starts failing on rate limit instead of on real
   * bugs. `auth.ts` reads this flag; production never sets it.
   */
  process.env.AUTH_RATE_LIMIT_DISABLED = 'true';

  return requested;
}

/** Whether `globalTeardown` should drop the database. CI sets this. */
export function shouldDropDatabase(): boolean {
  return process.env.E2E_DROP_DB === '1';
}