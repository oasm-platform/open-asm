/**
 * Batched backfill of the attack surface tenant columns, for large databases.
 *
 * Run it after the AddWorkspaceScopeColumns migration and before
 * AddWorkspaceScopeConstraints, while the API keeps running: it fills
 * `workspaceId` / `targetId` from the parent rows in small batches (short
 * transactions, row locks only), so the second migration finds nothing left
 * to update. New rows are already filled by the asq_fill_scope triggers.
 *
 *   task api:asq:backfill                    # default batch 10 000 rows, 100 ms pause
 *   task api:asq:backfill BATCH=5000 PAUSE_MS=250
 *
 * Idempotent: only rows still NULL are touched; stop and re-run at will.
 * Reads the database settings from core-api/.env (database-config.ts).
 */
import { DataSource } from 'typeorm';

import { databaseConnectionConfig } from '../src/database/database-config';

const BATCH = Number(process.env.BATCH ?? 10_000);
const PAUSE_MS = Number(process.env.PAUSE_MS ?? 100);

interface Step {
  table: string;
  parent: string;
  /** Column of the child pointing at the parent's id. */
  key: string;
  /** Child columns copied from the same-named parent columns. */
  columns: string[];
}

/** Parents before children, like the migration. */
const STEPS: Step[] = [
  { table: 'assets', parent: 'targets', key: 'targetId', columns: ['workspaceId'] },
  { table: 'asset_services', parent: 'assets', key: 'assetId', columns: ['workspaceId', 'targetId'] },
  { table: 'http_responses', parent: 'asset_services', key: 'assetServiceId', columns: ['workspaceId'] },
  { table: 'http_response_technologies', parent: 'http_responses', key: 'httpResponseId', columns: ['workspaceId'] },
  { table: 'http_status_codes', parent: 'http_responses', key: 'httpResponseId', columns: ['workspaceId'] },
  { table: 'tls_certificates', parent: 'http_responses', key: 'httpResponseId', columns: ['workspaceId'] },
  { table: 'ip_observations', parent: 'assets', key: 'assetId', columns: ['workspaceId'] },
  { table: 'ip_observations', parent: 'http_responses', key: 'httpResponseId', columns: ['workspaceId'] },
  { table: 'ip_observations', parent: 'asset_services', key: 'assetServiceId', columns: ['workspaceId'] },
  { table: 'dns_records', parent: 'assets', key: 'assetId', columns: ['workspaceId'] },
  { table: 'discovered_urls', parent: 'asset_services', key: 'assetServiceId', columns: ['workspaceId', 'targetId'] },
  { table: 'asset_services_tags', parent: 'asset_services', key: 'assetServiceId', columns: ['workspaceId'] },
  { table: 'vulnerabilities', parent: 'assets', key: 'assetId', columns: ['workspaceId'] },
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function backfill(dataSource: DataSource, step: Step): Promise<number> {
  const set = step.columns.map((c) => `"${c}" = p."${c}"`).join(', ');
  const missing = step.columns.map((c) => `c."${c}" IS NULL`).join(' OR ');
  let total = 0;
  for (;;) {
    const result = await dataSource.query<[unknown, number] | undefined>(
      `UPDATE "${step.table}" t SET ${set}
         FROM "${step.parent}" p
        WHERE p.id = t."${step.key}"
          AND t.id IN (SELECT c.id FROM "${step.table}" c
                        WHERE (${missing}) AND c."${step.key}" IS NOT NULL
                        LIMIT $1)`,
      [BATCH],
    );
    const updated = Number(result?.[1] ?? 0);
    total += updated;
    if (updated === 0) return total;
    process.stdout.write(`  ${step.table} ← ${step.parent}: ${total} rows\r`);
    await sleep(PAUSE_MS);
  }
}

async function main(): Promise<void> {
  const dataSource = new DataSource({ type: 'postgres', ...databaseConnectionConfig, entities: [], synchronize: false });
  await dataSource.initialize();
  try {
    for (const step of STEPS) {
      const total = await backfill(dataSource, step);
      process.stdout.write(`${step.table} ← ${step.parent}: ${total} rows updated\n`);
    }
    const [orphans] = await dataSource.query<Array<Record<string, number>>>(
      `SELECT
         (SELECT count(*) FROM assets WHERE "workspaceId" IS NULL)::int AS assets,
         (SELECT count(*) FROM asset_services WHERE "workspaceId" IS NULL OR "targetId" IS NULL)::int AS asset_services,
         (SELECT count(*) FROM http_responses WHERE "workspaceId" IS NULL)::int AS http_responses,
         (SELECT count(*) FROM ip_observations WHERE "workspaceId" IS NULL)::int AS ip_observations,
         (SELECT count(*) FROM vulnerabilities WHERE "workspaceId" IS NULL)::int AS vulnerabilities`,
    );
    const left = Object.entries(orphans).filter(([, n]) => n > 0);
    if (left.length > 0) {
      process.stdout.write(
        `Rows still without a workspace (orphans, resolve before AddWorkspaceScopeConstraints): ${left.map(([t, n]) => `${t}=${n}`).join(', ')}\n`,
      );
      process.exitCode = 2;
    } else {
      process.stdout.write('Backfill complete: no row left without a workspace.\n');
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`asq-backfill failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
