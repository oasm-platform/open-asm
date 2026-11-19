/**
 * Attack surface query benchmark on a LOCAL database.
 *
 * Seeds one throwaway workspace with SCALE services (hosts, two HTTP probes
 * per service, technologies, TLS, URLs, IPs, findings), runs the sample
 * queries through the real validator, compiler and executor RUNS times each,
 * and prints p50/p95 latency, rows and the planner's view (EXPLAIN ANALYZE of
 * the root statement). The workspace is deleted afterwards unless KEEP=1.
 *
 *   task api:asq:bench                       # SCALE=100000 RUNS=20
 *   task api:asq:bench SCALE=2000000 RUNS=10 KEEP=1
 *
 * Never point it at a shared database: it writes millions of rows.
 */
import { DataSource } from 'typeorm';

import { databaseConnectionConfig } from '../src/database/database-config';
import { CATALOG } from '../src/modules/attack-surface-query/catalog/catalog';
import { limitsFor } from '../src/modules/attack-surface-query/domain/query-limits';
import { parseBatch, validateBatch } from '../src/modules/attack-surface-query/domain/query-validator';
import type { NormalizedBatch, QueryScope } from '../src/modules/attack-surface-query/domain/query.types';
import { Semaphore } from '../src/modules/attack-surface-query/engine/concurrency';
import { CursorCodec } from '../src/modules/attack-surface-query/engine/cursor';
import { executePlans, withReadOnlyUnit } from '../src/modules/attack-surface-query/engine/executor';
import { planQuery } from '../src/modules/attack-surface-query/engine/planner';
import { ROLLUP_COUNTS_SQL } from '../src/modules/attack-surface-query/asq-rollups.service';

const SCALE = Number(process.env.SCALE ?? 100_000);
const RUNS = Number(process.env.RUNS ?? 20);
const KEEP = process.env.KEEP === '1';
const PORTS = [21, 22, 25, 53, 80, 110, 143, 443, 445, 3306, 5432, 6379, 8080, 8443, 9200, 27017];

const SAMPLES: Record<string, unknown> = {
  newPorts: { window: { since: 'now-5d' }, queries: { q: { from: 'services', select: ['port', 'host.value', 'http.title'], limit: 50 } } },
  adminPanels: {
    queries: {
      q: {
        from: 'services',
        select: ['host.value', 'port', 'http.title'],
        where: { logic: 'and', items: [{ field: 'technologies.name', op: 'eq', value: 'nginx' }, { field: 'http.title', op: 'contains', value: 'admin' }] },
        limit: 50,
      },
    },
  },
  criticalByHost: {
    queries: {
      q: {
        from: 'vulnerabilities',
        groupBy: ['host.value'],
        aggregate: { n: { fn: 'count' } },
        where: { logic: 'and', items: [{ field: 'severity', op: 'eq', value: 'critical' }] },
        orderBy: [{ field: 'n', dir: 'desc' }],
        limit: 20,
        window: null,
      },
    },
  },
  expiringTls: {
    queries: {
      q: {
        from: 'tls',
        select: ['host', 'notAfter', 'service.host.value'],
        where: { logic: 'and', items: [{ field: 'notAfter', op: 'lt', value: 'now+30d' }] },
        orderBy: [{ field: 'notAfter', dir: 'asc' }],
        limit: 50,
        window: null,
      },
    },
  },
  hostsPerDay: {
    window: { since: 'now-30d' },
    queries: { q: { from: 'hosts', groupBy: [{ field: 'firstSeen', bucket: 'day' }], aggregate: { n: { fn: 'count' } }, limit: 31 } },
  },
  portsAllTime: {
    queries: { q: { from: 'services', groupBy: ['port'], aggregate: { n: { fn: 'count' } }, limit: 20, window: null } },
  },
  portsFromRollups: {
    queries: {
      q: {
        from: 'rollups',
        select: ['key', 'value'],
        where: { logic: 'and', items: [{ field: 'metric', op: 'eq', value: 'port' }] },
        limit: 20,
      },
    },
  },
};

