import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `audit_events.eventId` — the CloudEvents id of the stream entry a row
 * was materialized from — so the audit sink can be idempotent.
 *
 * The audit trail is now a VIEW over the event stream rather than a
 * producer-side write, which means the consumer is at-least-once: a crash
 * between the INSERT and the XACK redelivers the entry, and the
 * `ON CONFLICT (eventId) DO NOTHING` upsert is what keeps that from producing a
 * second row. UNIQUE is therefore load-bearing, not an index for its own sake.
 *
 * Existing rows predate the stream and have no upstream id, so they are
 * backfilled with random UUIDs. They are REAL audit history — deleting or
 * rewriting them to look stream-derived would be worse than marking them
 * synthetic — and a random value can never collide with a CloudEvents id.
 *
 * Three steps, in this order, because Postgres cannot add a NOT NULL column
 * with a backfill in one statement: ADD (nullable) → backfill → SET NOT NULL.
 *
 * SCOPE NOTE: `typeorm migration:generate` diffs the whole entity graph and
 * emitted a large amount of unrelated churn here — dropping and recreating FKs,
 * partial indexes and CHECK constraints on `tool_config_profiles`, `jobs`,
 * `discovered_urls`, `workspace_*` and `agent_*`. That churn is pre-existing
 * drift between the entities and the schema (those constraints and indexes are
 * declared in the migrations but not in the entity classes), NOT part of this
 * change. Applying it would rewrite constraints across unrelated tables, so it
 * is removed here; per the repo's migration rule, fixing `up`/`down` INSIDE a
 * freshly generated file is the only permitted edit. The drift is tracked
 * separately and must not be conflated with adding this column.
 *
 * The column is named `eventId` (camelCase) to match every other column in this
 * schema (`workspaceId`, `actorId`, `requestId`, …) and the entity mapping;
 * `event_id` in the plan denotes the same column conceptually.
 */
export class AddEventIdToAuditEvents1791532946059
  implements MigrationInterface
{
  name = 'AddEventIdToAuditEvents1791532946059';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Nullable first — a NOT NULL column cannot be added to a populated
    //    table without a default.
    await queryRunner.query(
      `ALTER TABLE "audit_events" ADD "eventId" uuid`,
    );

    // 2. Backfill the rows that predate the event bus. One statement is safe
    //    here: the audit table is orders of magnitude smaller than the scan
    //    data, and chunking would only add a second pass for no benefit.
    //
    //    The `audit_events_no_modify` trigger blocks every UPDATE, so the
    //    backfill has to raise `app.audit_pii_sweep` — the same escape hatch
    //    `AuditService.pseudonymizeActor` uses, and scoped to this migration
    //    transaction (is_local=true) so it cannot leak into a later one.
    //    Backfilling is the ONE legitimate mutation of an existing audit row:
    //    the column did not exist before, so no history is being rewritten.
    await queryRunner.query(
      `SELECT set_config('app.audit_pii_sweep', 'on', true)`,
    );
    await queryRunner.query(
      `UPDATE "audit_events" SET "eventId" = gen_random_uuid() WHERE "eventId" IS NULL`,
    );
    await queryRunner.query(
      `SELECT set_config('app.audit_pii_sweep', 'off', true)`,
    );

    // 3. Now the column is fully populated, so NOT NULL is safe and UNIQUE
    //    backs the sink's idempotent upsert.
    await queryRunner.query(
      `ALTER TABLE "audit_events" ALTER COLUMN "eventId" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_events" ADD CONSTRAINT "UQ_audit_events_eventId" UNIQUE ("eventId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reversible: dropping the column restores the pre-event-bus schema, and
    // the backfilled ids carry no information that the rows themselves lack.
    await queryRunner.query(
      `ALTER TABLE "audit_events" DROP CONSTRAINT "UQ_audit_events_eventId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_events" DROP COLUMN "eventId"`,
    );
  }
}