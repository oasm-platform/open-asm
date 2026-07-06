import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReportsTable1781200000000 implements MigrationInterface {
  name = 'CreateReportsTable1781200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."reports_type_enum" AS ENUM('SUMMARY', 'VULNERABILITY')`,
    );
    await queryRunner.query(
      `CREATE TABLE "reports" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "type" "public"."reports_type_enum" NOT NULL DEFAULT 'SUMMARY', "path" text NOT NULL, "fileName" text NOT NULL, "workspaceId" uuid NOT NULL, CONSTRAINT "PK_reports" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "reports" ADD CONSTRAINT "FK_reports_workspace" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "reports" ADD CONSTRAINT "FK_reports_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reports" DROP CONSTRAINT "FK_reports_user"`);
    await queryRunner.query(`ALTER TABLE "reports" DROP CONSTRAINT "FK_reports_workspace"`);
    await queryRunner.query(`DROP TABLE "reports"`);
    await queryRunner.query(`DROP TYPE "public"."reports_type_enum"`);
  }
}
