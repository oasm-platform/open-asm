import type { Redis } from 'ioredis';
import {
  createRateLimitStorage,
  RATE_LIMIT_KEY_PREFIX,
} from './rate-limit-storage';

const RULE = { window: 10, max: 2 };
const KEY = '203.0.113.7|/sign-in/email';

/** In-memory Redis covering the commands the storage sends. */
function createFakeRedis(now: () => number) {
  const counters = new Map<string, { count: number; expiresAt: number }>();
  const values = new Map<string, string>();
  const live = (key: string) => {
    const entry = counters.get(key);
    if (entry && now() >= entry.expiresAt) counters.delete(key);
    return counters.get(key);
  };
  const redis = {
    // CONSUME: KEYS = [counter], ARGV = [window ms].
    eval: jest.fn(
      (_script: string, _numKeys: number, key: string, windowMs: number) => {
        const entry = live(key) ?? { count: 0, expiresAt: now() + windowMs };
        entry.count += 1;
        counters.set(key, entry);
        return Promise.resolve([entry.count, entry.expiresAt - now()]);
      },
    ),
    get: jest.fn((key: string) => Promise.resolve(values.get(key) ?? null)),
    set: jest.fn((key: string, value: string) => {
      values.set(key, value);
      return Promise.resolve('OK');
    }),
  };
  return { redis, counters };
}

describe('createRateLimitStorage', () => {
  let clock: number;
  const now = () => clock;

  beforeEach(() => {
    clock = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(now);
  });

  afterEach(() => jest.restoreAllMocks());

  it('allows requests up to the limit and counts them under its own prefix', async () => {
    const { redis, counters } = createFakeRedis(now);
    const storage = createRateLimitStorage(redis as unknown as Redis, 60);

    await expect(storage.consume!(KEY, RULE)).resolves.toEqual({
      allowed: true,
      retryAfter: null,
    });
    await expect(storage.consume!(KEY, RULE)).resolves.toEqual({
      allowed: true,
      retryAfter: null,
    });
    expect(counters.get(`${RATE_LIMIT_KEY_PREFIX}${KEY}`)?.count).toBe(2);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      `${RATE_LIMIT_KEY_PREFIX}${KEY}`,
      RULE.window * 1000,
    );
  });

  it('refuses past the limit and says when the window frees up', async () => {
    const { redis } = createFakeRedis(now);
    const storage = createRateLimitStorage(redis as unknown as Redis, 60);
    await storage.consume!(KEY, RULE);
    await storage.consume!(KEY, RULE);

    clock += 3_500;

    await expect(storage.consume!(KEY, RULE)).resolves.toEqual({
      allowed: false,
      retryAfter: 7,
    });
  });

  it('opens a new window once the old one expires', async () => {
    const { redis } = createFakeRedis(now);
    const storage = createRateLimitStorage(redis as unknown as Redis, 60);
    await storage.consume!(KEY, RULE);
    await storage.consume!(KEY, RULE);

    clock += RULE.window * 1000;

    await expect(storage.consume!(KEY, RULE)).resolves.toEqual({
      allowed: true,
      retryAfter: null,
    });
  });

  it('shares one budget between instances on the same Redis', async () => {
    const { redis } = createFakeRedis(now);
    const first = createRateLimitStorage(redis as unknown as Redis, 60);
    const second = createRateLimitStorage(redis as unknown as Redis, 60);
    await first.consume!(KEY, RULE);
    await second.consume!(KEY, RULE);

    await expect(first.consume!(KEY, RULE)).resolves.toMatchObject({
      allowed: false,
    });
  });

  it('keeps limiting in memory while Redis is unreachable', async () => {
    const { redis } = createFakeRedis(now);
    redis.eval.mockRejectedValue(new Error('Connection is closed.'));
    const storage = createRateLimitStorage(redis as unknown as Redis, 60);

    await expect(storage.consume!(KEY, RULE)).resolves.toMatchObject({
      allowed: true,
    });
    await expect(storage.consume!(KEY, RULE)).resolves.toMatchObject({
      allowed: true,
    });
    await expect(storage.consume!(KEY, RULE)).resolves.toEqual({
      allowed: false,
      retryAfter: RULE.window,
    });

    clock += RULE.window * 1000;
    await expect(storage.consume!(KEY, RULE)).resolves.toMatchObject({
      allowed: true,
    });
  });

  it('round-trips a record through get and set', async () => {
    const { redis } = createFakeRedis(now);
    const storage = createRateLimitStorage(redis as unknown as Redis, 60);
    const record = { key: KEY, count: 3, lastRequest: clock };

    await storage.set(KEY, record);

    await expect(storage.get(KEY)).resolves.toEqual(record);
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining(KEY),
      JSON.stringify(record),
      'EX',
      60,
    );
  });

  it('reads no record when Redis is unreachable', async () => {
    const { redis } = createFakeRedis(now);
    redis.get.mockRejectedValue(new Error('Connection is closed.'));
    const storage = createRateLimitStorage(redis as unknown as Redis, 60);

    await expect(storage.get(KEY)).resolves.toBeNull();
  });
});
