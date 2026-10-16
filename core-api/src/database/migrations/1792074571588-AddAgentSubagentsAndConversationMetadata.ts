import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAgentSubagentsAndConversationMetadata1792074571588 implements MigrationInterface {
    name = 'AddAgentSubagentsAndConversationMetadata1792074571588'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Background subagent tasks (issue #675). The table is also the queue:
        // rows are claimed pending -> in_progress by the in-process drain.
        await queryRunner.query(`CREATE TABLE "agent_subagents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "conversationId" uuid NOT NULL, "name" character varying(100) NOT NULL, "instructionFile" character varying(255) NOT NULL, "task" text NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'pending', "result" text, "error" text, "metadata" jsonb, "deliveredAt" TIMESTAMP, "startedAt" TIMESTAMP, "completedAt" TIMESTAMP, "sortOrder" integer NOT NULL DEFAULT '0', "version" integer NOT NULL, CONSTRAINT "PK_7646b2a04efbd7bc92c01f42f54" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_agent_subagent_status_created" ON "agent_subagents" ("status", "createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_agent_subagent_conversation" ON "agent_subagents" ("conversationId") `);
        await queryRunner.query(`ALTER TABLE "agent_subagents" ADD CONSTRAINT "FK_9ea3972e2de7b54e4f6dea29e70" FOREIGN KEY ("conversationId") REFERENCES "agent_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);

        // Conversation model, context-window usage and token/cost stats.
        // Nullable with no backfill: existing conversations get it on their next turn.
        await queryRunner.query(`ALTER TABLE "agent_conversations" ADD "metadata" jsonb`);

        // Custom agents (@name). Built-in ones ship as builtin-agents/*.md.
        // name is unique per creator in a workspace; workspace-scoped names are
        // unique in the workspace. New table: no existing rows to backfill.
        await queryRunner.query(`CREATE TABLE "agent_definitions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "workspaceId" uuid NOT NULL, "createdBy" uuid NOT NULL, "scope" character varying(20) NOT NULL DEFAULT 'user', "name" character varying(64) NOT NULL, "title" character varying(100), "description" text NOT NULL DEFAULT '', "mode" character varying(20) NOT NULL DEFAULT 'all', "systemPrompt" text NOT NULL DEFAULT '', "metadata" jsonb NOT NULL DEFAULT '{}', CONSTRAINT "PK_8fd934a151ca9ad58c0252979e5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_agent_definition_workspace_name" ON "agent_definitions" ("workspaceId", "name") WHERE "scope" = 'workspace'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_agent_definition_workspace_creator_name" ON "agent_definitions" ("workspaceId", "createdBy", "name") `);
        await queryRunner.query(`ALTER TABLE "agent_definitions" ADD CONSTRAINT "FK_5180429338a76a45fdbbbff0811" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "agent_definitions" ADD CONSTRAINT "FK_8196f67e9a4396006ad3f17669f" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "agent_definitions" DROP CONSTRAINT "FK_8196f67e9a4396006ad3f17669f"`);
        await queryRunner.query(`ALTER TABLE "agent_definitions" DROP CONSTRAINT "FK_5180429338a76a45fdbbbff0811"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_agent_definition_workspace_creator_name"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_agent_definition_workspace_name"`);
        await queryRunner.query(`DROP TABLE "agent_definitions"`);
        await queryRunner.query(`ALTER TABLE "agent_conversations" DROP COLUMN "metadata"`);
        await queryRunner.query(`ALTER TABLE "agent_subagents" DROP CONSTRAINT "FK_9ea3972e2de7b54e4f6dea29e70"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_agent_subagent_conversation"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_agent_subagent_status_created"`);
        await queryRunner.query(`DROP TABLE "agent_subagents"`);
    }

}
