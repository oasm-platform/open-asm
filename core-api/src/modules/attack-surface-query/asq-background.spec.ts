import type { DataSource, Repository } from 'typeorm';

import { AsqRollupsService, ROLLUP_COUNTS_SQL } from './asq-rollups.service';
import { AsqSavedQueriesService } from './asq-saved-queries.service';
import type { AttackSurfaceQueryService } from './attack-surface-query.service';
import { AsqError } from './domain/query-errors';
import type { QueryScope } from './domain/query.types';
import type { AsqSavedQuery } from './entities/asq-saved-query.entity';

jest.mock('@/services/redis/lock.decorator', () => ({
  Lock: () => () => undefined,
}));

const SCOPE: QueryScope = { workspaceId: 'w1', permissions: ['*'], caller: 'http' };

describe('AsqSavedQueriesService', () => {
  const build = () => {
    const repo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((v: unknown) => v),
      save: jest.fn((v: unknown) => Promise.resolve({ id: 'q1', ...(v as object) })),
      delete: jest.fn(),
    };
    const asq = { validate: jest.fn(), run: jest.fn().mockResolvedValue({ data: {} }) };
    const service = new AsqSavedQueriesService(
      repo as unknown as Repository<AsqSavedQuery>,
      asq as unknown as AttackSurfaceQueryService,
    );
    return { repo, asq, service };
  };

  it('validates the spec as its author before saving', async () => {
    const { repo, asq, service } = build();
    asq.validate.mockImplementation(() => {
      throw new AsqError('PERMISSION_DENIED', 'no');
    });
    await expect(service.create(SCOPE, 'u1', { name: 'x', spec: { queries: {} } })).rejects.toBeInstanceOf(AsqError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('scopes reads to the workspace (404 for another tenant)', async () => {
    const { repo, service } = build();
    repo.findOne.mockResolvedValue(null);
    await expect(service.get('w1', 'q-of-w2')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'q-of-w2', workspaceId: 'w1' } });
  });

  it('maps a duplicate name to a query error', async () => {
    const { repo, service } = build();
    repo.save.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));
    await expect(service.create(SCOPE, 'u1', { name: 'dup', spec: { queries: {} } })).rejects.toMatchObject({ code: 'INVALID_QUERY' });
  });

  it('runs a saved spec with the caller scope', async () => {
    const { repo, asq, service } = build();
    repo.findOne.mockResolvedValue({ id: 'q1', workspaceId: 'w1', spec: { queries: { a: { from: 'hosts' } } } });
    await service.run(SCOPE, 'q1');
    expect(asq.run).toHaveBeenCalledWith(SCOPE, { queries: { a: { from: 'hosts' } } });
  });

  const PARAM_SPEC = {
    params: { size: { type: 'number', default: 10 } },
    queries: { a: { from: 'hosts', limit: { $param: 'size' } } },
  };

  it('validates a spec with params at their defaults', async () => {
    const { asq, service } = build();
    await service.create(SCOPE, 'u1', { name: 'x', spec: PARAM_SPEC });
    expect(asq.validate).toHaveBeenCalledWith(SCOPE, { queries: { a: { from: 'hosts', limit: 10 } } });
  });

  it('runs a saved spec with the caller params, and a report with the defaults', async () => {
    const { repo, asq, service } = build();
    repo.findOne.mockResolvedValue({ id: 'q1', workspaceId: 'w1', spec: PARAM_SPEC });
    await service.run(SCOPE, 'q1', { size: 3 });
    expect(asq.run).toHaveBeenLastCalledWith(SCOPE, { queries: { a: { from: 'hosts', limit: 3 } } });
    await service.runSpec(SCOPE, PARAM_SPEC);
    expect(asq.run).toHaveBeenLastCalledWith(SCOPE, { queries: { a: { from: 'hosts', limit: 10 } } });
  });

  it('refuses a param the saved query does not declare', async () => {
    const { repo, service } = build();
    repo.findOne.mockResolvedValue({ id: 'q1', workspaceId: 'w1', spec: PARAM_SPEC });
    await expect(service.run(SCOPE, 'q1', { other: 1 })).rejects.toMatchObject({ code: 'INVALID_QUERY' });
  });
});

describe('AsqRollupsService', () => {
  it('replaces one workspace in a transaction, scoping every branch to it', async () => {
    const queries: Array<[string, unknown[]]> = [];
    const manager = { query: jest.fn((sql: string, params: unknown[]) => Promise.resolve(queries.push([sql, params]))) };
    const dataSource = {
      transaction: jest.fn(async (fn: (m: typeof manager) => Promise<void>) => fn(manager)),
      query: jest.fn().mockResolvedValue([{ id: 'w1' }, { id: 'w2' }]),
    };
    const service = new AsqRollupsService(dataSource as unknown as DataSource);
    await expect(service.refreshAll()).resolves.toBe(2);
    expect(dataSource.transaction).toHaveBeenCalledTimes(2);
    expect(queries[0]).toEqual([expect.stringMatching(/^DELETE FROM asq_surface_rollups WHERE "workspaceId" = \$1/), ['w1']]);
    expect(queries[1][0]).toContain(ROLLUP_COUNTS_SQL);
    expect(ROLLUP_COUNTS_SQL.match(/WHERE s\."workspaceId" = \$1/g)).toHaveLength(5);
  });
});
