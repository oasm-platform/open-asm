import type { QueryBatchResult } from '@/modules/attack-surface-query/domain/query.types';
import { queryToData, queryQueries } from './queries';

const now = new Date('2026-11-26T10:00:00.000Z');

describe('queryQueries', () => {
  it('forces a consistent interactive run over the spec options and fills params with defaults', () => {
    const spec = {
      params: { min: { type: 'number', default: 3 } },
      options: { mode: 'report', timeoutMs: 1000 },
      queries: { a: { from: 'assets', limit: { $param: 'min' } } },
    };
    const [batch] = queryQueries({ spec, title: 'T' }, now) as Array<Record<string, any>>;
    expect(batch.options).toEqual({ mode: 'interactive', consistent: true, timeoutMs: 1000 });
    expect(batch.params).toBeUndefined();
    expect(batch.queries.a.limit).toBe(3);
  });

  it('works for a spec without options', () => {
    const [batch] = queryQueries({ spec: { queries: {} }, title: 'T' }, now) as Array<Record<string, any>>;
    expect(batch.options).toEqual({ consistent: true, mode: 'interactive' });
  });
});

describe('queryToData', () => {
  it('builds report data with title, description, timestamp and tables of the first result', () => {
    const result: QueryBatchResult = { data: { a: { rows: [{ name: 'x' }], truncated: false } } } as never;
    const data = queryToData([result], { workspaceName: 'w', now, options: { spec: {}, title: 'T', description: 'D' } });
    expect(data).toMatchObject({ title: 'T', description: 'D', generatedAt: now.toISOString() });
    expect(data.tables).toEqual([{ name: 'a', columns: ['name'], rows: [['x']], truncated: false }]);
  });
});
