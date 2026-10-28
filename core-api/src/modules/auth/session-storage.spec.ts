import type { AuthContext } from 'better-auth';
import type { Redis } from 'ioredis';
import {
  createSessionStorage,
  SESSION_CACHE_TTL_SECONDS,
  SESSION_KEY_PREFIX,
} from './session-storage';

const HOUR_MS = 3600 * 1000;
const TOKEN_KEY = `${SESSION_KEY_PREFIX}tok`;
const REVOKED_KEY = `${SESSION_KEY_PREFIX}revoked:tok`;

/** In-memory Redis covering the commands the storage sends. */
function createFakeRedis() {
  const store = new Map<string, string>();
  const ttls = new Map<string, number>();
  const write = (key: string, value: string, ttl: number) => {
    store.set(key, value);
    ttls.set(key, ttl);
  };
  const redis = {
    get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    del: jest.fn((key: string) => Promise.resolve(store.delete(key) ? 1 : 0)),
    // SET_UNLESS_REVOKED: KEYS = [entry, marker], ARGV = [value, seconds].
    eval: jest.fn(
      (
        _script: string,
        _numKeys: number,
        key: string,
        revokedKey: string,
        value: string,
        seconds: number,
      ) => {
        if (store.has(revokedKey)) return Promise.resolve(0);
        write(key, value, seconds);
        return Promise.resolve(1);
      },
    ),
    multi: jest.fn(() => {
      const ops: (() => void)[] = [];
      const tx = {
        set: (key: string, value: string, _ex: 'EX', seconds: number) => {
          ops.push(() => write(key, value, seconds));
          return tx;
        },
        del: (key: string) => {
          ops.push(() => store.delete(key));
          return tx;
        },
        exec: jest.fn(() => {
          ops.forEach((op) => op());
          return Promise.resolve([]);
        }),
      };
      return tx;
    }),
  };
  return { redis, store, ttls };
}

function dbRow(token: string, expiresAt: Date) {
  return {
    id: 'session-1',
    token,
    userId: 'user-1',
    expiresAt,
    user: { id: 'user-1', email: 'a@example.com', role: 'user' },
  };
}

