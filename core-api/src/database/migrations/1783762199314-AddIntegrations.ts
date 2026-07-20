import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIntegrations1783762199314 implements MigrationInterface {
    name = 'AddIntegrations1783762199314'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "reports" DROP CONSTRAINT "FK_reports_user"`);
        await queryRunner.query(`ALTER TABLE "reports" DROP CONSTRAINT "FK_reports_workspace"`);
        await queryRunner.query(`ALTER TABLE "agent_conversation_todos" DROP CONSTRAINT "FK_agent_conv_todo_conversation"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_issues_sourceType_sourceId_workspaceId_open"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_agent_workspace_memories_workspaceId_userId"`);
        await queryRunner.query(`ALTER TABLE "targets" DROP CONSTRAINT "UQ_targets_workspaceId_value"`);
        await queryRunner.query(`CREATE TABLE "integrations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" text NOT NULL, "description" text, "appType" text NOT NULL, "category" text NOT NULL, "config" jsonb NOT NULL DEFAULT '{}', "workspaceId" uuid NOT NULL, "createdById" uuid, CONSTRAINT "PK_9adcdc6d6f3922535361ce641e8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_integrations_workspace" ON "integrations" ("workspaceId") `);
        await queryRunner.query(`ALTER TABLE "vulnerability_dismissals" DROP COLUMN "reason"`);
        await queryRunner.query(`CREATE TYPE "public"."vulnerability_dismissals_reason_enum" AS ENUM('false_positive', 'used_in_test', 'wont_fix')`);
        await queryRunner.query(`ALTER TABLE "vulnerability_dismissals" ADD "reason" "public"."vulnerability_dismissals_reason_enum" NOT NULL`);
        await queryRunner.query(`DROP INDEX "public"."IDX_vuln_severity_isArchived"`);
        await queryRunner.query(`ALTER TABLE "vulnerabilities" DROP COLUMN "severity"`);
        await queryRunner.query(`CREATE TYPE "public"."vulnerabilities_severity_enum" AS ENUM('info', 'low', 'medium', 'high', 'critical')`);
        await queryRunner.query(`ALTER TABLE "vulnerabilities" ADD "severity" "public"."vulnerabilities_severity_enum" NOT NULL DEFAULT 'info'`);
        await queryRunner.query(`ALTER TABLE "vulnerabilities" DROP COLUMN "analyzeStatus"`);
        await queryRunner.query(`CREATE TYPE "public"."vulnerabilities_analyzestatus_enum" AS ENUM('not_analyzed', 'running', 'done', 'failed')`);
        await queryRunner.query(`ALTER TABLE "vulnerabilities" ADD "analyzeStatus" "public"."vulnerabilities_analyzestatus_enum" NOT NULL DEFAULT 'not_analyzed'`);
        await queryRunner.query(`ALTER TABLE "tools" DROP COLUMN "priority"`);
        await queryRunner.query(`CREATE TYPE "public"."tools_priority_enum" AS ENUM('0', '1', '2', '3', '4')`);
        await queryRunner.query(`ALTER TABLE "tools" ADD "priority" "public"."tools_priority_enum" NOT NULL DEFAULT '4'`);
        await queryRunner.query(`ALTER TABLE "reports" ALTER COLUMN "workspaceId" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "issue_comments" DROP COLUMN "type"`);
        await queryRunner.query(`CREATE TYPE "public"."issue_comments_type_enum" AS ENUM('content', 'open', 'closed')`);
        await queryRunner.query(`ALTER TABLE "issue_comments" ADD "type" "public"."issue_comments_type_enum" NOT NULL DEFAULT 'content'`);
        await queryRunner.query(`ALTER TABLE "agent_conversation_todos" ALTER COLUMN "createdAt" SET DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "agent_conversation_todos" ALTER COLUMN "updatedAt" SET DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "agent_conversation_todos" ALTER COLUMN "version" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "agent_conversations" DROP COLUMN "agentMode"`);
        await queryRunner.query(`CREATE TYPE "public"."agent_conversations_agentmode_enum" AS ENUM('ask', 'agent')`);
        await queryRunner.query(`ALTER TABLE "agent_conversations" ADD "agentMode" "public"."agent_conversations_agentmode_enum" NOT NULL DEFAULT 'ask'`);
        await queryRunner.query(`ALTER TABLE "agent_mcp_configs" ALTER COLUMN "configJson" SET DEFAULT '{"mcpServers":{}}'`);
        await queryRunner.query(`CREATE INDEX "IDX_vuln_severity_isArchived" ON "vulnerabilities" ("severity", "isArchived") `);
        await queryRunner.query(`CREATE INDEX "IDX_issues_sourceType_sourceId_workspaceId_open" ON "issues" ("sourceType", "sourceId", "workspaceId") WHERE status = 'open' AND "sourceType" IS NOT NULL AND "sourceId" IS NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_98ab78321c205ba0fe30e20ab4" ON "agent_workspace_memories" ("workspaceId", "userId") `);
        await queryRunner.query(`ALTER TABLE "targets" ADD CONSTRAINT "UQ_3d91ed433078f0b799a043567dd" UNIQUE ("workspaceId", "value")`);
        await queryRunner.query(`ALTER TABLE "targets" ADD CONSTRAINT "FK_f37efb60f7af40296211b304b5c" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "reports" ADD CONSTRAINT "FK_f5e46ccc68c965651342ae55c94" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "reports" ADD CONSTRAINT "FK_bed415cd29716cd707e9cb3c09c" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "integrations" ADD CONSTRAINT "FK_74b4a6216901cce047e144fc9af" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "integrations" ADD CONSTRAINT "FK_aa987b039fc5a07ca4d254ea405" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "agent_conversation_todos" ADD CONSTRAINT "FK_eb8919516b99069dc4a8a1bb3f0" FOREIGN KEY ("conversationId") REFERENCES "agent_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "agent_workspace_memories" ADD CONSTRAINT "FK_250513368fb835be2e2f4813d8a" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "agent_workspace_memories" DROP CONSTRAINT "FK_250513368fb835be2e2f4813d8a"`);
        await queryRunner.query(`ALTER TABLE "agent_conversation_todos" DROP CONSTRAINT "FK_eb8919516b99069dc4a8a1bb3f0"`);
        await queryRunner.query(`ALTER TABLE "integrations" DROP CONSTRAINT "FK_aa987b039fc5a07ca4d254ea405"`);
        await queryRunner.query(`ALTER TABLE "integrations" DROP CONSTRAINT "FK_74b4a6216901cce047e144fc9af"`);
        await queryRunner.query(`ALTER TABLE "reports" DROP CONSTRAINT "FK_bed415cd29716cd707e9cb3c09c"`);
        await queryRunner.query(`ALTER TABLE "reports" DROP CONSTRAINT "FK_f5e46ccc68c965651342ae55c94"`);
        await queryRunner.query(`ALTER TABLE "targets" DROP CONSTRAINT "FK_f37efb60f7af40296211b304b5c"`);
        await queryRunner.query(`ALTER TABLE "targets" DROP CONSTRAINT "UQ_3d91ed433078f0b799a043567dd"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_98ab78321c205ba0fe30e20ab4"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_issues_sourceType_sourceId_workspaceId_open"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_vuln_severity_isArchived"`);
        await queryRunner.query(`ALTER TABLE "agent_mcp_configs" ALTER COLUMN "configJson" SET DEFAULT '{"mcpServers": {}}'`);
        await queryRunner.query(`ALTER TABLE "agent_conversations" DROP COLUMN "agentMode"`);
        await queryRunner.query(`DROP TYPE "public"."agent_conversations_agentmode_enum"`);
        await queryRunner.query(`ALTER TABLE "agent_conversations" ADD "agentMode" character varying NOT NULL DEFAULT 'ask'`);
        await queryRunner.query(`ALTER TABLE "agent_conversation_todos" ALTER COLUMN "version" SET DEFAULT '1'`);
        await queryRunner.query(`ALTER TABLE "agent_conversation_todos" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "agent_conversation_todos" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "issue_comments" DROP COLUMN "type"`);
        await queryRunner.query(`DROP TYPE "public"."issue_comments_type_enum"`);
        await queryRunner.query(`ALTER TABLE "issue_comments" ADD "type" character varying NOT NULL DEFAULT 'content'`);
        await queryRunner.query(`ALTER TABLE "reports" ALTER COLUMN "workspaceId" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "tools" DROP COLUMN "priority"`);
        await queryRunner.query(`DROP TYPE "public"."tools_priority_enum"`);
        await queryRunner.query(`ALTER TABLE "tools" ADD "priority" integer NOT NULL DEFAULT '4'`);
        await queryRunner.query(`ALTER TABLE "vulnerabilities" DROP COLUMN "analyzeStatus"`);
        await queryRunner.query(`DROP TYPE "public"."vulnerabilities_analyzestatus_enum"`);
        await queryRunner.query(`ALTER TABLE "vulnerabilities" ADD "analyzeStatus" character varying NOT NULL DEFAULT 'not_analyzed'`);
        await queryRunner.query(`ALTER TABLE "vulnerabilities" DROP COLUMN "severity"`);
        await queryRunner.query(`DROP TYPE "public"."vulnerabilities_severity_enum"`);
        await queryRunner.query(`ALTER TABLE "vulnerabilities" ADD "severity" character varying NOT NULL DEFAULT 'info'`);
        await queryRunner.query(`CREATE INDEX "IDX_vuln_severity_isArchived" ON "vulnerabilities" ("isArchived", "severity") `);
        await queryRunner.query(`ALTER TABLE "vulnerability_dismissals" DROP COLUMN "reason"`);
        await queryRunner.query(`DROP TYPE "public"."vulnerability_dismissals_reason_enum"`);
        await queryRunner.query(`ALTER TABLE "vulnerability_dismissals" ADD "reason" character varying NOT NULL`);
        await queryRunner.query(`DROP INDEX "public"."IDX_integrations_workspace"`);
        await queryRunner.query(`DROP TABLE "integrations"`);
        await queryRunner.query(`ALTER TABLE "targets" ADD CONSTRAINT "UQ_targets_workspaceId_value" UNIQUE ("value", "workspaceId")`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_agent_workspace_memories_workspaceId_userId" ON "agent_workspace_memories" ("userId", "workspaceId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_issues_sourceType_sourceId_workspaceId_open" ON "issues" ("sourceId", "sourceType", "workspaceId") WHERE ((status = 'open'::issues_status_enum) AND ("sourceType" IS NOT NULL) AND ("sourceId" IS NOT NULL))`);
        await queryRunner.query(`ALTER TABLE "agent_conversation_todos" ADD CONSTRAINT "FK_agent_conv_todo_conversation" FOREIGN KEY ("conversationId") REFERENCES "agent_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "reports" ADD CONSTRAINT "FK_reports_workspace" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "reports" ADD CONSTRAINT "FK_reports_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
