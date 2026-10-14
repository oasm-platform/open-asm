import type { RedisService } from '@/services/redis/redis.service';
import { RedisWorkerTelemetryStore } from './redis-worker-telemetry.store';
import type { WorkerTelemetrySnapshot } from './worker-telemetry.types';

const snapshot = (): WorkerTelemetrySnapshot => ({
  schemaVersion: 1,
  workerId: 'worker-1',
  instanceId: 'instance-1',
  sequence: '12',
  state: 'READY',
  receivedAt: '2026-09-24T08:30:00.000Z',
  observedAt: '2026-09-24T08:29:59.980Z',
  startedAt: '2026-09-24T03:20:12.000Z',
  uptimeSeconds: 18348,
  version: '1.4.2',
  node: {
    hostname: 'worker-1',
    os: 'linux',
    arch: 'amd64',
    runMode: 'node',
    cpuCount: 8,
    cpuUsagePercent: 25,
    memoryUsedBytes: '1024',
    memoryTotalBytes: '2048',
  },
  jobs: { active: 1, maxConcurrency: 10 },
  containers: {
    supported: true,
    total: 0,
    active: 0,
    idle: 0,
    unhealthy: 0,
    truncated: false,
    items: [],
  },
});

describe('RedisWorkerTelemetryStore', () => {
  let redis: { setWithExpiry: jest.Mock; get: jest.Mock };
  let store: RedisWorkerTelemetryStore;

  beforeEach(() => {
    redis = {
      setWithExpiry: jest.fn().mockResolvedValue('OK'),
      get: jest.fn(),
    };
    store = new RedisWorkerTelemetryStore(redis as unknown as RedisService);
  });

  it('writes the versioned worker key with a 90 second TTL', async () => {
    const value = snapshot();

    await store.write(value);

    expect(redis.setWithExpiry).toHaveBeenCalledWith(
      'oasm:worker:telemetry:v1:worker-1',
      90,
      JSON.stringify(value),
    );
  });

  it('returns a fresh snapshot', async () => {
    redis.get.mockResolvedValue(
      JSON.stringify(snapshot()),
    );

    const result = await store.read(
      'worker-1',
      new Date('2026-09-24T08:30:20.000Z'),
    );

    expect(result).toEqual(expect.objectContaining({ freshness: 'fresh' }));
  });

  it('marks an existing snapshot stale after 30 seconds', async () => {
    redis.get.mockResolvedValue(JSON.stringify(snapshot()));

    const result = await store.read(
      'worker-1',
      new Date('2026-09-24T08:31:00.001Z'),
    );

    expect(result).toEqual(expect.objectContaining({ freshness: 'stale' }));
  });

  it.each([
    'not-json',
    JSON.stringify({ schemaVersion: 999 }),
    JSON.stringify({
      ...snapshot(),
      receivedAt: 'not-a-date',
    }),
  ])(
    'returns null for invalid cached data: %s',
    async (raw) => {
      redis.get.mockResolvedValue(raw);
      await expect(
        store.read('worker-1', new Date('2026-09-24T08:30:20.000Z')),
      ).resolves.toBeNull();
    },
  );

  it('returns null when the key is missing', async () => {
    redis.get.mockResolvedValue(null);
    await expect(
      store.read('worker-1', new Date('2026-09-24T08:30:20.000Z')),
    ).resolves.toBeNull();
  });
});
