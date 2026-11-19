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
    expect(byPath['queries.a.where'].code).toBe('OP_NOT_ALLOWED');
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
    expect(batch.queries[0].where?.items[0]).toEqual({ field: 'notAfter', op: 'lt', value: '2026-12-18T07:00:00.000Z' });
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
    expect(batch.queries[0].wherePaths.get('technologies.name')?.hops[0].kind).toBe('many');
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
});
