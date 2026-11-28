import { MigrationInterface, QueryRunner } from "typeorm";

export class AddReportSchedules1795739521702 implements MigrationInterface {
    name = 'AddReportSchedules1795739521702'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "report_schedules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "workspaceId" uuid NOT NULL, "userId" uuid NOT NULL, "type" character varying NOT NULL, "options" jsonb NOT NULL DEFAULT '{}', "cron" character varying NOT NULL, CONSTRAINT "PK_603f9cdaaf4c1193d7399c1e79c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "reports" ADD "artifactId" uuid`);
        await queryRunner.query(`ALTER TABLE "reports" ADD CONSTRAINT "FK_ddf7882a23d4322922bc3ffd387" FOREIGN KEY ("artifactId") REFERENCES "artifacts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "report_schedules" ADD CONSTRAINT "FK_0b693365729fd43e818a33f0111" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "report_schedules" ADD CONSTRAINT "FK_f2cde4e0c64377e81060ec92157" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "report_schedules" DROP CONSTRAINT "FK_f2cde4e0c64377e81060ec92157"`);
        await queryRunner.query(`ALTER TABLE "report_schedules" DROP CONSTRAINT "FK_0b693365729fd43e818a33f0111"`);
        await queryRunner.query(`ALTER TABLE "reports" DROP CONSTRAINT "FK_ddf7882a23d4322922bc3ffd387"`);
        await queryRunner.query(`ALTER TABLE "reports" DROP COLUMN "artifactId"`);
        await queryRunner.query(`DROP TABLE "report_schedules"`);
    }

}
