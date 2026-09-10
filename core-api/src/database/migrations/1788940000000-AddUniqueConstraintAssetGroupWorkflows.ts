import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniqueConstraintAssetGroupWorkflows1788940000000 implements MigrationInterface {
  name = 'AddUniqueConstraintAssetGroupWorkflows1788940000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // First remove duplicates if any exist
    await queryRunner.query(`
      DELETE FROM asset_group_workflows a
      USING asset_group_workflows b
      WHERE a.id > b.id
        AND a."assetGroupId" = b."assetGroupId"
        AND a."workflowId" = b."workflowId"
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_agw_assetGroupId_workflowId" ON "asset_group_workflows" ("assetGroupId", "workflowId")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_agw_assetGroupId_workflowId"`);
  }
}
