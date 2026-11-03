import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Projects v2: scope rules, workflow triggers, description and archive.
 *
 * All-in-one: new tables, new columns and the backfills, in this order, in
 * this single migration.
 *
 * 1. `project_scope_rules`: include/exclude lines (target, hostname wildcard,
 *    CIDR, asset) that keep a project's asset list up to date.
 *
 * 2. `project_assets.source` (`manual` | `rule`, default `manual`, so every
 *    existing row stays a hand-picked asset) and `scopeRuleId` (SET NULL).
 *    Duplicate (project, asset) rows are collapsed to the oldest one before the
 *    new unique index, and rows whose project or asset is NULL (orphans no
 *    query can reach) are removed before both columns become NOT NULL, which
 *    the entities already declared.
 *
 * 3. `project_workflow_triggers`: one row per cron schedule or "assets added"
 *    trigger of a project workflow. Every `project_workflows.schedule` that is
 *    not `disabled` becomes an enabled cron trigger that keeps the BullMQ
 *    scheduler id in `schedulerId`, so the repeat jobs already in Redis keep
 *    firing (their payload carries the binding id; the consumer resolves it to
 *    this trigger). `schedule` and `jobId` are then dropped.
 *
 * 4. `job_histories.triggerId` (SET NULL) records which trigger started a
 *    run; `projects.description`, `autoAddAssets` (default true) and
 *    `archivedAt`.
 *
 * SCOPE NOTE: `typeorm migration:generate` also emitted the pre-existing drift
 * on `tool_config_profiles`, `jobs`, `discovered_urls`, `workspace_*`,
 * `agent_*`, `audit_events`, `integrations` and `workflows` documented in
 * 1791780166474-AddIntegrationCapabilities. It is removed here.
 */
