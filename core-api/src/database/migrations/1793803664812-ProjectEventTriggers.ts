import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Project workflows run on events: a trigger is a cron or an event of the
 * event bridge, and runs record the run whose event started them.
 *
 * All-in-one: the new columns and the backfill, in this single migration.
 *
 * 1. `project_workflow_triggers.event` (varchar, nullable): the event an
 *    `event` trigger runs on. Every `assets_added` row becomes an `event` row
 *    on `project.assets.added`; its settings (`windowMinutes`, `maxAssets`,
 *    `targetTypes`) are those of every event trigger, so `config` stays. The
 *    row keeps its id, state and last fire time, and an open batch (a Redis
 *    set keyed by the trigger id) still fires into it.
 *
 * 2. The workflow files follow: `on.assetsAdded` moves to
 *    `on["project.assets.added"]`, the key the file now uses.
 *
 * 3. `job_histories.causedByRunId` (uuid, nullable, SET NULL when that run is
 *    deleted) and `chainDepth` (int, 0): the run whose event started a run,
 *    and how many event hops that makes, which is what stops workflows from
 *    triggering each other forever. Existing runs started nothing and were
 *    started by nothing, so they stay NULL and 0.
 *
 * `down` keeps the "assets added" triggers and drops the event triggers the
 * old schema has no place for.
 *
 * SCOPE NOTE: `typeorm migration:generate` also emitted the pre-existing drift
 * on `tool_config_profiles`, `jobs`, `discovered_urls`, `workspace_*`,
 * `agent_*`, `audit_events`, `integrations` and `workflows` documented in
 * 1791780166474-AddIntegrationCapabilities. It is removed here.
 */
export class ProjectEventTriggers1793803664812 implements MigrationInterface {
  name = 'ProjectEventTriggers1793803664812';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Event triggers.
    await queryRunner.query(
      `ALTER TABLE "project_workflow_triggers" ADD "event" character varying`,
    );
    await queryRunner.query(`
      UPDATE "project_workflow_triggers"
         SET "type" = 'event', "event" = 'project.assets.added'
       WHERE "type" = 'assets_added'
    `);

    // 2. The file key.
    await queryRunner.query(`
      UPDATE "workflows"
         SET "content" = jsonb_set(
               "content" #- '{on,assetsAdded}',
               '{on,project.assets.added}',
               "content"->'on'->'assetsAdded'
             )
       WHERE jsonb_typeof("content"->'on') = 'object'
         AND "content"->'on' ? 'assetsAdded'
    `);

    // 3. Chains of runs.
    await queryRunner.query(`ALTER TABLE "job_histories" ADD "causedByRunId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "job_histories" ADD "chainDepth" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_job_histories_causedByRunId" ON "job_histories" ("causedByRunId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "job_histories" ADD CONSTRAINT "FK_a1aed19786717aa1c4d4fcfb7b7" FOREIGN KEY ("causedByRunId") REFERENCES "job_histories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "job_histories" DROP CONSTRAINT "FK_a1aed19786717aa1c4d4fcfb7b7"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_job_histories_causedByRunId"`);
    await queryRunner.query(`ALTER TABLE "job_histories" DROP COLUMN "chainDepth"`);
    await queryRunner.query(`ALTER TABLE "job_histories" DROP COLUMN "causedByRunId"`);

    await queryRunner.query(`
      UPDATE "workflows"
         SET "content" = "content" #- '{on,project.run.completed}' #- '{on,vulnerability.detected}'
       WHERE jsonb_typeof("content"->'on') = 'object'
         AND "content"->'on' ?| ARRAY['project.run.completed', 'vulnerability.detected']
    `);
    await queryRunner.query(`
      UPDATE "workflows"
         SET "content" = jsonb_set(
               "content" #- '{on,project.assets.added}',
               '{on,assetsAdded}',
               "content"->'on'->'project.assets.added'
             )
       WHERE jsonb_typeof("content"->'on') = 'object'
         AND "content"->'on' ? 'project.assets.added'
    `);

    await queryRunner.query(`
      DELETE FROM "project_workflow_triggers"
       WHERE "type" = 'event' AND "event" IS DISTINCT FROM 'project.assets.added'
    `);
    await queryRunner.query(`
      UPDATE "project_workflow_triggers"
         SET "type" = 'assets_added'
       WHERE "type" = 'event'
    `);
    await queryRunner.query(
      `ALTER TABLE "project_workflow_triggers" DROP COLUMN "event"`,
    );
  }
}
