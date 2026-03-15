import { MigrationInterface, QueryRunner } from "typeorm";

export class AddJobHistoryName1773491841263 implements MigrationInterface {
    name = 'AddJobHistoryName1773491841263'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "job_histories" ADD "jobHistoryName" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "job_histories" DROP COLUMN "jobHistoryName"`);
    }

}
