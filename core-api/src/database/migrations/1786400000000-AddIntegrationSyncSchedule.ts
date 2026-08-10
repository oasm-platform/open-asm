import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIntegrationSyncSchedule1786400000000 implements MigrationInterface {
    name = 'AddIntegrationSyncSchedule1786400000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "integrations" ADD "syncSchedule" character varying NOT NULL DEFAULT 'disabled'`);
        await queryRunner.query(`ALTER TABLE "integrations" ADD "syncJobId" character varying`);
        await queryRunner.query(`ALTER TABLE "integrations" ADD "lastRunAt" TIMESTAMP WITH TIME ZONE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "integrations" DROP COLUMN "lastRunAt"`);
        await queryRunner.query(`ALTER TABLE "integrations" DROP COLUMN "syncJobId"`);
        await queryRunner.query(`ALTER TABLE "integrations" DROP COLUMN "syncSchedule"`);
    }

}
