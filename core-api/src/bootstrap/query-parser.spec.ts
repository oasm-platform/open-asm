import { parseQuery } from './query-parser';

describe('parseQuery', () => {
  it('keeps a repeated key as an array', () => {
    expect(parseQuery('ids=a&ids=b')).toEqual({ ids: ['a', 'b'] });
  });

  it('keeps bracketed keys as a nested object', () => {
    expect(parseQuery('filter[status]=open&filter[tags][]=x')).toEqual({
      filter: { status: 'open', tags: ['x'] },
    });
  });

  it('drops keys that would shadow Object.prototype members', () => {
    const query = parseQuery('hasOwnProperty=1&toString=2&page=3');

    expect(query).toEqual({ page: '3' });
    expect(Object.prototype.hasOwnProperty.call(query, 'hasOwnProperty')).toBe(
      false,
    );
  });

  it('never writes through __proto__', () => {
    const query = parseQuery('__proto__[polluted]=yes&a[__proto__][b]=c');

    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(query).not.toHaveProperty('polluted');
  });
});
