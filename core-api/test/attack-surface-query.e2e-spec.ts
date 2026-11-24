import type { App } from 'supertest/types';
import type { DataSource } from 'typeorm';
import * as request from 'supertest';
import { closeTestApp, createTestApp, type TestApp } from './helpers/app';
import { cleanupE2eData, createUserWithWorkspace } from './helpers/workspace';
import { AttackSurfaceQueryService } from '../src/modules/attack-surface-query/attack-surface-query.service';
import { AsqConnectionsService } from '../src/modules/attack-surface-query/asq-connections.service';
import { CATALOG, fieldOps } from '../src/modules/attack-surface-query/catalog/catalog';
import type { QueryBatchResult, QueryScope } from '../src/modules/attack-surface-query/domain/query.types';
import { AsqError } from '../src/modules/attack-surface-query/domain/query-errors';
import { withReadOnlyUnit } from '../src/modules/attack-surface-query/engine/executor';
import { mapPgError } from '../src/modules/attack-surface-query/engine/pg-errors';
import { freshRunInCteSql, freshRunSql, latestCoveringRunsCte } from '../src/modules/assets/fresh-runs';

/**
 * Attack surface queries against real Postgres: tenant isolation over every
 * resource, the denormalized scope columns (trigger fill, composite keys),
 * RLS, read-only units, timeouts, paging and the HTTP surface.
 */
