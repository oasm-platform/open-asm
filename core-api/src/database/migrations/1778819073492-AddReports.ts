import { MigrationInterface, QueryRunner } from "typeorm";

export class AddReports1778819073492 implements MigrationInterface {
    name = 'AddReports1778819073492'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_agent_workspace_memories_workspaceId"`);
        await queryRunner.query(`CREATE TABLE "reports" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "path" text NOT NULL, "fileName" text NOT NULL, "workspaceId" uuid, CONSTRAINT "PK_d9013193989303580053c0b5ef6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "agent_mcp_configs" ALTER COLUMN "configJson" SET DEFAULT '{"mcpServers":{}}'`);
        await queryRunner.query(`ALTER TYPE "public"."notifications_type_enum" RENAME TO "notifications_type_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."notifications_type_enum" AS ENUM('WORKSPACE_CREATED', 'VULNERABILITY_ANALYSIS_COMPLETED')`);
        await queryRunner.query(`ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "public"."notifications_type_enum" USING "type"::"text"::"public"."notifications_type_enum"`);
        await queryRunner.query(`DROP TYPE "public"."notifications_type_enum_old"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_5e280da4a9fefee54d1857118d" ON "agent_workspace_memories" ("workspaceId") `);
        await queryRunner.query(`ALTER TABLE "reports" ADD CONSTRAINT "FK_f5e46ccc68c965651342ae55c94" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "reports" ADD CONSTRAINT "FK_bed415cd29716cd707e9cb3c09c" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "reports" DROP CONSTRAINT "FK_bed415cd29716cd707e9cb3c09c"`);
        await queryRunner.query(`ALTER TABLE "reports" DROP CONSTRAINT "FK_f5e46ccc68c965651342ae55c94"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5e280da4a9fefee54d1857118d"`);
        await queryRunner.query(`CREATE TYPE "public"."notifications_type_enum_old" AS ENUM('WORKSPACE_CREATED', 'VULNERABILITY_ANALYSIS_COMPLETED', 'NEW_FINDING_DISCOVERED')`);
        await queryRunner.query(`ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "public"."notifications_type_enum_old" USING "type"::"text"::"public"."notifications_type_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."notifications_type_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."notifications_type_enum_old" RENAME TO "notifications_type_enum"`);
        await queryRunner.query(`ALTER TABLE "agent_mcp_configs" ALTER COLUMN "configJson" SET DEFAULT '{"mcpServers": {}}'`);
        await queryRunner.query(`DROP TABLE "reports"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_agent_workspace_memories_workspaceId" ON "agent_workspace_memories" ("workspaceId") `);
    }

}
