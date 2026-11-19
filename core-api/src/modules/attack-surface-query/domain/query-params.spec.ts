import { CATALOG } from '../catalog/catalog';
import { AsqError } from './query-errors';
import { applyParams } from './query-params';
import { parseBatch, validateBatch } from './query-validator';

const SPEC = {
  params: {
    target: { type: 'string', default: 'example.com' },
    ports: { type: 'list', default: ['80', '443'] },
    size: { type: 'number', default: 20 },
    since: { type: 'string', default: 'now-7d' },
  },
  window: { since: { $param: 'since' } },
  queries: {
    open: {
      from: 'services',
      where: {
        logic: 'and',
        items: [
          { field: 'target.value', op: 'eq', value: { $param: 'target' } },
          { field: 'port', op: 'in', value: { $param: 'ports' } },
        ],
      },
      limit: { $param: 'size' },
    },
  },
};

function issuesOf(fn: () => unknown) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AsqError);
    return (err as AsqError).details.issues ?? [];
  }
  throw new Error('expected an AsqError');
}

describe('applyParams', () => {
  it('substitutes the defaults and drops the declarations', () => {
    const batch = applyParams(SPEC);
    expect(batch).not.toHaveProperty('params');
    expect(batch).toMatchObject({
      window: { since: 'now-7d' },
      queries: { open: { where: { items: [{ value: 'example.com' }, { value: ['80', '443'] }] }, limit: 20 } },
    });
    // The result is a plain batch: it validates like a literal one.
    expect(() =>
      validateBatch(CATALOG, parseBatch(batch), { workspaceId: 'w1', permissions: ['*'], caller: 'http' }, new Date()),
    ).not.toThrow();
  });

  it('takes the caller values over the defaults', () => {
    const batch = applyParams(SPEC, { target: 'acme.io', ports: ['22'], size: 5 });
    expect(batch).toMatchObject({ queries: { open: { where: { items: [{ value: 'acme.io' }, { value: ['22'] }] }, limit: 5 } } });
  });

  it('writes a number param as a string in a filter value', () => {
    const batch = applyParams({
      params: { port: { type: 'number', default: 22 } },
      queries: { a: { from: 'services', where: { logic: 'and', items: [{ field: 'port', op: 'eq', value: { $param: 'port' } }] } } },
    });
    expect(batch).toMatchObject({ queries: { a: { where: { items: [{ value: '22' }] } } } });
  });

  it('leaves a spec without params unchanged', () => {
    const spec = { queries: { a: { from: 'hosts' } } };
    expect(applyParams(spec)).toEqual(spec);
  });

  it.each([
    ['an undeclared supplied param', SPEC, { nope: 'x' }, 'params.nope'],
    ['a value of the wrong type', SPEC, { size: '5' }, 'params.size'],
    ['an oversized list', SPEC, { ports: Array.from({ length: 101 }, () => '1') }, 'params.ports'],
    [
      'a marker in a field name',
      { params: { f: { type: 'string', default: 'port' } }, queries: { a: { from: 'services', where: { logic: 'and', items: [{ field: { $param: 'f' }, op: 'eq', value: '1' }] } } } },
      {},
      'queries.a.where.items[0].field',
    ],
    [
      'a marker in "from"',
      { params: { r: { type: 'string', default: 'hosts' } }, queries: { a: { from: { $param: 'r' } } } },
      {},
      'queries.a.from',
    ],
    ['an unknown marker', { queries: { a: { from: 'hosts', limit: { $param: 'x' } } } }, {}, 'queries.a.limit'],
    ['a param without a default', { params: { x: { type: 'string' } }, queries: { a: { from: 'hosts' } } }, {}, 'params.x.default'],
    ['an unused param', { params: { x: { type: 'string', default: 'a' } }, queries: { a: { from: 'hosts' } } }, {}, 'params.x'],
  ])('refuses %s', (_label, spec, supplied, path) => {
    const issues = issuesOf(() => applyParams(spec, supplied));
    expect(issues.map((i) => i.path)).toContain(path);
  });
});
