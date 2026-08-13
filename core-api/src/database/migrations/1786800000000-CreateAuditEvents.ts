import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuditEvents1786800000000 implements MigrationInterface {
  name = 'CreateAuditEvents1786800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // No foreign keys: audit rows must survive deletion of subjects/tenants.
    await queryRunner.query(`
      CREATE TABLE "audit_events" (
        "id"            uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId"   uuid,
        "occurredAt"    timestamptz NOT NULL DEFAULT now(),
        "actorId"       uuid,
        "actorType"     varchar(16) NOT NULL DEFAULT 'user'
                        CONSTRAINT "CHK_ae_actorType" CHECK ("actorType" IN ('user','api_key','system','agent')),
        "actorName"     varchar(255),
        "actorEmail"    varchar(255),
        "action"        varchar(64) NOT NULL,
        "resourceType"  varchar(32) NOT NULL,
        "resourceId"    uuid,
        "outcome"       varchar(8) NOT NULL DEFAULT 'success'
                        CONSTRAINT "CHK_ae_outcome" CHECK ("outcome" IN ('success','failure','denied')),
        "sourceIp"      inet,
        "userAgent"     text,
        "requestId"     uuid,
        "correlationId" uuid,
        "changes"       jsonb NOT NULL DEFAULT '{}',
        "metadata"      jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_audit_events" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_ae_workspace_time" ON "audit_events" ("workspaceId", "occurredAt" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ae_workspace_action" ON "audit_events" ("workspaceId", "action", "occurredAt" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ae_workspace_resource" ON "audit_events" ("workspaceId", "resourceType", "resourceId", "occurredAt" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ae_workspace_actor" ON "audit_events" ("workspaceId", "actorId", "occurredAt" DESC)`,
    );

    // Append-only enforcement with two GUC escape hatches for maintenance jobs:
    // - UPDATE allowed when app.audit_pii_sweep = 'on'  (pseudonymize actor PII)
    // - DELETE allowed when app.audit_retention = 'on'  (90-day retention purge)
    //
    // Fail-closed role gate (code review): the escape hatches additionally
    // require the current user to be a superuser OR a member of the
    // `audit_maintenance` role BEFORE any UPDATE/DELETE is allowed. A missing
    // role (COALESCE(..., false)) denies the bypass — the GUC alone is never
    // sufficient. TRUNCATE has no hatch: it is always blocked.
    //
    // NOTE (ops): CREATE ROLE cannot run inside a transaction, so this
    // migration cannot provision `audit_maintenance` itself. Provision it
    // cluster-wide (e.g. `CREATE ROLE audit_maintenance NOLOGIN`) and GRANT it
    // to the application DB user — otherwise retention deletes and PII sweeps
    // fail unless the app connects as a superuser.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "block_audit_mutation"() RETURNS trigger AS $$
      DECLARE
        is_maintenance boolean := COALESCE(
          pg_has_role(current_user, (SELECT oid FROM pg_roles WHERE rolname = 'audit_maintenance'), 'MEMBER'),
          false
        );
        is_superuser boolean := (SELECT rolsuper FROM pg_roles WHERE rolname = current_user);
      BEGIN
        IF TG_OP = 'UPDATE' AND current_setting('app.audit_pii_sweep', true) = 'on'
           AND (is_superuser OR is_maintenance) THEN
          RETURN NEW;
        END IF;
        IF TG_OP = 'DELETE' AND current_setting('app.audit_retention', true) = 'on'
           AND (is_superuser OR is_maintenance) THEN
          RETURN OLD;
        END IF;
        RAISE EXCEPTION 'audit_events is append-only: % is forbidden', TG_OP;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await queryRunner.query(`
      CREATE TRIGGER "audit_events_no_modify"
        BEFORE UPDATE OR DELETE OR TRUNCATE ON "audit_events"
        FOR EACH STATEMENT EXECUTE FUNCTION "block_audit_mutation"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "audit_events_no_modify" ON "audit_events"`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS "block_audit_mutation"()`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ae_workspace_actor"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ae_workspace_resource"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ae_workspace_action"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ae_workspace_time"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_events"`);
  }
}
