import type { Queue } from 'bullmq';

import type { RedisService } from '@/services/redis/redis.service';

import type { AsqConnectionsService } from './asq-connections.service';
import { AttackSurfaceQueryService, type AsqReportJob } from './attack-surface-query.service';
import { AsqError } from './domain/query-errors';
import type { QueryScope } from './domain/query.types';
import { Semaphore } from './engine/concurrency';
import { CursorCodec } from './engine/cursor';
import { executePlans } from './engine/executor';

jest.mock('./engine/executor', () => ({
  ...jest.requireActual<object>('./engine/executor'),
  executePlans: jest.fn(),
}));
const execute = executePlans as jest.MockedFunction<typeof executePlans>;

const SCOPE: QueryScope = { workspaceId: '11111111-1111-4111-8111-111111111111', permissions: ['*'], caller: 'http' };

function setup() {
  const store = new Map<string, string>();
  const redis = {
    cacheClient: {
      get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
      set: jest.fn((key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve('OK');
      }),
    },
  } as unknown as RedisService;
  const queue = { add: jest.fn().mockResolvedValue(undefined) } as unknown as Queue<AsqReportJob>;
  const connections = {
    semaphore: new Semaphore(3, 100),
    codec: new CursorCodec('secret'),
    rls: false,
    dataSourceFor: jest.fn().mockReturnValue({}),
  } as unknown as AsqConnectionsService;
  const service = new AttackSurfaceQueryService(connections, redis, queue);
  return { service, queue, store, connections };
}

describe('AttackSurfaceQueryService', () => {
  beforeEach(() => execute.mockReset());

  it('validates before touching the database', async () => {
    const { service } = setup();
    await expect(service.run(SCOPE, { queries: { a: { from: 'nowhere' } } })).rejects.toBeInstanceOf(AsqError);
    expect(execute).not.toHaveBeenCalled();
  });

  it('refuses a query over the static budget before running it', async () => {
    const { service } = setup();
    await expect(
      service.run(SCOPE, {
        queries: { a: { from: 'services', limit: 1000, where: { logic: 'and', items: [{ field: 'value', op: 'contains', value: 'x' }] }, include: { urls: { limit: 50 } } } },
      }),
    ).rejects.toMatchObject({ code: 'COST_EXCEEDED' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('runs interactive batches with the pre-flight and merges meta', async () => {
    const { service } = setup();
    execute.mockResolvedValue([
      { result: { rows: [], nextCursor: null, truncated: false }, meta: { tookMs: 3, sqlCount: 1, rowCount: 0 } },
    ]);
    const result = await service.run(SCOPE, { window: { since: 'now-5d' }, queries: { a: { from: 'hosts' } } });
    expect(execute).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ preflight: true, workspaceId: SCOPE.workspaceId, parallel: 3 }));
    expect(result).toEqual(
      expect.objectContaining({ data: { a: expect.objectContaining({ rows: [] }) }, meta: expect.objectContaining({ queries: { a: expect.objectContaining({ cost: expect.any(Number), sqlCount: 1 }) } }) }),
    );
  });

  it('queues report mode with the caller snapshot and serves its state per workspace', async () => {
    const { service, queue } = setup();
    const state = await service.run(SCOPE, { queries: { a: { from: 'hosts', limit: 5000 } }, options: { mode: 'report' } });
    expect(state).toEqual({ jobId: expect.any(String), status: 'queued' });
    const jobId = (state as { jobId: string }).jobId;
    expect(queue.add).toHaveBeenCalledWith(
      'run',
      expect.objectContaining({ workspaceId: SCOPE.workspaceId, permissions: ['*'] }),
      expect.objectContaining({ jobId }),
    );
    await expect(service.getReport(SCOPE.workspaceId, jobId)).resolves.toEqual({ jobId, status: 'queued' });
    await expect(service.getReport('22222222-2222-4222-8222-222222222222', jobId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('records a failed report job without throwing', async () => {
    const { service } = setup();
    await service.runReportJob('job-1', { workspaceId: SCOPE.workspaceId, permissions: ['asset.read'], input: { queries: { v: { from: 'vulnerabilities' } } } });
    await expect(service.getReport(SCOPE.workspaceId, 'job-1')).resolves.toEqual({
      jobId: 'job-1',
      status: 'failed',
      error: expect.objectContaining({ code: 'PERMISSION_DENIED' }),
    });
  });
});
