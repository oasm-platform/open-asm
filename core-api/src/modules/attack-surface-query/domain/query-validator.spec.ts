import { CATALOG } from '../catalog/catalog';
import { AsqError } from './query-errors';
import { assertWithinBudget, estimateCost } from './query-cost';
import { limitsFor } from './query-limits';
import type { QueryScope } from './query.types';
import { parseBatch, validateBatch } from './query-validator';

const NOW = new Date('2026-11-18T07:00:00.000Z');
const ALL: QueryScope = { workspaceId: 'w1', permissions: ['*'], caller: 'http' };

const validate = (input: unknown, scope: QueryScope = ALL) =>
  validateBatch(CATALOG, parseBatch(input), scope, NOW);

function issuesOf(fn: () => unknown): Array<{ path: string; code: string; message: string }> {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AsqError);
    return (err as AsqError).details.issues ?? [];
  }
  throw new Error('expected an AsqError');
}

describe('parseBatch', () => {
  it('refuses unknown keys at every level, workspaceId included', () => {
    const issues = issuesOf(() =>
      parseBatch({ workspaceId: 'w2', queries: { a: { from: 'hosts', workspaceId: 'w2' } } }),
    );
    expect(issues.map((i) => i.message).join(' ')).toMatch(/workspaceId/);
  });

  it('refuses an empty batch and more than 10 queries', () => {
    expect(() => parseBatch({ queries: {} })).toThrow(AsqError);
    const many = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`q${i}`, { from: 'hosts' }]));
    expect(() => parseBatch({ queries: many })).toThrow(AsqError);
  });

  it('refuses paths that are not dotted identifiers', () => {
    const issues = issuesOf(() => parseBatch({ queries: { a: { from: 'hosts', select: ['value; DROP'] } } }));
    expect(issues[0].path).toBe('queries.a.select[0]');
  });
});

