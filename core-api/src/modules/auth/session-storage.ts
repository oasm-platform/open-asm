import { Logger } from '@nestjs/common';
import type { AuthContext, SecondaryStorage } from 'better-auth';
import { Redis } from 'ioredis';

/** Prefix of every key the session cache writes to Redis. */
export const SESSION_KEY_PREFIX = 'session:';

/**
 * Longest a cached session is trusted before it is read from the database
 * again. Revocation through Better Auth takes effect at once; this bounds how
 * long anything that bypasses it can linger: a raw SQL write to users or
 * sessions, Redis restored from an older snapshot, a delete lost to a Redis
 * outage.
 */
export const SESSION_CACHE_TTL_SECONDS = 5 * 60;

// Key families Better Auth writes through secondaryStorage. A session entry is
// stored under its bare token, so a key matching neither prefix is a token.
const ACTIVE_SESSIONS_PREFIX = 'active-sessions-';
const VERIFICATION_PREFIX = 'verification:';
const REVOKED_PREFIX = 'revoked:';

// Writes a token entry only while the token carries no revocation marker.
const SET_UNLESS_REVOKED = `
if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
return 1
`;

/** The `{ session, user }` entry Better Auth caches per session token. */
interface CachedSession {
  session: { token: string; userId: string; expiresAt: Date | string };
  user: Record<string, unknown>;
}

const logger = new Logger('SessionStorage');

/**
 * Redis connection for the session cache. Every option serves one goal: a
 * slow or unreachable Redis turns into a quick cache miss that the database
 * answers, never into a stalled authenticated request.
 */
export function createSessionRedis(url: string | undefined): Redis {
  const redis = new Redis(url ?? 'redis://localhost:6379', {
    // Fail at once while disconnected instead of queueing until reconnect.
    enableOfflineQueue: false,
    commandTimeout: 500,
    connectTimeout: 2000,
    maxRetriesPerRequest: 1,
  });
  redis.on('error', (error: Error) => {
    logger.warn(`Session cache connection error: ${error.message}`);
  });
  return redis;
}

/**
 * Better Auth secondary storage that caches sessions in Redis under
 * {@link SESSION_KEY_PREFIX}, so the auth guard and `get-session` resolve a
 * session without touching the database.
 *
 * The database stays the source of truth (`storeSessionInDatabase`):
 * - A token Redis does not hold is read from the database and written back,
 *   so a session created before the cache existed is cached on first use.
 * - An entry lives at most {@link SESSION_CACHE_TTL_SECONDS}.
 * - Deleting a token leaves a revocation marker for as long, and no write
 *   lands while it exists. Better Auth clears Redis before the database row,
 *   so without it a request in between would cache the session again.
 * - A user's session list comes from the database, never from Redis.
 * - A Redis failure never fails the auth call: reads fall back to the
 *   database, and a failed delete still lets Better Auth delete the row.
 *
 * Verifications are not cached: they stay database-only
 * (`verification.storeInDatabase`), and their keys are ignored here.
 *
 * @param getContext - Resolves the auth context whose adapter reads the
 *   database. Lazy because the storage is built before the auth instance.
 */
export function createSessionStorage(
  redis: Redis,
  getContext: () => Promise<AuthContext>,
): SecondaryStorage {
  const keyOf = (token: string) => `${SESSION_KEY_PREFIX}${token}`;
  const revokedKeyOf = (token: string) =>
    `${SESSION_KEY_PREFIX}${REVOKED_PREFIX}${token}`;
  const isIgnored = (key: string) =>
    key.startsWith(VERIFICATION_PREFIX) ||
    key.startsWith(ACTIVE_SESSIONS_PREFIX);

  /** Same query Better Auth runs when the secondary storage misses. */
  async function loadFromDatabase(
    token: string,
  ): Promise<CachedSession | null> {
    const { adapter } = await getContext();
    const row = await adapter.findOne<
      CachedSession['session'] & { user?: CachedSession['user'] }
    >({
      model: 'session',
      where: [{ field: 'token', value: token }],
      join: { user: true },
    });
    if (!row?.user) return null;
    const { user, ...session } = row;
    return { session, user };
  }

  /**
   * A user's live sessions, in Better Auth's `active-sessions-<userId>` shape.
   * Revoking all of a user's sessions (ban, password change, "sign out other
   * devices") walks this list, so it must hold every session, including ones
   * the cache has never seen.
   */
  async function listFromDatabase(userId: string): Promise<string> {
    const { adapter } = await getContext();
    const rows = await adapter.findMany<{
      token: string;
      expiresAt: Date | string;
    }>({
      model: 'session',
      where: [
        { field: 'userId', value: userId },
        { field: 'expiresAt', value: new Date(), operator: 'gt' },
      ],
    });
    return JSON.stringify(
      rows.map((row) => ({
        token: row.token,
        expiresAt: new Date(row.expiresAt).getTime(),
      })),
    );
  }

  async function cacheToken(token: string, value: string, ttl: number) {
    const seconds = Math.min(Math.floor(ttl), SESSION_CACHE_TTL_SECONDS);
    try {
      if (seconds <= 0) {
        await redis.del(keyOf(token));
        return;
      }
      await redis.eval(
        SET_UNLESS_REVOKED,
        2,
        keyOf(token),
        revokedKeyOf(token),
        value,
        seconds,
      );
    } catch (error) {
      logger.warn(`Session cache write failed: ${String(error)}`);
    }
  }

  return {
    async get(key) {
      if (key.startsWith(VERIFICATION_PREFIX)) return null;
      if (key.startsWith(ACTIVE_SESSIONS_PREFIX)) {
        return listFromDatabase(key.slice(ACTIVE_SESSIONS_PREFIX.length));
      }

      try {
        const cached = await redis.get(keyOf(key));
        if (cached) return cached;
      } catch (error) {
        // Null sends Better Auth to the database.
        logger.warn(`Session cache read failed: ${String(error)}`);
        return null;
      }

      const entry = await loadFromDatabase(key);
      if (!entry) return null;
      const value = JSON.stringify(entry);
      const expiresAt = new Date(entry.session.expiresAt).getTime();
      await cacheToken(key, value, (expiresAt - Date.now()) / 1000);
      return value;
    },

    async set(key, value, ttl) {
      if (isIgnored(key)) return;
      await cacheToken(key, value, ttl ?? SESSION_CACHE_TTL_SECONDS);
    },

    async delete(key) {
      if (isIgnored(key)) return;
      try {
        await redis
          .multi()
          .set(revokedKeyOf(key), '1', 'EX', SESSION_CACHE_TTL_SECONDS)
          .del(keyOf(key))
          .exec();
      } catch (error) {
        // Better Auth deletes the database row after this call, so throwing
        // would keep the session valid there too. An entry that survives
        // expires within SESSION_CACHE_TTL_SECONDS.
        logger.warn(`Session cache delete failed: ${String(error)}`);
      }
    },
  };
}
