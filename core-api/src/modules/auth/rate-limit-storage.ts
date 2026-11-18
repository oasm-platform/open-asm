import { Logger } from '@nestjs/common';
import type { BetterAuthRateLimitStorage, RateLimit } from 'better-auth';
import type { Redis } from 'ioredis';

/** Prefix of every key the auth rate limiter writes to Redis. */
export const RATE_LIMIT_KEY_PREFIX = 'auth-rate-limit:';
const RECORD_PREFIX = `${RATE_LIMIT_KEY_PREFIX}record:`;

/** Entries the in-memory fallback holds before it drops the oldest. */
const MAX_FALLBACK_ENTRIES = 10_000;

// Counts one request and returns the count with the window's remaining ms.
// The window opens with the first request and is fixed, like better-auth's
// own secondary-storage limiter.
const CONSUME = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return {count, redis.call('PTTL', KEYS[1])}
`;

const logger = new Logger('RateLimitStorage');

/**
 * better-auth rate-limit storage in Redis, so every API replica draws on one
 * budget per client and path instead of each counting its own.
 *
 * `consume` counts and decides in one atomic script, which is the path
 * better-auth takes whenever a storage has it. While Redis is unreachable it
 * counts in this process, so the limit degrades to per-instance (the old
 * in-memory behaviour) instead of failing auth requests or lifting the limit.
 *
 * `get` and `set` back better-auth's non-atomic fallback, used only for a
 * storage without `consume`. They keep its JSON records, apart from the
 * counters, for `windowSeconds`.
 */
export function createRateLimitStorage(
  redis: Pick<Redis, 'eval' | 'get' | 'set'>,
  windowSeconds: number,
): BetterAuthRateLimitStorage {
  const fallback = new Map<string, { count: number; resetAt: number }>();

  function countInMemory(key: string, windowMs: number): [number, number] {
    const now = Date.now();
    let entry = fallback.get(key);
    if (!entry || now >= entry.resetAt) {
      if (fallback.size >= MAX_FALLBACK_ENTRIES) pruneFallback(now);
      entry = { count: 0, resetAt: now + windowMs };
      fallback.set(key, entry);
    }
    entry.count += 1;
    return [entry.count, entry.resetAt - now];
  }

  function pruneFallback(now: number): void {
    for (const [key, entry] of fallback) {
      if (now >= entry.resetAt) fallback.delete(key);
    }
    // Map iteration is insertion order, so this drops the oldest windows.
    for (const key of fallback.keys()) {
      if (fallback.size < MAX_FALLBACK_ENTRIES) break;
      fallback.delete(key);
    }
  }

  return {
    async consume(key, rule) {
      const windowMs = rule.window * 1000;
      let count: number;
      let remainingMs: number;
      try {
        [count, remainingMs] = (await redis.eval(
          CONSUME,
          1,
          `${RATE_LIMIT_KEY_PREFIX}${key}`,
          windowMs,
        )) as [number, number];
      } catch (error) {
        logger.warn(`Rate limit counted in memory, Redis failed: ${String(error)}`);
        [count, remainingMs] = countInMemory(key, windowMs);
      }
      if (count <= rule.max) return { allowed: true, retryAfter: null };
      const retryMs = remainingMs > 0 ? remainingMs : windowMs;
      return { allowed: false, retryAfter: Math.ceil(retryMs / 1000) };
    },

    async get(key) {
      try {
        const raw = await redis.get(`${RECORD_PREFIX}${key}`);
        return raw ? (JSON.parse(raw) as RateLimit) : null;
      } catch (error) {
        logger.warn(`Rate limit read failed: ${String(error)}`);
        return null;
      }
    },

    async set(key, value) {
      try {
        await redis.set(
          `${RECORD_PREFIX}${key}`,
          JSON.stringify(value),
          'EX',
          windowSeconds,
        );
      } catch (error) {
        logger.warn(`Rate limit write failed: ${String(error)}`);
      }
    },
  };
}
