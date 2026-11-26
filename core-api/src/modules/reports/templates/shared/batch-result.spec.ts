import { AsqError } from '@/modules/attack-surface-query/domain/query-errors';
import type { QueryBatchResult } from '@/modules/attack-surface-query/domain/query.types';
import { num, rowsOf } from './batch-result';

const meta = { now: '2026-01-01T00:00:00.000Z', tookMs: 1, queries: {} };
const batch = (data: QueryBatchResult['data']): QueryBatchResult => ({ data, meta });

describe('rowsOf', () => {
  it('finds the query in any batch', () => {
    const rows = [{ n: 1 }];
    const results = [batch({ a: { rows: [], truncated: false } }), batch({ b: { rows, truncated: false } })];
    expect(rowsOf(results, 'b')).toBe(rows);
  });

  it('throws an AsqError with the failed query code and message', () => {
    const results = [batch({ a: { error: { code: 'QUERY_TIMEOUT', message: 'too slow' } } })];
    let caught: unknown;
    try {
      rowsOf(results, 'a');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AsqError);
    expect(caught).toMatchObject({ code: 'QUERY_TIMEOUT', message: 'too slow' });
  });

  it('a missing query is an internal error, not an empty list', () => {
    expect(() => rowsOf([batch({})], 'x')).toThrow(AsqError);
  });
});

describe('num', () => {
  it.each([
    [5, 5],
    ['12', 12],
    ['3.5', 3.5],
    [null, 0],
    [undefined, 0],
    ['abc', 0],
    [NaN, 0],
  ])('num(%p) = %p', (v, expected) => {
    expect(num(v)).toBe(expected);
  });
});