describe('Attack surface query (e2e)', () => {
  jest.setTimeout(180_000);

  let app: TestApp;
  let server: App;
  let dataSource: DataSource;
  let asq: AttackSurfaceQueryService;
  let connections: AsqConnectionsService;
  const workspaceIds: string[] = [];
  const userIds: string[] = [];
  let headersA: Record<string, string>;

  interface Seeded {
    workspaceId: string;
    targetId: string;
    domain: string;
    hostIds: string[];
    serviceIds: string[];
    newServiceId: string;
    oldServiceId: string;
  }
  let A: Seeded;
  let B: Seeded;

  const one = async (sql: string, params: unknown[]): Promise<string> => {
    const rows: Array<{ id: string }> = await dataSource.query(sql, params);
    return rows[0].id;
  };

  /**
   * Seeds a workspace with raw SQL that never sets workspaceId/targetId: the
   * asq_fill_scope triggers must fill them from the parents.
   */
  async function seed(workspaceId: string, label: string): Promise<Seeded> {
    const domain = `${label}-${Date.now()}.example.com`;
    const targetId = await one(
      `INSERT INTO targets (value, "workspaceId", type) VALUES ($1, $2, 'DOMAIN') RETURNING id`,
      [domain, workspaceId],
    );
    const [workflow] = (await dataSource.query(`SELECT id FROM workflows WHERE "workspaceId" = $1 LIMIT 1`, [workspaceId]));
    const scope = JSON.stringify({ targetIds: [targetId] });
    const run1 = await one(
      `INSERT INTO job_histories ("workflowId", "isCompleted", scope, "createdAt") VALUES ($1, true, $2::jsonb, now() - interval '3 days') RETURNING id`,
      [workflow?.id ?? null, scope],
    );
    const run2 = await one(
      `INSERT INTO job_histories ("workflowId", "isCompleted", scope, "createdAt") VALUES ($1, true, $2::jsonb, now() - interval '1 day') RETURNING id`,
      [workflow?.id ?? null, scope],
    );

    const hostIds: string[] = [];
    const serviceIds: string[] = [];
    let newServiceId = '';
    let oldServiceId = '';
    const hosts = [
      { value: `a.${domain}`, age: '0 days' },
      { value: `b.${domain}`, age: '0 days' },
      { value: `old.${domain}`, age: '10 days' },
    ];
    for (const [h, host] of hosts.entries()) {
      const hostId = await one(
        `INSERT INTO assets (value, "targetId", "isPrimary", "createdAt") VALUES ($1, $2, $3, now() - $4::interval) RETURNING id`,
        [host.value, targetId, h === 0, host.age],
      );
      hostIds.push(hostId);
      await dataSource.query(`INSERT INTO ip_observations ("assetId", ip, source) VALUES ($1, $2, 'dns_a')`, [hostId, `10.${h}.0.1`]);
      await dataSource.query(`INSERT INTO dns_records ("assetId", "recordType", value) VALUES ($1, 'A', $2)`, [hostId, `10.${h}.0.1`]);
      for (const port of [80, 443]) {
        const run = h === 0 ? run2 : run1;
        const serviceId = await one(
          `INSERT INTO asset_services (value, port, "assetId", "jobHistoryId", "createdAt") VALUES ($1, $2, $3, $4, now() - $5::interval) RETURNING id`,
          [`${host.value}:${port}`, port, hostId, run, host.age],
        );
        serviceIds.push(serviceId);
        if (h === 0 && port === 443) newServiceId = serviceId;
        if (h === 2 && port === 443) oldServiceId = serviceId;
        const oldResp = await one(
          `INSERT INTO http_responses ("assetServiceId", failed, status_code, title, "createdAt") VALUES ($1, false, 500, 'stale page', now() - interval '2 days') RETURNING id`,
          [serviceId],
        );
        await dataSource.query(`INSERT INTO http_response_technologies ("httpResponseId", "assetServiceId", name) VALUES ($1, $2, 'OldTech')`, [oldResp, serviceId]);
        const resp = await one(
          `INSERT INTO http_responses ("assetServiceId", failed, status_code, title) VALUES ($1, false, 200, $2) RETURNING id`,
          [serviceId, port === 443 ? 'Admin Console' : 'Welcome'],
        );
        await dataSource.query(`INSERT INTO http_response_technologies ("httpResponseId", "assetServiceId", name, version) VALUES ($1, $2, 'nginx', '1.25')`, [resp, serviceId]);
        await dataSource.query(`INSERT INTO http_status_codes ("httpResponseId", "assetServiceId", "statusCode", "isPrimary") VALUES ($1, $2, 200, true)`, [resp, serviceId]);
        await dataSource.query(
          `INSERT INTO tls_certificates ("httpResponseId", "assetServiceId", host, "notAfter") VALUES ($1, $2, $3, now() + interval '10 days')`,
          [resp, serviceId, host.value],
        );
        await dataSource.query(`UPDATE asset_services SET "latestHttpResponseId" = $1 WHERE id = $2`, [resp, serviceId]);
        for (const path of ['/login', '/admin']) {
          await dataSource.query(`INSERT INTO discovered_urls (url, "assetServiceId") VALUES ($1, $2)`, [`https://${host.value}${path}`, serviceId]);
        }
        await dataSource.query(`INSERT INTO asset_services_tags (tag, "assetServiceId") VALUES ('web', $1)`, [serviceId]);
      }
    }
    await dataSource.query(
      `INSERT INTO vulnerabilities (name, severity, "assetId", "reviewStatus", fingerprint) VALUES ($1, 'critical', $2, 'approved', $3), ($4, 'high', $5, 'pending_review', $6)`,
      [`Exposed admin ${label}`, hostIds[0], `fp-${label}-1-${Date.now()}`, `Proposal ${label}`, hostIds[1], `ai-fp-${label}-2-${Date.now()}`],
    );
    return { workspaceId, targetId, domain, hostIds, serviceIds, newServiceId, oldServiceId };
  }

  const scopeOf = (s: Seeded, permissions: string[] = ['*']): QueryScope => ({
    workspaceId: s.workspaceId,
    permissions,
    caller: 'http',
  });

  const rowsOf = (result: unknown, name: string): Array<Record<string, unknown>> => {
    const r = (result as QueryBatchResult).data[name];
    if ('error' in r) throw new Error(`${name}: ${JSON.stringify(r.error)}`);
    return r.rows;
  };

  beforeAll(async () => {
    app = await createTestApp();
    server = app.server;
    dataSource = app.dataSource;
    asq = app.app.get(AttackSurfaceQueryService);
    connections = app.app.get(AsqConnectionsService);
    const a = await createUserWithWorkspace(app.server, 'asq-a');
    const b = await createUserWithWorkspace(app.server, 'asq-b');
    workspaceIds.push(a.workspace.id, b.workspace.id);
    userIds.push(a.user.userId, b.user.userId);
    headersA = a.headers;
    A = await seed(a.workspace.id, 'asqa');
    B = await seed(b.workspace.id, 'asqb');
  });

  afterAll(async () => {
    await cleanupE2eData(dataSource, { workspaceIds, userIds });
    await closeTestApp(app?.app);
  });

  describe('scope columns', () => {
    it('fills workspaceId/targetId from the parents (trigger) on every table', async () => {
      const [row] = (await dataSource.query(
        `SELECT
           (SELECT count(*) FROM assets WHERE "targetId" = $1 AND "workspaceId" = $2)::int AS hosts,
           (SELECT count(*) FROM asset_services s JOIN assets a ON a.id = s."assetId" WHERE a."targetId" = $1 AND s."workspaceId" = $2 AND s."targetId" = $1)::int AS services,
           (SELECT count(*) FROM http_response_technologies t JOIN asset_services s ON s.id = t."assetServiceId" JOIN assets a ON a.id = s."assetId" WHERE a."targetId" = $1 AND t."workspaceId" = $2)::int AS tech,
           (SELECT count(*) FROM discovered_urls u JOIN asset_services s ON s.id = u."assetServiceId" JOIN assets a ON a.id = s."assetId" WHERE a."targetId" = $1 AND u."workspaceId" = $2 AND u."targetId" = $1)::int AS urls,
           (SELECT count(*) FROM vulnerabilities v JOIN assets a ON a.id = v."assetId" WHERE a."targetId" = $1 AND v."workspaceId" = $2)::int AS vulns`,
        [A.targetId, A.workspaceId],
      ));
      expect(row).toEqual({ hosts: 3, services: 6, tech: 12, urls: 12, vulns: 2 });
    });

    it('refuses a row whose workspace differs from its parent (composite FK)', async () => {
      await expect(
        dataSource.query(`INSERT INTO asset_services (value, port, "assetId", "workspaceId", "targetId") VALUES ('x', 8, $1, $2, $3)`, [
          A.hostIds[0],
          B.workspaceId,
          A.targetId,
        ]),
      ).rejects.toMatchObject({ code: '23503' });
      await expect(
        dataSource.query(`INSERT INTO vulnerabilities (name, "assetId", "workspaceId") VALUES ('x', $1, $2)`, [A.hostIds[0], B.workspaceId]),
      ).rejects.toMatchObject({ code: '23503' });
    });
  });

  describe('engine', () => {
    it('answers "new ports and domains in the last 5 days"', async () => {
      const result = await asq.run(scopeOf(A), {
        window: { since: 'now-5d' },
        queries: {
          newDomains: {
            from: 'hosts',
            select: ['value', 'firstSeen', 'target.value'],
            include: { ips: { select: ['ip'], limit: 5 } },
            where: { logic: 'and', items: [{ field: 'kind', op: 'eq', value: 'domain' }] },
          },
          newPorts: { from: 'services', select: ['port', 'host.value', 'http.title'] },
          portSummary: {
            from: 'services',
            groupBy: ['port'],
            aggregate: { hosts: { fn: 'countDistinct', field: 'host.id' } },
            orderBy: [{ field: 'port', dir: 'asc' }],
          },
        },
      });
      const domains = rowsOf(result, 'newDomains');
      expect(domains.map((d) => d.value).sort()).toEqual([`a.${A.domain}`, `b.${A.domain}`]);
      expect(domains[0]).toEqual(
        expect.objectContaining({ target: { value: A.domain }, ips: [expect.objectContaining({ ip: expect.stringMatching(/^10\./) })] }),
      );
      const ports = rowsOf(result, 'newPorts');
      expect(ports).toHaveLength(4);
      expect(ports.find((p) => p.port === 443)).toEqual(expect.objectContaining({ http: { title: 'Admin Console' } }));
      expect(rowsOf(result, 'portSummary')).toEqual([
        { port: 80, hosts: 2 },
        { port: 443, hosts: 2 },
      ]);
    });

    it('reads technologies and TLS of the latest response only', async () => {
      const result = await asq.run(scopeOf(A), {
        queries: {
          tech: { from: 'technologies', groupBy: ['name'], aggregate: { n: { fn: 'count' } } },
          withTech: {
            from: 'services',
            select: ['port'],
            include: { technologies: { select: ['name'] } },
            where: { logic: 'and', items: [{ field: 'technologies.name', op: 'eq', value: 'OldTech' }] },
          },
        },
      });
      expect(rowsOf(result, 'tech')).toEqual([{ name: 'nginx', n: 6 }]);
      expect(rowsOf(result, 'withTech')).toEqual([]);
    });

    it('never lists AI proposals under review', async () => {
      const rows = rowsOf(await asq.run(scopeOf(A), { queries: { v: { from: 'vulnerabilities', select: ['name', 'isOpen'] } } }), 'v');
      expect(rows.map((r) => r.name)).toEqual(['Exposed admin asqa']);
    });

    it('pages with cursors through every row exactly once, and counts', async () => {
      // Every URL in the same millisecond, distinct microseconds: a cursor
      // that loses sub-millisecond precision would skip rows here.
      await dataSource.query(
        `UPDATE discovered_urls u SET "createdAt" = date_trunc('second', now()) + interval '123 milliseconds' + n.k * interval '1 microsecond'
           FROM (SELECT id, row_number() OVER (ORDER BY id) AS k FROM discovered_urls WHERE "workspaceId" = $1) n
          WHERE n.id = u.id`,
        [A.workspaceId],
      );
      const seen: string[] = [];
      let cursor: string | undefined;
      let total: number | undefined;
      do {
        const result = await asq.run(scopeOf(A), {
          queries: { p: { from: 'urls', select: ['url'], limit: 5, withTotal: true, ...(cursor ? { cursor } : {}) } },
        });
        const page = (result as QueryBatchResult).data.p;
        if ('error' in page) throw new Error(JSON.stringify(page.error));
        seen.push(...page.rows.map((r) => r.id as string));
        total = page.total;
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      expect(seen).toHaveLength(12);
      expect(new Set(seen).size).toBe(12);
      expect(total).toBe(12);
    });

    it('refuses a cursor of another workspace', async () => {
      const first = (await asq.run(scopeOf(A), { queries: { p: { from: 'urls', limit: 2 } } })) as QueryBatchResult;
      const cursor = ('rows' in first.data.p && first.data.p.nextCursor) as string;
      await expect(asq.run(scopeOf(B), { queries: { p: { from: 'urls', limit: 2, cursor } } })).rejects.toMatchObject({
        code: 'INVALID_CURSOR',
      });
    });

    it('computes isNew exactly like freshRunSql', async () => {
      const rows = rowsOf(
        await asq.run(scopeOf(A), { queries: { s: { from: 'services', select: ['isNew'], window: null, limit: 50 } } }),
        's',
      );
      const fresh = new Map(rows.map((r) => [r.id as string, r.isNew]));
      expect(fresh.get(A.newServiceId)).toBe(true);
      expect(fresh.get(A.oldServiceId)).toBe(false);
      const reference = (await dataSource.query(
        `WITH asq_latest AS (${latestCoveringRunsCte('$1')})
         SELECT s.id, ${freshRunSql('s."jobHistoryId"', 's."targetId"')} AS legacy,
                ${freshRunInCteSql('s."jobHistoryId"', 's."targetId"')} AS cte
           FROM asset_services s WHERE s."workspaceId" = $1`,
        [A.workspaceId],
      ));
      for (const row of reference) {
        expect(row.cte).toBe(row.legacy);
        expect(fresh.get(row.id)).toBe(row.legacy);
      }
    });

    it('never returns a row of another workspace, for any resource, operator or relation', async () => {
      const forbidden = [B.domain, B.targetId, ...B.hostIds, ...B.serviceIds];
      const roots = Object.values(CATALOG).filter((r) => r.root);
      for (const res of roots) {
        const queries: Record<string, unknown> = {
          list: {
            from: res.name,
            select: Object.entries(res.fields).filter(([, f]) => !f.heavy).map(([n]) => n),
            // Small pages stay under the cost budget; the seed has fewer rows.
            include: Object.fromEntries(Object.keys(res.many).map((m) => [m, { limit: 5 }])),
            limit: 20,
            window: null,
          },
        };
        const groupable = Object.entries(res.fields).find(([, f]) => f.groupable && f.type !== 'timestamp');
        if (groupable) queries.agg = { from: res.name, groupBy: [groupable[0]], aggregate: { n: { fn: 'count' } }, window: null };
        const negation = Object.entries(res.fields).find(([, f]) => fieldOps(f).includes('neq') && f.type === 'text');
        if (negation) {
          queries.or = {
            from: res.name,
            window: null,
            limit: 20,
            where: {
              logic: 'or',
              items: [
                { field: negation[0], op: 'neq', value: 'nothing-matches-this' },
                { field: 'id', op: 'eq', value: B.hostIds[0] },
              ],
            },
          };
        }
        const result = await asq.run(scopeOf(A), { queries });
        const json = JSON.stringify(result);
        for (const value of forbidden) expect(json).not.toContain(value);
      }
    });
  });

  describe('language on Postgres', () => {
    it('runs nested filters, operators and relation tests', async () => {
      const result = await asq.run(scopeOf(A), {
        queries: {
          admin443: {
            from: 'services',
            window: null,
            select: ['port'],
            where: {
              logic: 'and',
              items: [
                { not: { field: 'port', op: 'between', value: ['1', '100'] } },
                { logic: 'or', items: [{ field: 'http.title', op: 'startsWith', value: 'Admin' }, { field: 'http.title', op: 'isNull' }] },
              ],
            },
          },
          noSsh: {
            from: 'hosts',
            window: null,
            select: ['value'],
            where: {
              logic: 'and',
              items: [
                { relation: 'services', quantifier: 'none', where: { logic: 'and', items: [{ field: 'port', op: 'eq', value: '22' }] } },
                { relation: 'services', count: { op: 'gte', value: '2' } },
              ],
            },
          },
          allWeb: {
            from: 'hosts',
            window: null,
            select: ['value'],
            where: { logic: 'and', items: [{ relation: 'services', quantifier: 'every', where: { logic: 'and', items: [{ field: 'port', op: 'in', value: ['80', '443'] }] } }] },
          },
          only443: {
            from: 'hosts',
            window: null,
            select: ['value'],
            where: { logic: 'and', items: [{ relation: 'services', quantifier: 'every', where: { logic: 'and', items: [{ field: 'port', op: 'eq', value: '443' }] } }] },
          },
          withFinding: {
            from: 'hosts',
            window: null,
            select: ['value'],
            where: { logic: 'and', items: [{ relation: 'vulnerabilities' }] },
          },
        },
      });
      expect(rowsOf(result, 'admin443')).toHaveLength(3);
      expect(rowsOf(result, 'noSsh')).toHaveLength(3);
      expect(rowsOf(result, 'allWeb')).toHaveLength(3);
      expect(rowsOf(result, 'only443')).toHaveLength(0);
      // The finding under review stays hidden: one host.
      expect(rowsOf(result, 'withFinding').map((r) => r.value)).toEqual([`a.${A.domain}`]);
    });

    it('runs conditional aggregates, having and a filled series in a time zone', async () => {
      const result = await asq.run(scopeOf(A), {
        options: { timezone: 'Asia/Ho_Chi_Minh' },
        queries: {
          matrix: {
            from: 'services',
            window: null,
            groupBy: ['host.value'],
            aggregate: {
              n: { fn: 'count' },
              https: { fn: 'count', where: { logic: 'and', items: [{ field: 'port', op: 'eq', value: '443' }] } },
              ports: { fn: 'sum', field: 'port' },
            },
            having: { logic: 'and', items: [{ field: 'https', op: 'gte', value: '1' }] },
          },
          series: {
            from: 'services',
            window: { since: 'now-7d' },
            groupBy: [{ field: 'firstSeen', bucket: 'day' }],
            aggregate: { n: { fn: 'count' } },
            fill: true,
          },
        },
      });
      const matrix = rowsOf(result, 'matrix');
      expect(matrix).toHaveLength(3);
      for (const row of matrix) expect(row).toEqual(expect.objectContaining({ n: 2, https: 1, ports: 523 }));
      const series = rowsOf(result, 'series');
      // Every day of the window, the empty ones as 0; the two new hosts' services today.
      expect(series).toHaveLength(8);
      expect(series.reduce((sum, r) => sum + (r.n as number), 0)).toBe(4);
      expect(series.filter((r) => r.n === 0)).toHaveLength(7);
    });
  });

  describe('catalog and database agree', () => {
    it('lets the query role read every catalog table, each scoped by its column and policy or its predicate', async () => {
      expect(connections.rls).toBe(true);
      const problems: string[] = [];
      for (const res of Object.values(CATALOG)) {
        const [row] = (await dataSource.query(
          `SELECT has_table_privilege('asq_reader', $1, 'SELECT') AS readable,
                  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'workspaceId') AS scoped,
                  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = $1 AND policyname = 'asq_tenant') AS policy`,
          [res.table],
        ));
        if (!row.readable) problems.push(`${res.name}: asq_reader cannot SELECT ${res.table}`);
        if (!res.global && !res.scopePredicate && !row.scoped) problems.push(`${res.name}: ${res.table} has no workspaceId (declare a scopePredicate)`);
        if (!res.global && !res.scopePredicate && !row.policy) problems.push(`${res.name}: ${res.table} has no asq_tenant policy`);
      }
      expect(problems).toEqual([]);
    });

    it('selects every field of every resource under the query role', async () => {
      for (const res of Object.values(CATALOG).filter((r) => r.root)) {
        const fields = (r: typeof res) => Object.entries(r.fields).filter(([, f]) => !f.heavy).map(([n]) => n);
        const result = await asq.run(scopeOf(A), {
          queries: {
            q: {
              from: res.name,
              window: null,
              limit: 5,
              select: fields(res),
              include: Object.fromEntries(Object.entries(res.many).map(([m, def]) => [m, { select: fields(CATALOG[def.resource]), limit: 2 }])),
            },
          },
        });
        expect(() => rowsOf(result, 'q')).not.toThrow();
      }
    });
  });

  describe('database execution', () => {
    it('runs read-only: a write is refused by Postgres', async () => {
      await expect(
        withReadOnlyUnit(dataSource, { statementTimeoutMs: 2000, isolation: 'READ COMMITTED', rls: false, workspaceId: A.workspaceId }, (run) =>
          run({ sql: `INSERT INTO asset_services_tags (tag, "assetServiceId") VALUES ('x', :id)`, params: { id: A.serviceIds[0] } }),
        ),
      ).rejects.toMatchObject({ code: '25006' });
    });

    it('stops a statement at its timeout and maps it to QUERY_TIMEOUT', async () => {
      const err = await withReadOnlyUnit(
        dataSource,
        { statementTimeoutMs: 100, isolation: 'READ COMMITTED', rls: false, workspaceId: A.workspaceId },
        (run) => run({ sql: 'SELECT pg_sleep(2)', params: {} }),
      ).catch((e: unknown) => e);
      expect(mapPgError(err, 100).error.code).toBe('QUERY_TIMEOUT');
    });

    it('binds array parameters of every cast type', async () => {
      const rows = await withReadOnlyUnit(
        dataSource,
        { statementTimeoutMs: 2000, isolation: 'READ COMMITTED', rls: false, workspaceId: A.workspaceId },
        (run) =>
          run({
            sql: `SELECT CAST(:u AS uuid[]) AS u, CAST(:i AS inet[]) AS i, CAST(:n AS int8[]) AS n`,
            params: { u: [A.hostIds[0]], i: ['10.0.0.1'], n: ['443'] },
          }),
      );
      expect(rows).toHaveLength(1);
    });

    it('limits the RLS role to the bound workspace', async () => {
      // The e2e database user may create roles, so the migration set it up.
      expect(connections.rls).toBe(true);
      const count = async (workspaceId: string) =>
        withReadOnlyUnit(dataSource, { statementTimeoutMs: 2000, isolation: 'READ COMMITTED', rls: true, workspaceId }, async (run) => {
          const [row] = await run({ sql: `SELECT count(*)::int AS n FROM assets WHERE "targetId" = ANY(CAST(:t AS uuid[]))`, params: { t: [A.targetId, B.targetId] } });
          return row.n as number;
        });
      expect(await count(A.workspaceId)).toBe(3);
      expect(await count(B.workspaceId)).toBe(3);
      // Unbound: the policy sees no workspace, so nothing.
      const none = await withReadOnlyUnit(dataSource, { statementTimeoutMs: 2000, isolation: 'READ COMMITTED', rls: true, workspaceId: '00000000-0000-4000-8000-000000000000' }, async (run) => {
        const [row] = await run({ sql: `SELECT count(*)::int AS n FROM assets`, params: {} });
        return row.n as number;
      });
      expect(none).toBe(0);
    });
  });

  describe('HTTP API', () => {
    it('describes, explains and runs a batch', async () => {
      const schema = await request(server).get('/api/attack-surface/schema').set(headersA).expect(200);
      expect((schema.body as { resources: Array<{ name: string }> }).resources.map((r) => r.name)).toContain('services');

      const body = { queries: { s: { from: 'services', select: ['port'], limit: 3 } } };
      const explain = await request(server).post('/api/attack-surface/explain').set(headersA).send(body).expect(200);
      expect((explain.body as { queries: Record<string, { cost: number }> }).queries.s.cost).toBeGreaterThan(0);

      const res = await request(server).post('/api/attack-surface/query').set(headersA).send(body).expect(200);
      expect((res.body as QueryBatchResult).data.s).toEqual(expect.objectContaining({ rows: expect.any(Array) }));
    });

    it('answers a bad query with 400 and the path of each problem', async () => {
      const res = await request(server)
        .post('/api/attack-surface/query')
        .set(headersA)
        .send({ queries: { s: { from: 'services', select: ['prot'] } } })
        .expect(400);
      expect(res.body).toEqual(
        expect.objectContaining({
          error: expect.objectContaining({ code: 'INVALID_QUERY', issues: [expect.objectContaining({ path: 'queries.s.select[0]' })] }),
        }),
      );
    });

    it('saves, runs and deletes a query', async () => {
      const created = await request(server)
        .post('/api/attack-surface/saved-queries')
        .set(headersA)
        .send({ name: `ports-${Date.now()}`, spec: { queries: { s: { from: 'services', select: ['port'] } } } })
        .expect(201);
      const id = (created.body as { id: string }).id;
      const run = await request(server).post(`/api/attack-surface/saved-queries/${id}/run`).set(headersA).expect(200);
      expect((run.body as QueryBatchResult).data.s).toEqual(expect.objectContaining({ rows: expect.any(Array) }));
      await request(server).delete(`/api/attack-surface/saved-queries/${id}`).set(headersA).expect(200);
      await request(server).get(`/api/attack-surface/saved-queries/${id}`).set(headersA).expect(404);
    });

    it('runs a saved query with params, defaults when none are sent', async () => {
      const created = await request(server)
        .post('/api/attack-surface/saved-queries')
        .set(headersA)
        .send({
          name: `by-port-${Date.now()}`,
          spec: {
            params: { port: { type: 'number', default: 80 } },
            queries: { s: { from: 'services', window: null, select: ['port'], where: { logic: 'and', items: [{ field: 'port', op: 'eq', value: { $param: 'port' } }] } } },
          },
        })
        .expect(201);
      const id = (created.body as { id: string }).id;
      const ports = async (body?: object) => {
        const req = request(server).post(`/api/attack-surface/saved-queries/${id}/run`).set(headersA);
        const res = await (body ? req.send(body) : req).expect(200);
        return rowsOf(res.body, 's').map((r) => r.port);
      };
      expect(await ports()).toEqual([80, 80, 80]);
      expect(await ports({ params: { port: 443 } })).toEqual([443, 443, 443]);
      await request(server).post(`/api/attack-surface/saved-queries/${id}/run`).set(headersA).send({ params: { other: 1 } }).expect(400);
      await request(server).delete(`/api/attack-surface/saved-queries/${id}`).set(headersA).expect(200);
    });

    it('queues a report-mode batch and serves its result', async () => {
      const queued = await request(server)
        .post('/api/attack-surface/query')
        .set(headersA)
        .send({ queries: { s: { from: 'services', select: ['port'], limit: 5000 } }, options: { mode: 'report' } })
        .expect(200);
      const { jobId } = queued.body as { jobId: string };
      expect(jobId).toEqual(expect.any(String));
      let state: { status: string } = { status: 'queued' };
      for (let i = 0; i < 60 && (state.status === 'queued' || state.status === 'running'); i++) {
        await new Promise((r) => setTimeout(r, 250));
        state = (await request(server).get(`/api/attack-surface/jobs/${jobId}`).set(headersA).expect(200)).body as { status: string };
      }
      expect(state).toEqual(expect.objectContaining({ status: 'completed', result: expect.objectContaining({ data: expect.any(Object) }) }));
    });
  });

  it('reports permission errors as AsqError', async () => {
    await expect(asq.run(scopeOf(A, ['asset.read']), { queries: { v: { from: 'vulnerabilities' } } })).rejects.toBeInstanceOf(AsqError);
  });
});