describe('validateBatch', () => {
  it('normalizes the "new ports and domains in 5 days" example', () => {
    const batch = validate({
      window: { since: 'now-5d' },
      queries: {
        newDomains: {
          from: 'hosts',
          select: ['value', 'firstSeen', 'target.value'],
          include: { ips: { select: ['ip'], limit: 5 } },
          where: { logic: 'and', items: [{ field: 'kind', op: 'eq', value: 'domain' }] },
          limit: 100,
        },
        portSummary: {
          from: 'services',
          groupBy: ['port'],
          aggregate: { hosts: { fn: 'countDistinct', field: 'host.id' } },
          orderBy: [{ field: 'hosts', dir: 'desc' }],
        },
      },
    });
    const [domains, ports] = batch.queries;
    expect(domains.mode).toBe('list');
    expect(domains.window?.since.toISOString()).toBe('2026-11-13T07:00:00.000Z');
    expect(domains.window?.path.path).toBe('firstSeen');
    expect(domains.select.map((s) => s.path)).toEqual(['value', 'firstSeen', 'target.value']);
    expect(domains.include[0].limit).toBe(5);
    expect(ports.mode).toBe('aggregate');
    expect(ports.orderBy).toEqual([{ key: 'hosts', dir: 'desc', alias: 'hosts' }]);
    expect([...batch.resources].sort()).toEqual(['hosts', 'ips', 'services', 'targets']);
  });

  it('collects every issue with a path and a hint', () => {
    const issues = issuesOf(() =>
      validate({
        queries: {
          a: {
            from: 'services',
            select: ['prot', 'host.vale'],
            where: { logic: 'and', items: [{ field: 'port', op: 'contains', value: '80' }] },
          },
          b: { from: 'nowhere' },
        },
      }),
    );
    const byPath = Object.fromEntries(issues.map((i) => [i.path, i]));
    expect(byPath['queries.a.select[0]'].message).toMatch(/Did you mean "port"/);
    expect(byPath['queries.a.select[1]'].message).toMatch(/Did you mean "value"/);
    expect(byPath['queries.a.where.items[0].op'].code).toBe('OP_NOT_ALLOWED');
    expect(byPath['queries.a.where.items[0].op'].message).toMatch(/ops: eq, neq/);
    expect(byPath['queries.b.from'].code).toBe('UNKNOWN_RESOURCE');
  });

  it.each([
    ['port', 'eq', '70000'],
    ['firstSeen', 'gte', 'last week'],
    ['host.isPrimary', 'eq', 'yes'],
  ])('refuses a bad %s value', (field, op, value) => {
    const issues = issuesOf(() =>
      validate({ queries: { a: { from: 'services', where: { logic: 'and', items: [{ field, op, value }] } } } }),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it('resolves relative times in filter values to ISO strings', () => {
    const batch = validate({
      queries: {
        a: { from: 'tls', where: { logic: 'and', items: [{ field: 'notAfter', op: 'lt', value: 'now+30d' }] } },
      },
    });
    const where = batch.queries[0].where;
    const cond = where?.kind === 'group' ? where.items[0] : undefined;
    expect(cond).toMatchObject({ kind: 'cond', op: 'lt', values: ['2026-12-18T07:00:00.000Z'] });
  });

  it('refuses list relations outside where and include', () => {
    const issues = issuesOf(() => validate({ queries: { a: { from: 'services', select: ['technologies.name'] } } }));
    expect(issues[0].message).toMatch(/include\.technologies/);
  });

  it('accepts a list relation in where (EXISTS)', () => {
    const batch = validate({
      queries: {
        a: { from: 'services', where: { logic: 'and', items: [{ field: 'technologies.name', op: 'eq', value: 'nginx' }] } },
      },
    });
    const where = batch.queries[0].where;
    const cond = where?.kind === 'group' ? where.items[0] : undefined;
    expect(cond?.kind === 'cond' && cond.path.hops[0].kind).toBe('many');
  });

  it('refuses mixing aggregate with select, include, cursor or withTotal', () => {
    const issues = issuesOf(() =>
      validate({ queries: { a: { from: 'services', select: ['port'], withTotal: true, aggregate: { n: { fn: 'count' } } } } }),
    );
    expect(issues.filter((i) => i.code === 'MODE_CONFLICT').map((i) => i.path).sort()).toEqual([
      'queries.a.select',
      'queries.a.withTotal',
    ]);
  });

  it('requires a bucket to group by a time', () => {
    const issues = issuesOf(() =>
      validate({ queries: { a: { from: 'hosts', groupBy: ['firstSeen'], aggregate: { n: { fn: 'count' } } } } }),
    );
    expect(issues[0].code).toBe('NOT_GROUPABLE');
    expect(() =>
      validate({ queries: { a: { from: 'hosts', groupBy: [{ field: 'firstSeen', bucket: 'day' }], aggregate: { n: { fn: 'count' } } } } }),
    ).not.toThrow();
  });

  it('refuses sorting on an unsortable field and include orders without an index', () => {
    const issues = issuesOf(() =>
      validate({
        queries: {
          a: {
            from: 'services',
            orderBy: [{ field: 'isErrorPage', dir: 'asc' }],
            include: { technologies: { orderBy: [{ field: 'name', dir: 'asc' }] } },
          },
        },
      }),
    );
    expect(issues.map((i) => i.code)).toEqual(['NOT_SORTABLE', 'NOT_SORTABLE']);
  });

  it('applies the agent limits: heavy fields, limit and query count', () => {
    const agent: QueryScope = { ...ALL, caller: 'agent' };
    const issues = issuesOf(() =>
      validate({ queries: { a: { from: 'services', select: ['http.body'], limit: 500 } } }, agent),
    );
    expect(issues.map((i) => i.code).sort()).toEqual(['HEAVY_FIELD_NOT_ALLOWED', 'LIMIT_EXCEEDED']);
  });

  it('refuses report mode outside HTTP', () => {
    const issues = issuesOf(() =>
      validate({ queries: { a: { from: 'hosts' } }, options: { mode: 'report' } }, { ...ALL, caller: 'mcp' }),
    );
    expect(issues[0].path).toBe('options.mode');
  });

  describe('permissions', () => {
    const assetsOnly: QueryScope = { ...ALL, permissions: ['asset.read'] };

    it('refuses a resource the member cannot read, wherever it appears', () => {
      for (const query of [
        { from: 'vulnerabilities' },
        { from: 'hosts', include: { vulnerabilities: {} } },
        { from: 'hosts', where: { logic: 'and', items: [{ field: 'vulnerabilities.severity', op: 'eq', value: 'critical' }] } },
        { from: 'services', select: ['target.value'] },
      ]) {
        expect(() => validate({ queries: { a: query } }, assetsOnly)).toThrow(
          expect.objectContaining({ code: 'PERMISSION_DENIED' }),
        );
      }
    });

    it('drops default fields the member cannot read instead of failing', () => {
      const batch = validate({ queries: { a: { from: 'hosts' } } }, assetsOnly);
      expect(batch.queries[0].select.map((s) => s.path)).toEqual(['value', 'kind', 'firstSeen']);
    });

    it('lets x.write stand for x.read', () => {
      expect(() =>
        validate({ queries: { a: { from: 'vulnerabilities' } } }, { ...ALL, permissions: ['asset.read', 'vulnerability.write'] }),
      ).not.toThrow();
    });
  });

  it('refuses workspace-wide resources in a project scope', () => {
    const issues = issuesOf(() => validate({ queries: { a: { from: 'rollups' } } }, { ...ALL, projectId: 'p1' }));
    expect(issues[0].code).toBe('UNKNOWN_RESOURCE');
  });

  it('binds the cursor signature to the query, not to its limit', () => {
    const a = validate({ queries: { a: { from: 'hosts', limit: 10 } } }).queries[0].signature;
    const b = validate({ queries: { a: { from: 'hosts', limit: 20 } } }).queries[0].signature;
    const c = validate({ queries: { a: { from: 'hosts', where: { logic: 'and', items: [{ field: 'isPrimary', op: 'eq', value: 'true' }] } } } })
      .queries[0].signature;
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('errors an agent can fix in one step', () => {
  it('lists the fields of the resource when a field is unknown', () => {
    const [issue] = issuesOf(() => validate({ queries: { t: { from: 'targets', select: ['lastSeen'] } } }));
    expect(issue.code).toBe('UNKNOWN_FIELD');
    expect(issue.message).toMatch(/fields of targets: id, value, type, firstSeen/);
  });

  it('lists the groupable fields when a group key is not one', () => {
    const [issue] = issuesOf(() =>
      validate({ queries: { h: { from: 'hosts', groupBy: ['isPrimary'], aggregate: { n: { fn: 'count' } } } } }),
    );
    expect(issue.code).toBe('NOT_GROUPABLE');
    expect(issue.message).toMatch(/groupable: value, kind, firstSeen \(with a bucket\), lastSeen \(with a bucket\)/);
  });

  it('lists the sortable fields when a sort key is not one', () => {
    const [issue] = issuesOf(() =>
      validate({ queries: { s: { from: 'services', orderBy: [{ field: 'isErrorPage', dir: 'asc' }] } } }),
    );
    expect(issue.code).toBe('NOT_SORTABLE');
    expect(issue.message).toMatch(/sortable: port, firstSeen, lastSeen/);
  });

  it('groups hosts by their target', () => {
    expect(() =>
      validate({ queries: { h: { from: 'hosts', groupBy: ['target.value'], aggregate: { n: { fn: 'count' } }, window: null } } }),
    ).not.toThrow();
  });
});

describe('agent cost budget', () => {
  const AGENT: QueryScope = { ...ALL, caller: 'agent' };
  const agentLimits = limitsFor('agent', 'interactive');
  const roots = Object.values(CATALOG).filter((r) => r.root);

  it.each(roots.map((r) => r.name))('lets the agent list a full page of %s, all time, with a total', (from) => {
    const [query] = validate({ queries: { q: { from, limit: 200, window: null, withTotal: true } } }, AGENT).queries;
    expect(() => assertWithinBudget(query, agentLimits)).not.toThrow();
  });

  it.each(roots.map((r) => r.name))('lets the agent count %s over all time', (from) => {
    const res = CATALOG[from];
    const plain = Object.entries(res.fields).find(([, f]) => f.groupable && f.type !== 'timestamp');
    // A resource without a plain group key (urls) is counted per day.
    const key = plain ? plain[0] : { field: res.defaultTimeField!, bucket: 'day' };
    const [query] = validate({ queries: { q: { from, groupBy: [key], aggregate: { n: { fn: 'count' } }, window: null } } }, AGENT).queries;
    expect(() => assertWithinBudget(query, agentLimits)).not.toThrow();
  });

  it('refuses an include that multiplies rows, and says so', () => {
    const [query] = validate(
      { queries: { h: { from: 'hosts', limit: 200, window: null, include: { services: { limit: 20 } } } } },
      AGENT,
    ).queries;
    expect(() => assertWithinBudget(query, agentLimits)).toThrow(
      expect.objectContaining({
        code: 'COST_EXCEEDED',
        details: expect.objectContaining({
          hints: expect.arrayContaining([expect.stringMatching(/include.*per row.*limit × include limit/)]),
        }),
      }),
    );
  });
});

describe('estimateCost', () => {
  it('penalizes unindexed contains and missing windows, with hints', () => {
    const [query] = validate({
      queries: { a: { from: 'services', limit: 1000, where: { logic: 'and', items: [{ field: 'value', op: 'contains', value: 'admin' }] } } },
    }).queries;
    const { cost, hints } = estimateCost(query);
    expect(cost).toBeGreaterThan(300);
    expect(hints.join(' ')).toMatch(/eq\/in instead of contains/);
    expect(hints.join(' ')).toMatch(/add a window/);
  });

  it('keeps the default agent query under the agent budget', () => {
    const [query] = validate({ window: { since: 'now-5d' }, queries: { a: { from: 'hosts' } } }).queries;
    expect(estimateCost(query).cost).toBeLessThan(300);
  });

  it('charges a relation count more than a relation test', () => {
    const cost = (rel: Record<string, unknown>) =>
      estimateCost(validate({ queries: { a: { from: 'hosts', where: { logic: 'and', items: [rel] } } } }).queries[0]).cost;
    expect(cost({ relation: 'services', count: { op: 'gte', value: '5' } })).toBeGreaterThan(cost({ relation: 'services' }));
  });
});

describe('aggregates', () => {
  const agg = (query: Record<string, unknown>, scope: QueryScope = ALL, options?: Record<string, unknown>) =>
    validate({ ...(options ? { options } : {}), queries: { a: { from: 'vulnerabilities', window: null, ...query } } }, scope).queries[0];

  it('accepts sum on a number and a filter per aggregate', () => {
    const q = agg({
      groupBy: ['severity'],
      aggregate: { n: { fn: 'sum', field: 'cvssScore' }, open: { fn: 'count', where: { logic: 'and', items: [{ field: 'isOpen', op: 'eq', value: 'true' }] } } },
    });
    expect(q.aggregate.map((a) => [a.fn, a.where?.kind])).toEqual([['sum', undefined], ['count', 'group']]);
  });

  it('refuses sum on text, and an aggregate filter on a resource the member cannot read', () => {
    expect(issuesOf(() => agg({ aggregate: { n: { fn: 'sum', field: 'name' } } }))[0].code).toBe('NOT_GROUPABLE');
    expect(() =>
      validate(
        { queries: { a: { from: 'hosts', aggregate: { n: { fn: 'count', where: { logic: 'and', items: [{ relation: 'vulnerabilities' }] } } } } } },
        { ...ALL, permissions: ['asset.read'] },
      ),
    ).toThrow(expect.objectContaining({ code: 'PERMISSION_DENIED' }));
  });

  it('resolves having against group keys and aggregate names', () => {
    const q = agg({
      groupBy: ['severity'],
      aggregate: { n: { fn: 'count' } },
      having: { logic: 'or', items: [{ field: 'n', op: 'gte', value: '10' }, { field: 'severity', op: 'in', value: ['critical', 'high'] }] },
    });
    expect(q.having).toMatchObject({
      kind: 'group',
      items: [
        { kind: 'cond', ref: { kind: 'aggregate', index: 0 }, type: 'int' },
        { kind: 'cond', ref: { kind: 'group', index: 0 }, op: 'in' },
      ],
    });
  });

  it.each([
    ['an unknown name', { field: 'x', op: 'eq', value: '1' }, 'UNKNOWN_FIELD'],
    ['an order test on text', { field: 'severity', op: 'gt', value: 'high' }, 'OP_NOT_ALLOWED'],
    ['a value outside the enum', { field: 'severity', op: 'eq', value: 'urgent' }, 'INVALID_VALUE'],
    ['a non-number count', { field: 'n', op: 'gt', value: 'many' }, 'INVALID_VALUE'],
  ])('refuses having on %s', (_label, cond, code) => {
    const issues = issuesOf(() => agg({ groupBy: ['severity'], aggregate: { n: { fn: 'count' } }, having: { logic: 'and', items: [cond] } }));
    expect(issues[0].code).toBe(code);
  });

  it('refuses having, fill and groupBy without aggregate', () => {
    const issues = issuesOf(() => validate({ queries: { a: { from: 'hosts', having: { logic: 'and', items: [] }, fill: true } } }));
    expect(issues.map((i) => i.path).sort()).toEqual(['queries.a.fill', 'queries.a.having']);
  });

  it('fills a time series over the window and sizes it', () => {
    const q = validate({
      queries: { a: { from: 'hosts', window: { since: 'now-24h' }, groupBy: [{ field: 'firstSeen', bucket: 'hour' }], aggregate: { n: { fn: 'count' } }, fill: true } },
    }).queries[0];
    expect(q.fill).toBe(true);
    expect(q.limit).toBe(26);
    expect(q.orderBy).toMatchObject([{ key: 'firstSeen', dir: 'asc' }]);
  });

  it.each([
    ['no window', { window: null, groupBy: [{ field: 'firstSeen', bucket: 'day' }] }, 'MODE_CONFLICT'],
    ['no time group', { window: { since: 'now-1d' }, groupBy: ['kind'] }, 'MODE_CONFLICT'],
    ['too many buckets', { window: { since: 'now-3650d' }, groupBy: [{ field: 'firstSeen', bucket: 'hour' }] }, 'LIMIT_EXCEEDED'],
  ])('refuses fill with %s', (_label, query, code) => {
    const issues = issuesOf(() => validate({ queries: { a: { from: 'hosts', aggregate: { n: { fn: 'count' } }, fill: true, ...query } } }));
    expect(issues[0].code).toBe(code);
  });

  it('takes an IANA time zone and refuses anything else', () => {
    expect(agg({ aggregate: { n: { fn: 'count' } } }, ALL, { timezone: 'Asia/Ho_Chi_Minh' }).timezone).toBe('Asia/Ho_Chi_Minh');
    expect(agg({ aggregate: { n: { fn: 'count' } } }).timezone).toBe('UTC');
    expect(issuesOf(() => agg({ aggregate: { n: { fn: 'count' } } }, ALL, { timezone: "UTC'; --" }))[0].path).toBe('options.timezone');
  });
});

describe('where', () => {
  const where = (from: string, items: unknown[], scope: QueryScope = ALL) =>
    validate({ queries: { a: { from, where: { logic: 'and', items } } } }, scope).queries[0].where;

  it('nests groups and negations', () => {
    const tree = where('services', [
      { logic: 'or', items: [{ field: 'port', op: 'eq', value: '22' }, { not: { logic: 'and', items: [{ field: 'port', op: 'gt', value: '1024' }] } }] },
    ]);
    expect(tree).toMatchObject({
      kind: 'group',
      items: [{ kind: 'group', logic: 'or', items: [{ kind: 'cond' }, { kind: 'not', item: { kind: 'group' } }] }],
    });
  });

  it('still reads the legacy {logic, conditions} group', () => {
    const tree = where('services', [{ logic: 'or', conditions: [{ field: 'port', op: 'eq', value: '22' }] }]);
    expect(tree).toMatchObject({ items: [{ kind: 'group', items: [{ kind: 'cond' }] }] });
  });

  it('caps the group depth and the not chain', () => {
    const port = { field: 'port', op: 'eq', value: '22' };
    const group = (item: unknown) => ({ logic: 'and', items: [item] });
    expect(() => where('services', [group(group(group(port)))])).not.toThrow();
    expect(issuesOf(() => where('services', [group(group(group(group(port))))]))[0].code).toBe('LIMIT_EXCEEDED');
    let nots: unknown = port;
    for (let i = 0; i < 9; i++) nots = { not: nots };
    expect(issuesOf(() => where('services', [nots]))[0].code).toBe('LIMIT_EXCEEDED');
  });

  it('caps the condition count per caller', () => {
    const items = Array.from({ length: 21 }, () => ({ field: 'port', op: 'eq', value: '22' }));
    expect(() => where('services', items)).not.toThrow();
    const issues = issuesOf(() => where('services', items, { ...ALL, caller: 'agent' }));
    expect(issues[0].code).toBe('LIMIT_EXCEEDED');
  });

  it.each([
    ['services', 'port', 'between', ['1', '1024']],
    ['services', 'lastSeen', 'isNull', undefined],
    ['services', 'lastSeen', 'between', ['now-7d', 'now']],
    ['hosts', 'value', 'startsWith', 'api.'],
    ['hosts', 'value', 'endsWith', '.example.com'],
    ['ips', 'ip', 'notInSubnet', ['10.0.0.0/8']],
    ['vulnerabilities', 'cve', 'containsAll', ['CVE-2024-1', 'CVE-2024-2']],
    ['vulnerabilities', 'cve', 'containsAny', ['CVE-2024-1']],
    ['hosts', 'isPrimary', 'neq', 'true'],
  ])('accepts %s.%s %s', (from, field, op, value) => {
    expect(() => where(from, [{ field, op, ...(value === undefined ? {} : { value }) }])).not.toThrow();
  });

  it.each([
    ['isNull on a field that is never NULL', 'services', { field: 'port', op: 'isNull' }],
    ['isNull with a value', 'services', { field: 'lastSeen', op: 'isNull', value: 'x' }],
    ['between with one value', 'services', { field: 'port', op: 'between', value: ['1'] }],
    ['between in the wrong order', 'services', { field: 'port', op: 'between', value: ['100', '1'] }],
    ['startsWith on a number', 'services', { field: 'port', op: 'startsWith', value: '8' }],
    ['notInSubnet with an IP', 'ips', { field: 'ip', op: 'notInSubnet', value: ['10.0.0.1'] }],
  ])('refuses %s', (_label, from, cond) => {
    expect(issuesOf(() => where(from, [cond])).length).toBeGreaterThan(0);
  });

  it('resolves a relation test against the child resource', () => {
    const tree = where('hosts', [
      { relation: 'services', quantifier: 'none', where: { logic: 'and', items: [{ field: 'port', op: 'eq', value: '22' }] } },
    ]);
    expect(tree).toMatchObject({
      items: [{ kind: 'rel', quantifier: 'none', relation: { path: 'services', child: { name: 'services' } }, where: { kind: 'group' } }],
    });
  });

  it('reads a relation through one-relations', () => {
    const tree = where('services', [{ relation: 'host.vulnerabilities', count: { op: 'gte', value: '3' } }]);
    expect(tree).toMatchObject({ items: [{ kind: 'rel', count: { op: 'gte', value: 3 }, relation: { chain: ['host'] } }] });
  });

  it.each([
    ['an unknown relation', { relation: 'ports' }, 'UNKNOWN_RELATION'],
    ['a one-relation', { relation: 'host' }, 'UNKNOWN_RELATION'],
    ['every without where', { relation: 'services', quantifier: 'every' }, 'INVALID_SHAPE'],
    ['quantifier and count together', { relation: 'services', quantifier: 'none', count: { op: 'gt', value: '1' } }, 'MODE_CONFLICT'],
    ['a negative count', { relation: 'services', count: { op: 'gt', value: '-1' } }, 'INVALID_VALUE'],
    [
      'a nested relation test',
      { relation: 'services', where: { logic: 'and', items: [{ relation: 'urls' }] } },
      'UNKNOWN_RELATION',
    ],
    [
      'a list path inside a relation test',
      { relation: 'services', where: { logic: 'and', items: [{ field: 'urls.url', op: 'eq', value: 'x' }] } },
      'UNKNOWN_RELATION',
    ],
  ])('refuses %s', (_label, rel, code) => {
    const issues = issuesOf(() => where('hosts', [rel]));
    expect(issues[0].code).toBe(code);
  });

  it('requires the permission of the resource a relation test reads', () => {
    expect(() =>
      where('hosts', [{ relation: 'vulnerabilities', quantifier: 'none' }], { ...ALL, permissions: ['asset.read'] }),
    ).toThrow(expect.objectContaining({ code: 'PERMISSION_DENIED' }));
  });
});