async function seed(ds: DataSource): Promise<string> {
  const [{ id: workspaceId }] = await ds.query<Array<{ id: string }>>(`INSERT INTO workspaces (name) VALUES ($1) RETURNING id`, [`asq-bench-${Date.now()}`]);
  const [{ id: targetId }] = await ds.query<Array<{ id: string }>>(
    `INSERT INTO targets (value, "workspaceId", type) VALUES ($1, $2, 'DOMAIN') RETURNING id`,
    [`bench-${Date.now()}.example.com`, workspaceId],
  );
  const hosts = Math.max(1, Math.ceil(SCALE / 4));
  const t0 = Date.now();
  const step = async (label: string, sql: string, params: unknown[]) => {
    const s = Date.now();
    await ds.query(sql, params);
    process.stdout.write(`  seeded ${label} in ${Date.now() - s} ms\n`);
  };
  await step('hosts', `INSERT INTO assets (value, "targetId", "workspaceId", "createdAt", "lastSeenAt")
    SELECT 'h' || g || '.bench.example.com', $1, $2, now() - (g % 60) * interval '1 day', now()
      FROM generate_series(1, $3) g`, [targetId, workspaceId, hosts]);
  await step('services', `INSERT INTO asset_services (value, port, "assetId", "workspaceId", "targetId", "createdAt", "lastSeenAt")
    SELECT a.value || ':' || p.port, p.port, a.id, $1, $2, a."createdAt", now()
      FROM assets a CROSS JOIN LATERAL (SELECT ($3::int[])[1 + ((abs(hashtext(a.id::text)) + k) % array_length($3::int[], 1))] AS port FROM generate_series(0, 3) k) p
     WHERE a."targetId" = $2 ON CONFLICT DO NOTHING`, [workspaceId, targetId, PORTS]);
  await step('http responses', `INSERT INTO http_responses ("assetServiceId", "workspaceId", status_code, title, failed, "createdAt")
    SELECT s.id, $1, CASE WHEN r = 0 THEN 500 ELSE 200 END,
           CASE WHEN r = 0 THEN 'stale' WHEN s.port IN (8080, 8443) THEN 'Admin Console' ELSE 'Welcome' END,
           false, now() - (1 - r) * interval '2 days'
      FROM asset_services s CROSS JOIN generate_series(0, 1) r WHERE s."workspaceId" = $1`, [workspaceId]);
  await step('latest pointers', `UPDATE asset_services s SET "latestHttpResponseId" = l.id
      FROM (SELECT DISTINCT ON ("assetServiceId") id, "assetServiceId" FROM http_responses WHERE "workspaceId" = $1
            ORDER BY "assetServiceId", "createdAt" DESC, id DESC) l
     WHERE l."assetServiceId" = s.id`, [workspaceId]);
  await step('technologies', `INSERT INTO http_response_technologies ("httpResponseId", "assetServiceId", "workspaceId", name, version)
    SELECT s."latestHttpResponseId", s.id, $1, CASE WHEN s.port % 2 = 0 THEN 'nginx' ELSE 'Apache' END, '1.0'
      FROM asset_services s WHERE s."workspaceId" = $1 AND s."latestHttpResponseId" IS NOT NULL`, [workspaceId]);
  await step('tls', `INSERT INTO tls_certificates ("httpResponseId", "assetServiceId", "workspaceId", host, "notAfter")
    SELECT s."latestHttpResponseId", s.id, $1, s.value, now() + (abs(hashtext(s.id::text)) % 400) * interval '1 day'
      FROM asset_services s WHERE s."workspaceId" = $1 AND s.port IN (443, 8443) AND s."latestHttpResponseId" IS NOT NULL`, [workspaceId]);
  await step('urls', `INSERT INTO discovered_urls (url, "assetServiceId", "workspaceId", "targetId")
    SELECT 'https://' || s.value || '/p' || k, s.id, $1, $2 FROM asset_services s CROSS JOIN generate_series(1, 2) k WHERE s."workspaceId" = $1`, [workspaceId, targetId]);
  await step('ips', `INSERT INTO ip_observations ("assetId", "workspaceId", ip, source)
    SELECT a.id, $1, ('10.' || ((g / 65536) % 256) || '.' || ((g / 256) % 256) || '.' || (g % 256))::inet, 'dns_a'
      FROM (SELECT id, row_number() OVER () AS g FROM assets WHERE "workspaceId" = $1) a`, [workspaceId]);
  await step('vulnerabilities', `INSERT INTO vulnerabilities (name, severity, "assetId", "workspaceId", fingerprint)
    SELECT 'Finding ' || (g % 50), (ARRAY['info','low','medium','high','critical'])[1 + g % 5], a.id, $1, 'bench-' || a.id || '-' || g
      FROM (SELECT id, row_number() OVER () AS g FROM assets WHERE "workspaceId" = $1) a WHERE a.g % 3 = 0`, [workspaceId]);
  await step('rollups', `INSERT INTO asq_surface_rollups ("workspaceId", metric, key, value, "computedAt")
    SELECT $1, c.metric, left(c.key, 255), SUM(c.value)::int, now() FROM (${ROLLUP_COUNTS_SQL}) c WHERE c.key IS NOT NULL GROUP BY 1, 2, 3`, [workspaceId]);
  await ds.query('ANALYZE assets, asset_services, http_responses, http_response_technologies, tls_certificates, discovered_urls, ip_observations, vulnerabilities, asq_surface_rollups');
  process.stdout.write(`Seeded ${SCALE} services in ${Date.now() - t0} ms\n`);
  return workspaceId;
}

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

