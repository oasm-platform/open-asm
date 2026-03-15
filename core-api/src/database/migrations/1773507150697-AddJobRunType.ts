import { MigrationInterface, QueryRunner } from "typeorm";

export class AddJobRunType1773507150697 implements MigrationInterface {
    name = 'AddJobRunType1773507150697'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."job_histories_jobruntype_enum" AS ENUM('manual', 'scheduled')`);
        await queryRunner.query(`ALTER TABLE "job_histories" ADD "jobRunType" "public"."job_histories_jobruntype_enum" NOT NULL DEFAULT 'manual'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "job_histories" DROP COLUMN "jobRunType"`);
        await queryRunner.query(`DROP TYPE "public"."job_histories_jobruntype_enum"`);
    }

}
