import { CATALOG, fieldOps, OP_VALUE_SHAPE } from '../catalog/catalog';
import type { FieldDef } from '../catalog/catalog.types';
import type { QueryScope } from '../domain/query.types';
import { parseBatch, validateBatch } from '../domain/query-validator';
import { planQuery, type QueryPlan } from './planner';

const NOW = new Date('2026-11-18T07:00:00.000Z');
const WS = '11111111-1111-4111-8111-111111111111';
const SCOPE: QueryScope = { workspaceId: WS, permissions: ['*'], caller: 'http' };

function plan(query: Record<string, unknown>, scope: Partial<QueryScope> = {}, window?: unknown): QueryPlan {
  const batch = validateBatch(
    CATALOG,
    parseBatch({ ...(window ? { window } : {}), queries: { q: query } }),
    { ...SCOPE, ...scope },
    NOW,
  );
  return planQuery(CATALOG, batch.queries[0], { workspaceId: WS, projectId: scope.projectId }, undefined, 0);
}

/** The WHERE clause of the outermost statement. */
const whereOf = (sql: string) => sql.slice(sql.lastIndexOf('\nWHERE ') + 7).split(/\n(ORDER BY|GROUP BY|LIMIT) /)[0];

/** The first term of a WHERE clause must be the workspace predicate on the root. */
function expectScopedFirst(sql: string, alias = '"r"') {
  const where = whereOf(sql);
  expect(where.startsWith(`${alias}."workspaceId" = :asq_q0_p0`)).toBe(true);
  // Every other top-level term is ANDed and parenthesized: count the
  // top-level OR operators: there must be none.
  let depth = 0;
  for (let i = 0; i < where.length; i++) {
    const ch = where[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (depth === 0 && where.startsWith(' OR ', i)) throw new Error(`top-level OR in: ${where}`);
  }
}

describe('planQuery', () => {
  it('scopes the root on its own workspace column, first, with no value inlined', () => {
    const p = plan(
      {
        from: 'services',
        select: ['port', 'host.value', 'http.title'],
        where: {
          logic: 'or',
          items: [
            { field: 'port', op: 'in', value: ['80', '443'] },
            { field: 'host.value', op: 'contains', value: "x' OR 1=1 --" },
          ],
        },
      },
      {},
      { since: 'now-5d' },
    );
    expectScopedFirst(p.root.sql);
    expect(p.root.params.asq_q0_p0).toBe(WS);
    expect(p.root.sql).not.toContain('1=1');
    expect(p.root.sql).not.toContain(WS);
    expect(Object.values(p.root.params)).toContain("%x' OR 1=1 --%");
    expect(p.root.sql).toMatch(/INNER JOIN "assets" "r__host" ON \("r__host"\.id = "r"\."assetId"\) AND "r__host"\."workspaceId" = "r"\."workspaceId"/);
    expect(p.root.sql).toMatch(/LEFT JOIN "http_responses" "r__http"/);
    expect(p.root.sql).toMatch(/"r"\."createdAt"\) >= CAST\(:asq_q0_p1 AS timestamptz\)/);
  });

  it('never reads the response body unless asked', () => {
    expect(plan({ from: 'services', select: ['http.title'] }).root.sql).not.toMatch(/\.body/);
    expect(plan({ from: 'services', select: ['http.body'] }).root.sql).toMatch(/"r__http"\.body/);
  });

  it('joins only what the query uses', () => {
    const p = plan({ from: 'services', select: ['port'] });
    expect(p.root.sql).not.toMatch(/JOIN/);
  });

  it('compiles a list relation in where to a scoped EXISTS, negations to NOT EXISTS', () => {
    const p = plan({
      from: 'hosts',
      select: ['value'],
      where: {
        logic: 'and',
        items: [
          { field: 'vulnerabilities.severity', op: 'eq', value: 'critical' },
          { field: 'services.port', op: 'neq', value: '22' },
        ],
      },
    });
    expect(p.root.sql).toMatch(/EXISTS \(SELECT 1 FROM "vulnerabilities" "r_x0" WHERE "r_x0"\."assetId" = "r"\.id AND "r_x0"\."workspaceId" = :asq_q0_p0 AND \("r_x0"\."reviewStatus" = 'approved'\)/);
    expect(p.root.sql).toMatch(/NOT \(EXISTS \(SELECT 1 FROM "asset_services" "r_x1"/);
    expectScopedFirst(p.root.sql);
  });

  it('compiles nested groups and negations with their own parentheses', () => {
    const p = plan({
      from: 'services',
      select: ['port'],
      where: {
        logic: 'or',
        items: [
          { field: 'port', op: 'eq', value: '22' },
          { not: { logic: 'and', items: [{ field: 'port', op: 'gte', value: '1024' }, { field: 'lastSeen', op: 'isNull' }] } },
        ],
      },
    });
    expect(p.root.sql).toContain(
      '((("r".port) = ANY(CAST(:asq_q0_w0 AS int8[]))) OR NOT (((("r".port) >= CAST(:asq_q0_w1 AS int8)) AND (("r"."lastSeenAt") IS NULL))))',
    );
    expectScopedFirst(p.root.sql);
  });

  it('compiles the new operators to parameterized tests', () => {
    const sql = (from: string, cond: Record<string, unknown>) => {
      const p = plan({ from, where: { logic: 'and', items: [cond] } });
      return { sql: whereOf(p.root.sql), params: Object.values(p.root.params) };
    };
    expect(sql('services', { field: 'port', op: 'between', value: ['1', '1024'] }).sql).toContain(
      '("r".port) >= CAST(:asq_q0_w0 AS int8) AND ("r".port) <= CAST(:asq_q0_w1 AS int8)',
    );
    const starts = sql('hosts', { field: 'value', op: 'startsWith', value: 'a_b%' });
    expect(starts.sql).toContain('("r".value) ILIKE :asq_q0_w0');
    expect(starts.params).toContain('a\\_b\\%%');
    expect(sql('hosts', { field: 'value', op: 'endsWith', value: '.io' }).params).toContain('%.io');
    expect(sql('ips', { field: 'ip', op: 'notInSubnet', value: ['10.0.0.0/8'] }).sql).toMatch(/NOT \(.*<<= ANY\(CAST\(:asq_q0_w0 AS inet\[\]\)\)/);
    expect(sql('vulnerabilities', { field: 'cve', op: 'containsAll', value: ['CVE-1'] }).sql).toMatch(/@> CAST\(:asq_q0_w0 AS text\[\]\)/);
    expect(sql('services', { field: 'lastSeen', op: 'isNotNull' }).sql).toContain('(("r"."lastSeenAt") IS NOT NULL)');
  });

  it('compiles relation tests to scoped (NOT) EXISTS and COUNT subqueries', () => {
    const rel = (test: Record<string, unknown>) =>
      whereOf(plan({ from: 'hosts', select: ['value'], where: { logic: 'and', items: [{ relation: 'services', ...test }] } }).root.sql);
    const port22 = { logic: 'and', items: [{ field: 'port', op: 'eq', value: '22' }] };
    const scoped = '"r_x0"."assetId" = "r".id AND "r_x0"."workspaceId" = :asq_q0_p0';
    expect(rel({ where: port22 })).toContain(`(EXISTS (SELECT 1 FROM "asset_services" "r_x0" WHERE ${scoped} AND ((("r_x0".port)`);
    expect(rel({ quantifier: 'none', where: port22 })).toContain(`(NOT EXISTS (SELECT 1 FROM "asset_services" "r_x0" WHERE ${scoped} AND (`);
    expect(rel({ quantifier: 'every', where: port22 })).toContain(`(NOT EXISTS (SELECT 1 FROM "asset_services" "r_x0" WHERE ${scoped} AND NOT ((`);
    expect(rel({ count: { op: 'gte', value: '5' } })).toContain(
      `((SELECT COUNT(*) FROM "asset_services" "r_x0" WHERE ${scoped}) >= CAST(:asq_q0_w0 AS int8))`,
    );
  });

  it('joins the parent chain of a relation test and keeps the child base predicate', () => {
    const p = plan({ from: 'services', select: ['port'], where: { logic: 'and', items: [{ relation: 'host.vulnerabilities', quantifier: 'some' }] } });
    expect(p.root.sql).toMatch(/INNER JOIN "assets" "r__host"/);
    expect(p.root.sql).toMatch(/"r_x0"\."assetId" = "r__host"\.id AND "r_x0"\."workspaceId" = :asq_q0_p0 AND \("r_x0"\."reviewStatus" = 'approved'\)/);
  });

  it('adds the project scope and the base predicate as their own terms', () => {
    const p = plan({ from: 'vulnerabilities', select: ['name'] }, { projectId: '22222222-2222-4222-8222-222222222222' });
    const where = whereOf(p.root.sql);
    expect(where).toMatch(/AND \(EXISTS \(SELECT 1 FROM "project_assets" asq_pa WHERE asq_pa\."assetId" = "r"\."assetId" AND asq_pa\."projectId" = :asq_q0_p1\)\)/);
    expect(where).toMatch(/AND \("r"\."reviewStatus" = 'approved'\)/);
  });

  it('adds the latest-runs CTE only when isNew is used', () => {
    expect(plan({ from: 'services', select: ['port'] }).root.sql).not.toMatch(/WITH asq_latest/);
    const p = plan({ from: 'services', select: ['port'], where: { logic: 'and', items: [{ field: 'isNew', op: 'eq', value: 'true' }] } });
    expect(p.root.sql).toMatch(/^WITH asq_latest AS MATERIALIZED \(/);
    expect(p.root.sql).toMatch(/t\."workspaceId" = :asq_q0_p0/);
  });

  it('orders by the sort keys then id, fetches limit + 1 and exposes the sort columns', () => {
    const p = plan({ from: 'services', select: ['port'], orderBy: [{ field: 'port', dir: 'asc' }], limit: 20 });
    expect(p.root.sql).toMatch(/ORDER BY \("r"\.port\) ASC NULLS LAST, "r"\.id ASC\nLIMIT :asq_q0_p\d+$/);
    expect(Object.values(p.root.params)).toContain(21);
    expect(p.sortColumns.map((c) => c.cast)).toEqual(['int8', 'uuid']);
    expect(p.boundedSort).toBe(false);
  });

  it('exposes time sort keys with microseconds, so rows sharing a millisecond are not skipped', () => {
    const p = plan({ from: 'services', select: ['port'] });
    expect(p.sortColumns.map((c) => c.cast)).toEqual(['timestamptz', 'uuid']);
    expect(p.root.sql).toContain(
      `to_char((("r"."createdAt"))::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "s0"`,
    );
  });

  it('marks sorts through a relation or on a bounded field', () => {
    expect(plan({ from: 'services', orderBy: [{ field: 'http.title', dir: 'asc' }] }).boundedSort).toBe(true);
  });

  it('applies the keyset predicate after the scope when a cursor is given', () => {
    const batch = validateBatch(CATALOG, parseBatch({ queries: { q: { from: 'services', select: ['port'] } } }), SCOPE, NOW);
    const p = planQuery(CATALOG, batch.queries[0], { workspaceId: WS }, ['2026-11-17T00:00:00.000Z', 'a0a0a0a0-0000-4000-8000-000000000000'], 0);
    const where = whereOf(p.root.sql);
    expect(where).toMatch(/\(\("r"\."createdAt"\) < CAST\(:asq_q0_p\d+ AS timestamptz\) OR \(\("r"\."createdAt"\) = CAST\(:asq_q0_p\d+ AS timestamptz\) AND "r"\.id < CAST\(:asq_q0_p\d+ AS uuid\)\)\)/);
    expectScopedFirst(p.root.sql);
  });

  it('counts with a cap and without the keyset', () => {
    const p = plan({ from: 'hosts', select: ['value'], withTotal: true });
    expect(p.total?.sql).toMatch(/SELECT COUNT\(\*\)::int8 AS n FROM \(\n {2}SELECT 1 FROM "assets" "r"/);
    expect(p.total?.sql).toMatch(/LIMIT 10001/);
  });

  it('compiles aggregates with buckets, casts and stable order', () => {
    const p = plan({
      from: 'hosts',
      groupBy: [{ field: 'firstSeen', bucket: 'day' }, 'kind'],
      aggregate: { n: { fn: 'count' }, last: { fn: 'max', field: 'firstSeen' } },
      orderBy: [{ field: 'n', dir: 'desc' }],
    });
    expect(p.root.sql).toMatch(/date_trunc\('day', \("r"\."createdAt"\)::timestamptz, 'UTC'\) AS "g0"/);
    expect(p.root.sql).toMatch(/COUNT\(\*\)::int8 AS "a0"/);
    expect(p.root.sql).toMatch(/MAX\(\("r"\."createdAt"\)::timestamptz\) AS "a1"/);
    expect(p.root.sql).toMatch(/ORDER BY "a0" DESC NULLS LAST, "g0" ASC NULLS LAST, "g1" ASC NULLS LAST/);
    expectScopedFirst(p.root.sql);
  });

  it('compiles conditional aggregates, sum and having', () => {
    const p = plan({
      from: 'vulnerabilities',
      groupBy: ['host.value'],
      aggregate: {
        total: { fn: 'count' },
        critical: { fn: 'count', where: { logic: 'and', items: [{ field: 'severity', op: 'eq', value: 'critical' }] } },
        score: { fn: 'sum', field: 'cvssScore' },
      },
      having: { logic: 'and', items: [{ field: 'critical', op: 'gt', value: '0' }, { not: { field: 'host.value', op: 'eq', value: 'a.io' } }] },
      orderBy: [{ field: 'critical', dir: 'desc' }],
    });
    expect(p.root.sql).toContain('COUNT(*)::int8 AS "a0"');
    expect(p.root.sql).toContain('(COUNT(*) FILTER (WHERE ((("r".severity) = ANY(CAST(:asq_q0_a1w0 AS text[]))))))::int8 AS "a1"');
    expect(p.root.sql).toContain('SUM(("r"."cvssScore"))::float8 AS "a2"');
    expect(p.root.sql).toMatch(/\nHAVING \(\(COALESCE\(\(COUNT\(\*\) FILTER \(WHERE .*\)\)::int8 > CAST\(:asq_q0_p\d+ AS int8\), false\)\) AND NOT \(\(COALESCE\(\("r__host"\)?.*= ANY\(CAST\(:asq_q0_p\d+ AS text\[\]\)\), false\)\)\)\)\nORDER BY "a1" DESC NULLS LAST/);
    expect(p.shape.columns.map((c) => c.type)).toEqual(['text', 'int', 'int', 'float']);
    expectScopedFirst(p.root.sql);
  });

  it('fills every bucket of the window, in the requested time zone', () => {
    const p = plan(
      { from: 'hosts', groupBy: [{ field: 'firstSeen', bucket: 'day' }], aggregate: { n: { fn: 'count' }, last: { fn: 'max', field: 'firstSeen' } }, fill: true },
      {},
      { since: 'now-7d' },
    );
    expect(p.root.sql).toMatch(/^SELECT asq_s\.g AS "g0", COALESCE\(asq_f\."a0", 0\) AS "a0", asq_f\."a1" AS "a1"\nFROM generate_series\(date_trunc\('day', CAST\(:asq_q0_p\d+ AS timestamptz\), 'UTC'\), CAST\(:asq_q0_p\d+ AS timestamptz\), interval '1 day', 'UTC'\) AS asq_s\(g\)\nLEFT JOIN \(/);
    expect(p.root.sql).toMatch(/\) asq_f ON asq_f\."g0" = asq_s\.g\nORDER BY "g0" ASC NULLS LAST\nLIMIT/);
    expect(p.limit).toBe(9);
    expectScopedFirst(p.root.sql);

    const batch = validateBatch(
      CATALOG,
      parseBatch({ window: { since: 'now-7d' }, options: { timezone: 'Asia/Ho_Chi_Minh' }, queries: { q: { from: 'hosts', groupBy: [{ field: 'firstSeen', bucket: 'day' }], aggregate: { n: { fn: 'count' } }, fill: true } } }),
      SCOPE,
      NOW,
    );
    const zoned = planQuery(CATALOG, batch.queries[0], { workspaceId: WS }, undefined, 0);
    expect(zoned.root.sql).toMatch(/date_trunc\('day', \("r"\."createdAt"\)::timestamptz, CAST\(:asq_q0_p\d+ AS text\)\)/);
    expect(zoned.root.sql).toMatch(/interval '1 day', CAST\(:asq_q0_p\d+ AS text\)\) AS asq_s\(g\)/);
    expect(Object.values(zoned.root.params)).toContain('Asia/Ho_Chi_Minh');
    expect(zoned.root.sql).not.toContain('Asia/');
  });

  it('builds includes as scoped LATERAL fetches by parent key, without ROW_NUMBER', () => {
    const p = plan({ from: 'services', select: ['port'], include: { urls: { select: ['url'], limit: 3 }, technologies: {} } });
    expect(p.root.sql).toMatch(/\("r"\."latestHttpResponseId"\) AS "k1"|"r"\."latestHttpResponseId" AS "k1"/);
    const urls = p.includes[0].build(['a0a0a0a0-0000-4000-8000-000000000000']);
    expect(urls.sql).toMatch(/FROM unnest\(CAST\(:asq_q0_i0b_p0 AS uuid\[\]\)\) WITH ORDINALITY AS asq_p\(k, ord\)/);
    expect(urls.sql).toMatch(/CROSS JOIN LATERAL/);
    expect(urls.sql).toMatch(/"i0"\."assetServiceId" = asq_p\.k\n {4}AND "i0"\."workspaceId" = :asq_q0_p0/);
    expect(urls.sql).toMatch(/ORDER BY \("i0"\."createdAt"\) DESC NULLS LAST, "i0"\.id ASC/);
    expect(urls.sql).not.toMatch(/ROW_NUMBER/);
    expect(urls.params.asq_q0_p0).toBe(WS);
    const tech = p.includes[1].build(['b0b0b0b0-0000-4000-8000-000000000000']);
    expect(tech.sql).toMatch(/"i1"\."httpResponseId" = asq_p\.k/);
  });
});

describe('planQuery property: every statement is workspace-scoped', () => {
  const sample = (field: FieldDef): string => {
    if (field.enumValues) return field.enumValues[0];
    switch (field.type) {
      case 'int':
        return '443';
      case 'float':
        return '7.5';
      case 'bool':
        return 'true';
      case 'uuid':
        return '33333333-3333-4333-8333-333333333333';
      case 'ip':
        return '10.0.0.1';
      case 'timestamp':
        return 'now-1d';
      default:
        return 'x';
    }
  };

  const roots = Object.values(CATALOG).filter((r) => r.root);
  const cases: Array<[string, Record<string, unknown>]> = [];
  for (const res of roots) {
    for (const [name, field] of Object.entries(res.fields)) {
      for (const op of fieldOps(field)) {
        const shape = OP_VALUE_SHAPE[op];
        const one = op === 'inSubnet' || op === 'notInSubnet' ? '10.0.0.0/8' : sample(field);
        const value = shape === 'none' ? undefined : shape === 'list' ? [one] : shape === 'pair' ? [one, one] : one;
        cases.push([
          `${res.name}.${name} ${op}`,
          {
            from: res.name,
            where: {
              logic: 'or',
              items: [
                { not: { field: name, op, ...(value === undefined ? {} : { value }) } },
                { logic: 'or', conditions: [{ field: 'id', op: 'eq', value: '44444444-4444-4444-8444-444444444444' }] },
              ],
            },
            ...(Object.keys(res.many).length ? { include: { [Object.keys(res.many)[0]]: {} } } : {}),
          },
        ]);
      }
    }
    for (const [relation, def] of Object.entries(res.many)) {
      const child = CATALOG[def.resource];
      const [fieldName, field] = Object.entries(child.fields).find(([, f]) => fieldOps(f).includes('eq'))!;
      cases.push([
        `${res.name} where ${relation}.${fieldName}`,
        { from: res.name, where: { logic: 'or', items: [{ field: `${relation}.${fieldName}`, op: 'eq', value: sample(field) }] } },
      ]);
      const childWhere = { logic: 'or', items: [{ field: fieldName, op: 'eq', value: sample(field) }] };
      for (const test of [
        { quantifier: 'some', where: childWhere },
        { quantifier: 'none', where: childWhere },
        { quantifier: 'every', where: childWhere },
        { count: { op: 'gte', value: '2' }, where: childWhere },
      ]) {
        cases.push([
          `${res.name} ${JSON.stringify(test.quantifier ?? 'count')} ${relation}`,
          { from: res.name, where: { logic: 'or', items: [{ relation, ...test }, { field: 'id', op: 'eq', value: '44444444-4444-4444-8444-444444444444' }] } },
        ]);
      }
    }
  }

  it.each(cases)('%s', (_label, query) => {
    const p = plan(query, { projectId: CATALOG[query.from as string].projectScope ? '55555555-5555-4555-8555-555555555555' : undefined });
    expectScopedFirst(p.root.sql);
    // Every sub-select re-applies the workspace scope on its own row.
    for (const [, alias] of p.root.sql.matchAll(/FROM "[a-z_]+" "(r_x\d+)"/g)) {
      expect(p.root.sql).toContain(`"${alias}"."workspaceId" = :asq_q0_p0`);
    }
    for (const value of Object.values(p.root.params)) {
      if (typeof value === 'string' && value.length > 3) expect(p.root.sql).not.toContain(value);
    }
    for (const include of p.includes) {
      const sql = include.build(['66666666-6666-4666-8666-666666666666']).sql;
      expect(sql).toMatch(/AND "i\d+"\."workspaceId" = :asq_q0_p0/);
    }
  });
});