describe('createSessionStorage', () => {
  let fake: ReturnType<typeof createFakeRedis>;
  let findOne: jest.Mock;
  let findMany: jest.Mock;
  let storage: ReturnType<typeof createSessionStorage>;

  beforeEach(() => {
    fake = createFakeRedis();
    findOne = jest.fn().mockResolvedValue(null);
    findMany = jest.fn().mockResolvedValue([]);
    const context = { adapter: { findOne, findMany } } as unknown as AuthContext;
    storage = createSessionStorage(
      fake.redis as unknown as Redis,
      () => Promise.resolve(context),
    );
  });

  describe('get', () => {
    it('serves a cached session without querying the database', async () => {
      fake.store.set(TOKEN_KEY, '{"cached":true}');

      await expect(storage.get('tok')).resolves.toBe('{"cached":true}');
      expect(findOne).not.toHaveBeenCalled();
    });

    it('loads a missing session from the database and writes it back', async () => {
      const expiresAt = new Date(Date.now() + HOUR_MS);
      findOne.mockResolvedValue(dbRow('tok', expiresAt));

      const raw = await storage.get('tok');

      expect(findOne).toHaveBeenCalledWith({
        model: 'session',
        where: [{ field: 'token', value: 'tok' }],
        join: { user: true },
      });
      const { user, ...session } = dbRow('tok', expiresAt);
      expect(JSON.parse(raw as string)).toEqual(
        JSON.parse(JSON.stringify({ session, user })),
      );
      expect(fake.store.get(TOKEN_KEY)).toBe(raw);
      expect(fake.ttls.get(TOKEN_KEY)).toBe(SESSION_CACHE_TTL_SECONDS);

      findOne.mockClear();
      await storage.get('tok');
      expect(findOne).not.toHaveBeenCalled();
    });

    it('caches a session about to expire only until it expires', async () => {
      findOne.mockResolvedValue(dbRow('tok', new Date(Date.now() + 60_500)));

      await storage.get('tok');

      expect(fake.ttls.get(TOKEN_KEY)).toBe(60);
    });

    it('returns null and caches nothing for an unknown token', async () => {
      await expect(storage.get('missing')).resolves.toBeNull();
      expect(fake.redis.eval).not.toHaveBeenCalled();
    });

    it('returns an expired database session without caching it', async () => {
      findOne.mockResolvedValue(dbRow('tok', new Date(Date.now() - 1000)));

      // Better Auth sees it is expired and deletes it.
      await expect(storage.get('tok')).resolves.not.toBeNull();
      expect(fake.store.has(TOKEN_KEY)).toBe(false);
    });

    it('falls back to the database when the Redis read fails', async () => {
      fake.redis.get.mockRejectedValueOnce(new Error('connection lost'));

      await expect(storage.get('tok')).resolves.toBeNull();
      // Better Auth runs the database lookup itself on a null.
      expect(findOne).not.toHaveBeenCalled();
    });

    it('still returns the database session when the write-back fails', async () => {
      findOne.mockResolvedValue(dbRow('tok', new Date(Date.now() + HOUR_MS)));
      fake.redis.eval.mockRejectedValueOnce(new Error('connection lost'));

      const raw = await storage.get('tok');

      expect(JSON.parse(raw as string)).toMatchObject({
        session: { token: 'tok' },
      });
    });
  });

  describe('revocation', () => {
    it('removes the entry and marks the token revoked', async () => {
      fake.store.set(TOKEN_KEY, '{}');

      await storage.delete('tok');

      expect(fake.store.has(TOKEN_KEY)).toBe(false);
      expect(fake.ttls.get(REVOKED_KEY)).toBe(SESSION_CACHE_TTL_SECONDS);
    });

    it('never caches a revoked token again from a racing database read', async () => {
      // A request read the row just before Better Auth deleted it.
      findOne.mockResolvedValue(dbRow('tok', new Date(Date.now() + HOUR_MS)));
      await storage.delete('tok');

      await storage.get('tok');

      expect(fake.store.has(TOKEN_KEY)).toBe(false);
    });

    it('never re-creates a revoked token from a racing refresh', async () => {
      await storage.delete('tok');

      await storage.set('tok', '{"refreshed":true}', 3600);

      expect(fake.store.has(TOKEN_KEY)).toBe(false);
    });

    it('swallows a failed delete so Better Auth still deletes the row', async () => {
      fake.redis.multi.mockImplementationOnce(() => {
        throw new Error('connection lost');
      });

      await expect(storage.delete('tok')).resolves.toBeUndefined();
    });
  });

  describe('set', () => {
    it('caps the entry lifetime', async () => {
      await storage.set('tok', 'value', 7 * 24 * 3600);

      expect(fake.store.get(TOKEN_KEY)).toBe('value');
      expect(fake.ttls.get(TOKEN_KEY)).toBe(SESSION_CACHE_TTL_SECONDS);
    });

    it('drops the entry instead of storing it forever on a zero TTL', async () => {
      fake.store.set(TOKEN_KEY, 'old');

      await storage.set('tok', 'value', 0);

      expect(fake.store.has(TOKEN_KEY)).toBe(false);
      expect(fake.redis.eval).not.toHaveBeenCalled();
    });

    it('swallows a failed write so sign-in still succeeds', async () => {
      fake.redis.eval.mockRejectedValueOnce(new Error('connection lost'));

      await expect(storage.set('tok', 'value', 60)).resolves.toBeUndefined();
    });
  });

  describe('active-session list', () => {
    it('is read from the database, including sessions never cached', async () => {
      const expiresAt = new Date(Date.now() + HOUR_MS);
      findMany.mockResolvedValue([{ token: 'a', expiresAt }]);

      const raw = await storage.get('active-sessions-user-1');

      expect(JSON.parse(raw as string)).toEqual([
        { token: 'a', expiresAt: expiresAt.getTime() },
      ]);
      expect(findMany).toHaveBeenCalledWith({
        model: 'session',
        where: [
          { field: 'userId', value: 'user-1' },
          { field: 'expiresAt', value: expect.any(Date), operator: 'gt' },
        ],
      });
      expect(fake.redis.get).not.toHaveBeenCalled();
    });

    it('is never written to Redis', async () => {
      await storage.set('active-sessions-user-1', '[]', 60);
      await storage.delete('active-sessions-user-1');

      expect(fake.redis.eval).not.toHaveBeenCalled();
      expect(fake.redis.multi).not.toHaveBeenCalled();
    });
  });

  it('ignores verification keys', async () => {
    await storage.set('verification:abc', 'value', 60);
    await storage.delete('verification:abc');

    await expect(storage.get('verification:abc')).resolves.toBeNull();
    expect(fake.redis.get).not.toHaveBeenCalled();
    expect(fake.redis.eval).not.toHaveBeenCalled();
    expect(fake.redis.multi).not.toHaveBeenCalled();
  });
});
