import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveWorkspaceTargets1783221179738 implements MigrationInterface {
  name = 'RemoveWorkspaceTargets1783221179738';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Add workspaceId column to targets (nullable initially for backfill)
    await queryRunner.query(`ALTER TABLE "targets" ADD "workspaceId" uuid`);

    // Step 2: Create index on workspaceId
    await queryRunner.query(
      `CREATE INDEX "IDX_targets_workspaceId" ON "targets" ("workspaceId")`,
    );

    // Step 3: Backfill workspaceId from workspace_targets
    // If a target exists in multiple workspaces, pick the one with earliest createdAt
    await queryRunner.query(`
      UPDATE "targets" t
      SET "workspaceId" = sub."workspaceId"
      FROM (
        SELECT DISTINCT ON (wt."targetId") wt."targetId", wt."workspaceId"
        FROM "workspace_targets" wt
        ORDER BY wt."targetId", wt."createdAt" ASC
      ) sub
      WHERE t.id = sub."targetId"
    `);

    // Step 4: Make workspaceId NOT NULL (all existing targets should now have a workspaceId)
    // If any targets remain NULL (orphaned), delete them
    await queryRunner.query(`DELETE FROM "targets" WHERE "workspaceId" IS NULL`);
    await queryRunner.query(
      `ALTER TABLE "targets" ALTER COLUMN "workspaceId" SET NOT NULL`,
    );

    // Step 5: Add unique constraint on (workspaceId, value)
    await queryRunner.query(`
      ALTER TABLE "targets"
      ADD CONSTRAINT "UQ_targets_workspaceId_value" UNIQUE ("workspaceId", "value")
    `);

    // Step 6: Drop FK from workspace_targets to targets
    await queryRunner.query(
      `ALTER TABLE "workspace_targets" DROP CONSTRAINT IF EXISTS "FK_168278b842b85e1a002810d707b"`,
    );
    // Drop FK from workspace_targets to workspaces
    await queryRunner.query(
      `ALTER TABLE "workspace_targets" DROP CONSTRAINT IF EXISTS "FK_94d1527f0d73cc42744bc774552"`,
    );
    // Drop index on workspace_targets
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_wt_targetId"`);
    // Drop the junction table
    await queryRunner.query(`DROP TABLE "workspace_targets"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate workspace_targets table
    await queryRunner.query(`
      CREATE TABLE "workspace_targets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "workspaceId" uuid,
        "targetId" uuid,
        CONSTRAINT "UQ_584f07937c6e610d12640c05442" UNIQUE ("workspaceId", "targetId"),
        CONSTRAINT "PK_8cc7ce852abed30e32ec51758ee" PRIMARY KEY ("id")
      )
    `);
    // Recreate FKs
    await queryRunner.query(`
      ALTER TABLE "workspace_targets"
      ADD CONSTRAINT "FK_94d1527f0d73cc42744bc774552"
      FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "workspace_targets"
      ADD CONSTRAINT "FK_168278b842b85e1a002810d707b"
      FOREIGN KEY ("targetId") REFERENCES "targets"("id") ON DELETE CASCADE
    `);
    // Recreate index
    await queryRunner.query(
      `CREATE INDEX "IDX_wt_targetId" ON "workspace_targets" ("targetId")`,
    );

    // Backfill from targets back to workspace_targets
    await queryRunner.query(`
      INSERT INTO "workspace_targets" ("id", "workspaceId", "targetId", "createdAt", "updatedAt")
      SELECT gen_random_uuid(), t."workspaceId", t.id, NOW(), NOW()
      FROM "targets" t
      WHERE t."workspaceId" IS NOT NULL
    `);

    // Drop columns from targets
    await queryRunner.query(
      `ALTER TABLE "targets" DROP CONSTRAINT "UQ_targets_workspaceId_value"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_targets_workspaceId"`);
    await queryRunner.query(`ALTER TABLE "targets" DROP COLUMN "workspaceId"`);
  }
}
