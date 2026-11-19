import type { DataSource } from 'typeorm';

import { limitsFor } from '../domain/query-limits';
import { Semaphore } from './concurrency';
import { CursorCodec } from './cursor';
import { executePlans, withReadOnlyUnit, type ExecutionContext } from './executor';
import type { QueryPlan } from './planner';

type Responder = (sql: string, params: unknown[]) => unknown;

function fakeDataSource(respond: Responder) {
  const log: string[] = [];
  const runners: Array<{ released: boolean }> = [];
  const dataSource = {
    createQueryRunner: jest.fn(() => {
      const state = { released: false };
      runners.push(state);
      return {
        connect: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(() => {
          state.released = true;
          return Promise.resolve();
        }),
        query: jest.fn((sql: string, params: unknown[] = []) => {
          log.push(sql.split('\n')[0]);
          try {
            return Promise.resolve(respond(sql, params));
          } catch (error) {
            return Promise.reject(error instanceof Error ? error : new Error(String(error)));
          }
        }),
        connection: {
          driver: { escapeQueryWithParameters: (sql: string, params: Record<string, unknown>) => [sql, Object.values(params)] },
        },
      };
    }),
  } as unknown as DataSource;
  return { dataSource, log, runners };
}

/** A one-column plan; the responder picks its rows from the SQL comment. */
const plan = (name: string): QueryPlan => ({
  name,
  mode: 'list',
  root: { sql: `SELECT /*${name}*/ 1`, params: {} },
  shape: { columns: [{ alias: 'c_id', path: ['id'], type: 'uuid' }], relations: [] },
  includes: [],
  limit: 2,
  sortColumns: [{ alias: 's0', cast: 'uuid' }],
  boundedSort: false,
  signature: 'sig',
});

const ctxFor = (dataSource: DataSource, overrides: Partial<ExecutionContext> = {}): ExecutionContext => ({
  dataSource,
  limits: limitsFor('http', 'interactive'),
  semaphore: new Semaphore(3, 100),
  codec: new CursorCodec('secret'),
  workspaceId: 'w1',
  rls: false,
  preflight: true,
  consistent: false,
  parallel: 2,
  deadline: Date.now() + 10_000,
  logger: { warn: jest.fn(), error: jest.fn() },
  ...overrides,
});

const explainOf = (totalCost: number) => [{ 'QUERY PLAN': [{ Plan: { 'Node Type': 'Limit', 'Total Cost': totalCost } }] }];

describe('withReadOnlyUnit', () => {
  it('opens a read-only transaction with local limits, and always rolls back and releases', async () => {
    const { dataSource, log, runners } = fakeDataSource(() => []);
    await withReadOnlyUnit(dataSource, { statementTimeoutMs: 1234, isolation: 'READ COMMITTED', rls: true, workspaceId: 'w1' }, (run) =>
      run({ sql: 'SELECT 1', params: {} }),
    );
    expect(log).toEqual([
      'BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY',
      'SET LOCAL lock_timeout = 1000',
      'SET LOCAL idle_in_transaction_session_timeout = 4702',
      'SET LOCAL ROLE asq_reader',
      "SELECT set_config('app.workspace_id', $1, true)",
      'SET LOCAL statement_timeout = 1234',
      'SELECT 1',
      'ROLLBACK',
    ]);
    expect(runners[0].released).toBe(true);
  });

  it('rolls back and releases when the work fails', async () => {
    const { dataSource, log, runners } = fakeDataSource((sql) => {
      if (sql === 'SELECT boom') throw Object.assign(new Error('x'), { code: '57014' });
      return [];
    });
    await expect(
      withReadOnlyUnit(dataSource, { statementTimeoutMs: 10, isolation: 'REPEATABLE READ', rls: false, workspaceId: 'w1' }, (run) =>
        run({ sql: 'SELECT boom', params: {} }),
      ),
    ).rejects.toMatchObject({ code: '57014' });
    expect(log[0]).toBe('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    expect(log[log.length - 1]).toBe('ROLLBACK');
    expect(runners[0].released).toBe(true);
  });
});

describe('executePlans', () => {
  const responder: Responder = (sql) => {
    if (sql.startsWith('EXPLAIN')) return explainOf(sql.includes('/*heavy*/') ? 10_000_000 : 10);
    if (sql.includes('/*three*/')) return [{ c_id: 'a', s0: 'a' }, { c_id: 'b', s0: 'b' }, { c_id: 'c', s0: 'c' }];
    if (sql.includes('/*one*/')) return [{ c_id: 'a', s0: 'a' }];
    return [];
  };

  it('returns pages with a cursor when more rows exist', async () => {
    const { dataSource } = fakeDataSource(responder);
    const [outcome] = await executePlans([plan('three')], ctxFor(dataSource));
    expect(outcome.result).toEqual({ rows: [{ id: 'a' }, { id: 'b' }], nextCursor: expect.any(String), truncated: false });
    expect(outcome.meta).toEqual(expect.objectContaining({ sqlCount: 1, rowCount: 2 }));
  });

  it('keeps one query failure to that query', async () => {
    const { dataSource } = fakeDataSource(responder);
    const outcomes = await executePlans([plan('heavy'), plan('one')], ctxFor(dataSource));
    expect(outcomes[0].result).toEqual({ error: expect.objectContaining({ code: 'COST_EXCEEDED' }) });
    expect(outcomes[1].result).toEqual(expect.objectContaining({ rows: [{ id: 'a' }], nextCursor: null }));
  });

  it('times out queries past the batch deadline', async () => {
    const { dataSource } = fakeDataSource(responder);
    const [outcome] = await executePlans([plan('one')], ctxFor(dataSource, { deadline: Date.now() - 1 }));
    expect(outcome.result).toEqual({ error: expect.objectContaining({ code: 'QUERY_TIMEOUT' }) });
  });

  it('runs a consistent batch in one REPEATABLE READ unit', async () => {
    const { dataSource, log } = fakeDataSource(responder);
    await executePlans([plan('one'), plan('three')], ctxFor(dataSource, { consistent: true }));
    expect((dataSource.createQueryRunner as jest.Mock).mock.calls).toHaveLength(1);
    expect(log[0]).toBe('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  });

  it('logs SQL of a compiler bug, never returns it', async () => {
    const { dataSource } = fakeDataSource((sql) => {
      if (sql.startsWith('EXPLAIN')) return explainOf(1);
      if (sql.includes('/*one*/')) throw Object.assign(new Error('column "x" does not exist'), { code: '42703' });
      return [];
    });
    const ctx = ctxFor(dataSource);
    const [outcome] = await executePlans([plan('one')], ctx);
    expect(JSON.stringify(outcome.result)).not.toMatch(/column|SELECT/);
    expect(ctx.logger.error).toHaveBeenCalledWith(expect.stringContaining('SELECT /*one*/'));
  });
});
