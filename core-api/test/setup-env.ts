/**
 * Jest `setupFiles` entry — runs before the test module graph is loaded, so the
 * values pinned here win over `core-api/.env` (dotenv does not override
 * variables already present in `process.env`).
 *
 * Every e2e file assumes `POSTGRES_DB` already points at a throwaway schema, so
 * the guard in `pinTestEnv()` throws rather than trusting configuration.
 */
import { pinTestEnv } from './pin-test-env';

pinTestEnv();

export {};