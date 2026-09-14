import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateToolConfigProfiles1786900000000
  implements MigrationInterface
{
  name = 'CreateToolConfigProfiles1786900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "tool_config_profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" character varying(128) NOT NULL, "config" jsonb NOT NULL DEFAULT '{}', "isDefault" boolean NOT NULL DEFAULT false, "workspaceId" uuid NOT NULL, "toolId" uuid NOT NULL, CONSTRAINT "PK_tool_config_profiles" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_tcp_workspace_tool_name" ON "tool_config_profiles" ("workspaceId", "toolId", "name") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tcp_workspaceId" ON "tool_config_profiles" ("workspaceId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tcp_toolId" ON "tool_config_profiles" ("toolId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "tool_config_profiles" ADD CONSTRAINT "FK_tcp_workspace" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tool_config_profiles" ADD CONSTRAINT "FK_tcp_tool" FOREIGN KEY ("toolId") REFERENCES "tools"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "jobs" ADD COLUMN "configProfileId" uuid NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "jobs" DROP COLUMN "configProfileId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tool_config_profiles" DROP CONSTRAINT "FK_tcp_tool"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tool_config_profiles" DROP CONSTRAINT "FK_tcp_workspace"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_tcp_toolId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_tcp_workspaceId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_tcp_workspace_tool_name"`,
    );
    await queryRunner.query(`DROP TABLE "tool_config_profiles"`);
  }
}
