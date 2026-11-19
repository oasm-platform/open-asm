import { flattenRow, QUERY_REPORT_MAX_ROWS, toReportTables } from './query-report';

describe('query report tables', () => {
  it('flattens nested rows into dotted columns and leaves ids out', () => {
    const tables = toReportTables({
      data: {
        ports: {
          rows: [
            { id: 's1', port: 443, host: { id: 'h1', value: 'a.example.com' }, technologies: [{ id: 't', name: 'nginx' }, { id: 'u', name: 'php' }] },
            { id: 's2', port: 80, host: null, technologies: [] },
          ],
          nextCursor: null,
          truncated: false,
        },
      },
      meta: { now: '', tookMs: 0, queries: {} },
    });
    expect(tables).toEqual([
      {
        name: 'ports',
        // host is null on the second row: no separate "host" column.
        columns: ['port', 'host.value', 'technologies'],
        rows: [
          ['443', 'a.example.com', 'nginx, php'],
          ['80', '', ''],
        ],
        truncated: false,
      },
    ]);
  });

  it('marks truncated tables and keeps query errors', () => {
    const rows = Array.from({ length: QUERY_REPORT_MAX_ROWS + 1 }, (_, i) => ({ id: String(i), n: i }));
    const [big, failed] = toReportTables({
      data: {
        big: { rows, nextCursor: null, truncated: false },
        failed: { error: { code: 'QUERY_TIMEOUT', message: 'Query exceeded 5000 ms' } },
      },
      meta: { now: '', tookMs: 0, queries: {} },
    });
    expect(big.rows).toHaveLength(QUERY_REPORT_MAX_ROWS);
    expect(big.truncated).toBe(true);
    expect(failed).toEqual({ name: 'failed', columns: [], rows: [], truncated: false, error: 'Query exceeded 5000 ms' });
  });

  it('flattens only plain objects', () => {
    expect(flattenRow({ a: { b: { c: 1 } }, l: [1, 2] })).toEqual({ 'a.b.c': 1, l: [1, 2] });
  });
});