async function main(): Promise<void> {
  const ds = new DataSource({ type: 'postgres', ...databaseConnectionConfig, entities: [], synchronize: false });
  await ds.initialize();
  let workspaceId: string | undefined;
  try {
    const wsId = await seed(ds);
    workspaceId = wsId;
    const scope: QueryScope = { workspaceId, permissions: ['*'], caller: 'http' };
    const limits = limitsFor('http', 'interactive');
    const lines = ['| query | p50 ms | p95 ms | rows | outcome | planner (root) |', '|---|---|---|---|---|---|'];
    for (const [name, input] of Object.entries(SAMPLES)) {
      const timings: number[] = [];
      let outcome = 'ok';
      let rows = 0;
      let planner = '';
      for (let i = 0; i < RUNS; i++) {
        let batch: NormalizedBatch;
        try {
          batch = validateBatch(CATALOG, parseBatch(input), scope, new Date());
        } catch (error) {
          outcome = `invalid: ${JSON.stringify((error as { details?: unknown }).details ?? String(error))}`;
          break;
        }
        const plans = batch.queries.map((q, index) => planQuery(CATALOG, q, { workspaceId: wsId }, undefined, index));
        const started = Date.now();
        const [result] = await executePlans(plans, {
          dataSource: ds,
          limits,
          semaphore: new Semaphore(3, 2000),
          codec: new CursorCodec('bench'),
          workspaceId: wsId,
          rls: false,
          preflight: true,
          consistent: false,
          parallel: 1,
          deadline: Date.now() + limits.batchBudgetMs,
          logger: { warn: () => undefined, error: () => undefined },
        });
        timings.push(Date.now() - started);
        if ('error' in result.result) outcome = result.result.error.code;
        else rows = result.result.rows.length;
        if (i === 0) {
          const explain = await withReadOnlyUnit(ds, { statementTimeoutMs: 60_000, isolation: 'READ COMMITTED', rls: false, workspaceId: wsId }, (run) =>
            run({ sql: `EXPLAIN (ANALYZE, FORMAT JSON) ${plans[0].root.sql}`, params: plans[0].root.params }),
          );
          const plan = (explain[0]['QUERY PLAN'] as Array<{ Plan: { 'Node Type': string }; 'Execution Time': number }>)[0];
          planner = `${plan.Plan['Node Type']}, ${plan['Execution Time'].toFixed(1)} ms`;
        }
      }
      lines.push(
        timings.length
          ? `| ${name} | ${percentile(timings, 50)} | ${percentile(timings, 95)} | ${rows} | ${outcome} | ${planner} |`
          : `| ${name} | - | - | - | ${outcome} | - |`,
      );
    }
    process.stdout.write(`\nSCALE=${SCALE} RUNS=${RUNS}\n${lines.join('\n')}\n`);
  } finally {
    if (workspaceId && !KEEP) {
      await ds.query(`DELETE FROM workspaces WHERE id = $1`, [workspaceId]);
      process.stdout.write('Benchmark workspace deleted.\n');
    }
    await ds.destroy();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`asq-benchmark failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
