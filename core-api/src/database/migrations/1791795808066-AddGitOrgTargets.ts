import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Git organization targets (TargetType.GIT_ORG).
 *
 * All-in-one: every schema change of the feature, in this single migration.
 *
 * - `targets.integrationId` — the SOURCE_CODE integration a GIT_ORG target
 *   syncs its repositories through. ON DELETE SET NULL: removing the
 *   integration keeps the target and its findings; syncing pauses until
 *   another integration is attached. Indexed for that FK action and for
 *   per-integration lookups.
 * - `targets.settings` — GIT_ORG options (includeArchived, includeForks).
 * - `assets.metadata` — repository details on repository assets (provider id,
 *   default branch, visibility…). The provider id is what lets a renamed
 *   repository keep its asset.
 *
 * Every new column is nullable with no backfill: existing DOMAIN / IP / CIDR
 * targets and their assets are untouched and keep working exactly as before.
 * `TargetType` is a varchar column, so GIT_ORG needs no enum change.
 *
 * SCOPE NOTE: `typeorm migration:generate` also emitted the pre-existing
 * entity/schema drift documented in 1791532946059-AddEventIdToAuditEvents
 * (FKs, indexes and CHECK constraints on unrelated tables). It is removed
 * here per the repo's migration rule.
 */
export class AddGitOrgTargets1791795808066 implements MigrationInterface {
  name = 'AddGitOrgTargets1791795808066';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "assets" ADD "metadata" jsonb`);
    await queryRunner.query(`ALTER TABLE "targets" ADD "integrationId" uuid`);
    await queryRunner.query(`ALTER TABLE "targets" ADD "settings" jsonb`);
    await queryRunner.query(
      `CREATE INDEX "IDX_targets_integrationId" ON "targets" ("integrationId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "targets" ADD CONSTRAINT "FK_8ae16e78806538d3ab93574c616" FOREIGN KEY ("integrationId") REFERENCES "integrations"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // GIT_ORG rows cannot exist without these columns; remove them (and,
    // by cascade, their repository assets and findings) before dropping.
    await queryRunner.query(`DELETE FROM "targets" WHERE "type" = 'GIT_ORG'`);
    await queryRunner.query(
      `ALTER TABLE "targets" DROP CONSTRAINT "FK_8ae16e78806538d3ab93574c616"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_targets_integrationId"`);
    await queryRunner.query(`ALTER TABLE "targets" DROP COLUMN "settings"`);
    await queryRunner.query(`ALTER TABLE "targets" DROP COLUMN "integrationId"`);
    await queryRunner.query(`ALTER TABLE "assets" DROP COLUMN "metadata"`);
  }
}
