import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `integrations.capabilities` — the set of capabilities (IntegrationType
 * values) an integration has enabled — so one connection can do several
 * things (e.g. GitHub: SOURCE_CODE + TICKETING).
 *
 * All-in-one: column + backfill, in this order, in this single migration.
 *
 * Existing connections must keep working unchanged. Every row that exists
 * today belongs to a single-capability app whose one capability IS its
 * `category`, so the backfill sets `capabilities = ARRAY[category]`. After it,
 * capability lookups (`:cap = ANY(capabilities)`) and the legacy
 * `category = :cap` path agree on every row. `category` itself is untouched:
 * it stays NOT NULL and keeps meaning "primary capability".
 *
 * The column defaults to '{}' rather than being NOT NULL without a default so
 * a still-running old binary (rolling deploy) can keep inserting rows; the
 * application treats an empty array as `[category]` (`resolveCapabilities`)
 * and its queries match on `category` too, so such rows behave exactly like
 * backfilled ones.
 *
 * SCOPE NOTE: `typeorm migration:generate` also emitted unrelated churn —
 * dropping/recreating FKs, indexes and CHECK constraints on
 * `tool_config_profiles`, `jobs`, `discovered_urls`, `workspace_*`, `agent_*`,
 * `asset_group_workflows`, `audit_events` and `IDX_integrations_syncSchedule_syncJobId`.
 * That is pre-existing drift between the entities and the schema (the same
 * drift documented in 1791532946059-AddEventIdToAuditEvents), not part of this
 * change, so it is removed here per the repo's migration rule.
 */
export class AddIntegrationCapabilities1791780166474
  implements MigrationInterface
{
  name = 'AddIntegrationCapabilities1791780166474';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Column. A constant default is a catalog-only change in Postgres 11+,
    //    so this does not rewrite the table.
    await queryRunner.query(
      `ALTER TABLE "integrations" ADD "capabilities" text array NOT NULL DEFAULT '{}'`,
    );

    // 2. Backfill: every existing integration is single-capability, and its
    //    capability is its category. One statement — the table holds a handful
    //    of rows per workspace.
    await queryRunner.query(
      `UPDATE "integrations" SET "capabilities" = ARRAY["category"] WHERE cardinality("capabilities") = 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Lossless for single-capability rows (`category` still holds their only
    // capability). Multi-capability rows keep working as their primary
    // capability only — their extra capabilities are dropped with the column.
    await queryRunner.query(
      `ALTER TABLE "integrations" DROP COLUMN "capabilities"`,
    );
  }
}
