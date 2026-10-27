import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Records the run that first found each asset and asset service, so a scan can
 * tell which rows it added. Existing rows keep NULL ("found before tracking")
 * and are never reported as new; there is nothing to backfill them from.
 * SET NULL, not CASCADE: deleting a run must not delete what it found.
 */
export class AddJobHistoryToAssets1793092457256 implements MigrationInterface {
    name = 'AddJobHistoryToAssets1793092457256'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "asset_services" ADD "jobHistoryId" uuid`);
        await queryRunner.query(`ALTER TABLE "assets" ADD "jobHistoryId" uuid`);
        await queryRunner.query(`CREATE INDEX "IDX_asset_services_jobHistoryId" ON "asset_services" ("jobHistoryId") `);
        await queryRunner.query(`CREATE INDEX "IDX_assets_jobHistoryId" ON "assets" ("jobHistoryId") `);
        await queryRunner.query(`ALTER TABLE "asset_services" ADD CONSTRAINT "FK_1c3e3697d9a02f78ca2171bc57e" FOREIGN KEY ("jobHistoryId") REFERENCES "job_histories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "assets" ADD CONSTRAINT "FK_b1c7a83ccfba1a77bfa9e0e0057" FOREIGN KEY ("jobHistoryId") REFERENCES "job_histories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "assets" DROP CONSTRAINT "FK_b1c7a83ccfba1a77bfa9e0e0057"`);
        await queryRunner.query(`ALTER TABLE "asset_services" DROP CONSTRAINT "FK_1c3e3697d9a02f78ca2171bc57e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_assets_jobHistoryId"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_asset_services_jobHistoryId"`);
        await queryRunner.query(`ALTER TABLE "assets" DROP COLUMN "jobHistoryId"`);
        await queryRunner.query(`ALTER TABLE "asset_services" DROP COLUMN "jobHistoryId"`);
    }

}
