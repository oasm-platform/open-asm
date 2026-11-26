import { AsqError } from '@/modules/attack-surface-query/domain/query-errors';
import type { QueryBatchResult } from '@/modules/attack-surface-query/domain/query.types';
import { at, firstError, num, rowsOf, str, strArray } from './batch-result';

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

describe('firstError', () => {
  it('throws the first error in execution order, not the one a mapper reads first', () => {
    const results = [
      batch({ q6: { rows: [], truncated: false } }),
      batch({
        q7: { error: { code: 'QUERY_TIMEOUT', message: 'slow' } },
        q8: { error: { code: 'INTERNAL', message: 'current transaction is aborted' } },
      }),
    ];
    expect(() => rowsOf(results, 'q8')).toThrow('aborted');
    expect(() => firstError(results)).toThrow(expect.objectContaining({ code: 'QUERY_TIMEOUT', message: 'slow' }));
  });

  it('does nothing when every query succeeded', () => {
    expect(() => firstError([batch({ a: { rows: [], truncated: false } })])).not.toThrow();
  });
});

describe('accessors', () => {
  it('reads nested paths safely', () => {
    expect(at({ a: { b: 1 } }, 'a', 'b')).toBe(1);
    expect(at({ a: null }, 'a', 'b')).toBeUndefined();
    expect(at(undefined, 'a')).toBeUndefined();
  });
  it('coerces scalars', () => {
    expect(str(3)).toBe('');
    expect(strArray(['a', 1])).toEqual(['a', '1']);
    expect(strArray(null)).toEqual([]);
  });
});
