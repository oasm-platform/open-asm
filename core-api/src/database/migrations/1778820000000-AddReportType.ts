import { MigrationInterface, QueryRunner } from "typeorm";

export class AddReportType1778820000000 implements MigrationInterface {
    name = 'AddReportType1778820000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."reports_type_enum" AS ENUM('SUMMARY', 'VULNERABILITY')`);
        await queryRunner.query(`ALTER TABLE "reports" ADD "type" "public"."reports_type_enum" NOT NULL DEFAULT 'SUMMARY'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "reports" DROP COLUMN "type"`);
        await queryRunner.query(`DROP TYPE "public"."reports_type_enum"`);
    }
}
