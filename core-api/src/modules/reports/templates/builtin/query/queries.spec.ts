import { queryQueries } from './queries';
import { QUERY_REPORT_MAX_ROWS, toReportTables } from './to-data';

describe('queryQueries', () => {
  it('forces a consistent interactive run over the spec options and fills params with defaults', () => {
    const spec = {
      params: { min: { type: 'number', default: 3 } },
      options: { mode: 'report', timeoutMs: 1000 },
      queries: { a: { from: 'assets', limit: { $param: 'min' } } },
    };
    const [batch] = queryQueries({ spec, title: 'T' }) as Array<Record<string, any>>;
    expect(batch.options).toEqual({ mode: 'interactive', consistent: true, timeoutMs: 1000 });
    expect(batch.params).toBeUndefined();
    expect(batch.queries.a.limit).toBe(3);
  });

  it('works for a spec without options', () => {
    const [batch] = queryQueries({ spec: { queries: {} }, title: 'T' }) as Array<Record<string, any>>;
    expect(batch.options).toEqual({ consistent: true, mode: 'interactive' });
  });

  it('clamps a larger explicit limit to one row past what the PDF shows, so truncation is still detected', () => {
    const spec = { queries: { big: { from: 'assets', limit: 10_000 }, small: { from: 'assets', limit: 20 }, none: { from: 'assets' } } };
    const [batch] = queryQueries({ spec, title: 'T' }) as Array<Record<string, any>>;
    expect(batch.queries.big.limit).toBe(QUERY_REPORT_MAX_ROWS + 1);
    expect(batch.queries.small.limit).toBe(20);
    expect(batch.queries.none.limit).toBeUndefined();
  });

  it('a clamped query that returns limit rows is marked truncated', () => {
    const rows = Array.from({ length: QUERY_REPORT_MAX_ROWS + 1 }, (_, i) => ({ n: i }));
    const [table] = toReportTables({ data: { big: { rows, truncated: false } } } as never);
    expect(table.rows).toHaveLength(QUERY_REPORT_MAX_ROWS);
    expect(table.truncated).toBe(true);
  });
});