export class ProjectsV21793715217978 implements MigrationInterface {
  name = 'ProjectsV21793715217978';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Scope rules.
    await queryRunner.query(
      `CREATE TABLE "project_scope_rules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "projectId" uuid NOT NULL, "mode" character varying NOT NULL, "type" character varying NOT NULL, "value" character varying NOT NULL, CONSTRAINT "PK_8efa422646a6773472c7ccdea5a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_psr_projectId" ON "project_scope_rules" ("projectId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "project_scope_rules" ADD CONSTRAINT "FK_3d246c67d24df308b642d23c0cf" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // 2. Project assets: source, rule link, one row per (project, asset).
    await queryRunner.query(
      `DELETE FROM "project_assets" WHERE "projectId" IS NULL OR "assetId" IS NULL`,
    );
    await queryRunner.query(
      `DELETE FROM "project_assets" a
        USING "project_assets" b
        WHERE a."projectId" = b."projectId"
          AND a."assetId" = b."assetId"
          AND (a."createdAt", a.id::text) > (b."createdAt", b.id::text)`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_assets" ALTER COLUMN "projectId" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_assets" ALTER COLUMN "assetId" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_assets" ADD "source" character varying NOT NULL DEFAULT 'manual'`,
    );
    await queryRunner.query(`ALTER TABLE "project_assets" ADD "scopeRuleId" uuid`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_pa_projectId_assetId" ON "project_assets" ("projectId", "assetId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "project_assets" ADD CONSTRAINT "FK_ae4b4f0cb8271702a3fbec5d9c8" FOREIGN KEY ("scopeRuleId") REFERENCES "project_scope_rules"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    // 3. Workflow triggers, backfilled from the binding's single schedule.
    await queryRunner.query(
      `DELETE FROM "project_workflows" WHERE "projectId" IS NULL OR "workflowId" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_workflows" ALTER COLUMN "projectId" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_workflows" ALTER COLUMN "workflowId" SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "project_workflow_triggers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "projectWorkflowId" uuid NOT NULL, "type" character varying NOT NULL, "cron" character varying, "config" jsonb NOT NULL DEFAULT '{}', "enabled" boolean NOT NULL DEFAULT true, "lastFiredAt" TIMESTAMP WITH TIME ZONE, "schedulerId" character varying, CONSTRAINT "PK_ae68fd543e8610ed1825e573d37" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_pwt_projectWorkflowId" ON "project_workflow_triggers" ("projectWorkflowId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "project_workflow_triggers" ADD CONSTRAINT "FK_c60ef6ae846fec137f4cedca24e" FOREIGN KEY ("projectWorkflowId") REFERENCES "project_workflows"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `INSERT INTO "project_workflow_triggers" ("projectWorkflowId", "type", "cron", "enabled", "schedulerId")
       SELECT pw.id, 'cron', pw."schedule", true, pw."jobId"
         FROM "project_workflows" pw
        WHERE pw."schedule" IS NOT NULL AND pw."schedule" <> 'disabled'`,
    );
    await queryRunner.query(`ALTER TABLE "project_workflows" DROP COLUMN "schedule"`);
    await queryRunner.query(`ALTER TABLE "project_workflows" DROP COLUMN "jobId"`);

    // 4. Run trigger, project description and archive.
    await queryRunner.query(`ALTER TABLE "job_histories" ADD "triggerId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "job_histories" ADD CONSTRAINT "FK_2a60e270a2ff0703122b74d4497" FOREIGN KEY ("triggerId") REFERENCES "project_workflow_triggers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(`ALTER TABLE "projects" ADD "description" text`);
    await queryRunner.query(
      `ALTER TABLE "projects" ADD "autoAddAssets" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "projects" ADD "archivedAt" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 4.
    await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "archivedAt"`);
    await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "autoAddAssets"`);
    await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "description"`);
    await queryRunner.query(
      `ALTER TABLE "job_histories" DROP CONSTRAINT "FK_2a60e270a2ff0703122b74d4497"`,
    );
    await queryRunner.query(`ALTER TABLE "job_histories" DROP COLUMN "triggerId"`);

    // 3. Back to one schedule per binding: its oldest enabled cron trigger.
    //    Other triggers (a second cron, "assets added") have no column to go
    //    back to and are dropped with the table.
    await queryRunner.query(
      `ALTER TABLE "project_workflows" ADD "schedule" character varying NOT NULL DEFAULT 'disabled'`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_workflows" ADD "jobId" character varying`,
    );
    await queryRunner.query(
      `UPDATE "project_workflows" pw
          SET "schedule" = t."cron", "jobId" = t."schedulerId"
         FROM (
           SELECT DISTINCT ON ("projectWorkflowId") "projectWorkflowId", "cron", "schedulerId"
             FROM "project_workflow_triggers"
            WHERE "type" = 'cron' AND "enabled" = true AND "cron" IS NOT NULL
            ORDER BY "projectWorkflowId", "createdAt"
         ) t
        WHERE pw.id = t."projectWorkflowId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_workflow_triggers" DROP CONSTRAINT "FK_c60ef6ae846fec137f4cedca24e"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_pwt_projectWorkflowId"`);
    await queryRunner.query(`DROP TABLE "project_workflow_triggers"`);
    await queryRunner.query(
      `ALTER TABLE "project_workflows" ALTER COLUMN "workflowId" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_workflows" ALTER COLUMN "projectId" DROP NOT NULL`,
    );

    // 2.
    await queryRunner.query(
      `ALTER TABLE "project_assets" DROP CONSTRAINT "FK_ae4b4f0cb8271702a3fbec5d9c8"`,
    );
    await queryRunner.query(`DROP INDEX "public"."UQ_pa_projectId_assetId"`);
    await queryRunner.query(`ALTER TABLE "project_assets" DROP COLUMN "scopeRuleId"`);
    await queryRunner.query(`ALTER TABLE "project_assets" DROP COLUMN "source"`);
    await queryRunner.query(
      `ALTER TABLE "project_assets" ALTER COLUMN "assetId" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_assets" ALTER COLUMN "projectId" DROP NOT NULL`,
    );

    // 1.
    await queryRunner.query(
      `ALTER TABLE "project_scope_rules" DROP CONSTRAINT "FK_3d246c67d24df308b642d23c0cf"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_psr_projectId"`);
    await queryRunner.query(`DROP TABLE "project_scope_rules"`);
  }
}
