import { queryQueries } from './queries';

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
});
