import { MigrationInterface, QueryRunner } from "typeorm";

export class Migrations1780133631172 implements MigrationInterface {
    name = 'Migrations1780133631172'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "agent_message_tool_calls" DROP CONSTRAINT IF EXISTS "FK_tc_conversation"`);
        await queryRunner.query(`ALTER TABLE "agent_message_tool_calls" DROP CONSTRAINT IF EXISTS "FK_tc_message"`);
        await queryRunner.query(`ALTER TABLE "agent_skills" DROP CONSTRAINT IF EXISTS "FK_agent_skills_creator"`);
        await queryRunner.query(`ALTER TABLE "agent_skills" DROP CONSTRAINT IF EXISTS "FK_agent_skills_workspace"`);
        await queryRunner.query(`ALTER TABLE "agent_message_tool_calls" DROP CONSTRAINT IF EXISTS "FK_b5b6958aec65b920b66575a002d"`);
        await queryRunner.query(`ALTER TABLE "agent_message_tool_calls" DROP CONSTRAINT IF EXISTS "FK_2f3c73481a9747ab091a5636651"`);
        await queryRunner.query(`ALTER TABLE "agent_skills" DROP CONSTRAINT IF EXISTS "FK_7114d709fe278c1733cf7cc2058"`);
        await queryRunner.query(`ALTER TABLE "agent_skills" DROP CONSTRAINT IF EXISTS "FK_58774929c8492ab1b70a487ecd8"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_tc_errors"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_agent_workspace_memories_workspaceId"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_agent_skills_workspace_name"`);
        await queryRunner.query(`ALTER TABLE "agent_conversations" DROP COLUMN IF EXISTS "reasoningConfig"`);
        await queryRunner.query(`ALTER TABLE "agent_messages" ADD "parts" jsonb`);
        await queryRunner.query(`ALTER TYPE "public"."notifications_type_enum" RENAME TO "notifications_type_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."notifications_type_enum" AS ENUM('WORKSPACE_CREATED', 'VULNERABILITY_ANALYSIS_COMPLETED', 'ASSET_NEW_DETECT')`);
        await queryRunner.query(`ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "public"."notifications_type_enum" USING "type"::"text"::"public"."notifications_type_enum"`);
        await queryRunner.query(`DROP TYPE "public"."notifications_type_enum_old"`);
        await queryRunner.query(`ALTER TABLE "agent_conversations" ALTER COLUMN "todos" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "agent_skills" ALTER COLUMN "createdAt" SET DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "agent_skills" ALTER COLUMN "updatedAt" SET DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "agent_mcp_configs" ALTER COLUMN "configJson" SET DEFAULT '{"mcpServers":{}}'`);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_5e280da4a9fefee54d1857118d" ON "agent_workspace_memories" ("workspaceId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_5e5ba0e0cf217c3d50b931b59f" ON "agent_skills" ("workspaceId", "name") `);
        await queryRunner.query(`ALTER TABLE "agent_message_tool_calls" ADD CONSTRAINT "FK_b5b6958aec65b920b66575a002d" FOREIGN KEY ("messageId") REFERENCES "agent_messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "agent_message_tool_calls" ADD CONSTRAINT "FK_2f3c73481a9747ab091a5636651" FOREIGN KEY ("conversationId") REFERENCES "agent_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "agent_skills" ADD CONSTRAINT "FK_7114d709fe278c1733cf7cc2058" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "agent_skills" ADD CONSTRAINT "FK_58774929c8492ab1b70a487ecd8" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "agent_skills" DROP CONSTRAINT "FK_58774929c8492ab1b70a487ecd8"`);
        await queryRunner.query(`ALTER TABLE "agent_skills" DROP CONSTRAINT "FK_7114d709fe278c1733cf7cc2058"`);
        await queryRunner.query(`ALTER TABLE "agent_message_tool_calls" DROP CONSTRAINT "FK_2f3c73481a9747ab091a5636651"`);
        await queryRunner.query(`ALTER TABLE "agent_message_tool_calls" DROP CONSTRAINT "FK_b5b6958aec65b920b66575a002d"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5e5ba0e0cf217c3d50b931b59f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5e280da4a9fefee54d1857118d"`);
        await queryRunner.query(`ALTER TABLE "agent_mcp_configs" ALTER COLUMN "configJson" SET DEFAULT '{"mcpServers": {}}'`);
        await queryRunner.query(`ALTER TABLE "agent_skills" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "agent_skills" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "agent_conversations" ALTER COLUMN "todos" DROP NOT NULL`);
        await queryRunner.query(`CREATE TYPE "public"."notifications_type_enum_old" AS ENUM('WORKSPACE_CREATED', 'VULNERABILITY_ANALYSIS_COMPLETED', 'NEW_FINDING_DISCOVERED')`);
        await queryRunner.query(`ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "public"."notifications_type_enum_old" USING "type"::"text"::"public"."notifications_type_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."notifications_type_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."notifications_type_enum_old" RENAME TO "notifications_type_enum"`);
        await queryRunner.query(`ALTER TABLE "agent_messages" DROP COLUMN "parts"`);
        await queryRunner.query(`ALTER TABLE "agent_conversations" ADD "reasoningConfig" jsonb`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_agent_skills_workspace_name" ON "agent_skills" ("name", "workspaceId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_agent_workspace_memories_workspaceId" ON "agent_workspace_memories" ("workspaceId") `);
        await queryRunner.query(`CREATE INDEX "idx_tc_errors" ON "agent_message_tool_calls" ("isError") WHERE ("isError" = true)`);
        await queryRunner.query(`ALTER TABLE "agent_skills" ADD CONSTRAINT "FK_agent_skills_workspace" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "agent_skills" ADD CONSTRAINT "FK_agent_skills_creator" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "agent_message_tool_calls" ADD CONSTRAINT "FK_tc_message" FOREIGN KEY ("messageId") REFERENCES "agent_messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "agent_message_tool_calls" ADD CONSTRAINT "FK_tc_conversation" FOREIGN KEY ("conversationId") REFERENCES "agent_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
