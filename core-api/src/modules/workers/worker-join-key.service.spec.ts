import {
  WORKER_JOIN_KEY_ID_PREFIX,
  WORKER_JOIN_KEY_PREFIX,
  WORKER_JOIN_KEY_TTL_SECONDS,
} from '@/common/constants/app.constants';
import type { RedisService } from '@/services/redis/redis.service';
import { WorkerJoinKeyService } from './worker-join-key.service';

/** Just enough of ioredis for the service: SET EX (via MULTI), GET, GETDEL, DEL. */
function createFakeRedis() {
  const store = new Map<string, string>();
  const ttls = new Map<string, number>();
  const set = (key: string, value: string, _ex: 'EX', seconds: number) => {
    store.set(key, value);
    ttls.set(key, seconds);
  };
  const client = {
    multi: () => {
      const ops: (() => void)[] = [];
      const tx = {
        set: (key: string, value: string, ex: 'EX', seconds: number) => {
          ops.push(() => set(key, value, ex, seconds));
          return tx;
        },
        exec: () => {
          ops.forEach((op) => op());
          return Promise.resolve([]);
        },
      };
      return tx;
    },
    get: (key: string) => Promise.resolve(store.get(key) ?? null),
    getdel: (key: string) => {
      const value = store.get(key) ?? null;
      store.delete(key);
      return Promise.resolve(value);
    },
    del: (...keys: string[]) => {
      let removed = 0;
      for (const key of keys) if (store.delete(key)) removed++;
      return Promise.resolve(removed);
    },
  };
  return { store, ttls, client };
}

describe('WorkerJoinKeyService', () => {
  let redis: ReturnType<typeof createFakeRedis>;
  let service: WorkerJoinKeyService;

  beforeEach(() => {
    redis = createFakeRedis();
    service = new WorkerJoinKeyService({
      client: redis.client,
    } as unknown as RedisService);
  });

  it('stores the record and its id alias with the configured TTL', async () => {
    const key = await service.create('ws-1', 'u-1');

    const record = JSON.parse(
      redis.store.get(WORKER_JOIN_KEY_PREFIX + key.apiKey)!,
    );
    expect(record).toMatchObject({
      id: key.id,
      workspaceId: 'ws-1',
      createdBy: 'u-1',
    });
    expect(redis.store.get(WORKER_JOIN_KEY_ID_PREFIX + key.id)).toBe(
      key.apiKey,
    );
    expect(redis.ttls.get(WORKER_JOIN_KEY_PREFIX + key.apiKey)).toBe(
      WORKER_JOIN_KEY_TTL_SECONDS,
    );
    expect(redis.ttls.get(WORKER_JOIN_KEY_ID_PREFIX + key.id)).toBe(
      WORKER_JOIN_KEY_TTL_SECONDS,
    );
    expect(key.expiresInSeconds).toBe(WORKER_JOIN_KEY_TTL_SECONDS);
  });

  it('lets a key be consumed exactly once and drops its alias', async () => {
    const key = await service.create('ws-1', 'u-1');

    const [first, second] = await Promise.all([
      service.consume(key.apiKey),
      service.consume(key.apiKey),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect((first ?? second)!.workspaceId).toBe('ws-1');
    expect(redis.store.size).toBe(0);
  });

  it('returns null for an unknown or oversized key', async () => {
    await expect(service.consume('nope')).resolves.toBeNull();
    await expect(service.consume('x'.repeat(500))).resolves.toBeNull();
    await expect(service.consume('')).resolves.toBeNull();
  });

  it('rotate deletes the old key and issues a new one', async () => {
    const old = await service.create('ws-1', 'u-1');

    const next = await service.rotate('ws-1', 'u-1', old.id);

    expect(next.id).not.toBe(old.id);
    expect(next.apiKey).not.toBe(old.apiKey);
    await expect(service.consume(old.apiKey)).resolves.toBeNull();
    await expect(service.consume(next.apiKey)).resolves.toMatchObject({
      id: next.id,
    });
  });

  it('rotate of an expired key just issues a new one', async () => {
    const next = await service.rotate(
      'ws-1',
      'u-1',
      '00000000-0000-4000-8000-000000000000',
    );

    await expect(service.consume(next.apiKey)).resolves.toMatchObject({
      workspaceId: 'ws-1',
    });
  });

  it('revoke ignores a key that belongs to another workspace', async () => {
    const key = await service.create('ws-1', 'u-1');

    await service.revoke('ws-2', key.id);

    await expect(service.consume(key.apiKey)).resolves.toMatchObject({
      workspaceId: 'ws-1',
    });
  });

  it('revoke deletes both entries of a key in the same workspace', async () => {
    const key = await service.create('ws-1', 'u-1');

    await service.revoke('ws-1', key.id);

    expect(redis.store.size).toBe(0);
  });
});
