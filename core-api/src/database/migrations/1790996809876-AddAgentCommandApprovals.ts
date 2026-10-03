import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAgentCommandApprovals1790996809876 implements MigrationInterface {
  name = 'AddAgentCommandApprovals1790996809876';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "agent_command_approvals" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "workspaceId" uuid NOT NULL, "conversationId" uuid, "toolCallId" character varying(255), "command" text NOT NULL, "hash" character varying(64) NOT NULL, "status" character varying NOT NULL DEFAULT 'pending', CONSTRAINT "PK_0b51749061f151b3d3e57a5018b" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_agent_cmd_approval_workspace" ON "agent_command_approvals" ("workspaceId") `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_agent_cmd_approval_user_hash" ON "agent_command_approvals" ("userId", "hash") `);
    await queryRunner.query(`ALTER TABLE "agent_conversations" ADD "approvalMode" character varying NOT NULL DEFAULT 'manual'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "agent_conversations" DROP COLUMN "approvalMode"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_agent_cmd_approval_user_hash"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_agent_cmd_approval_workspace"`);
    await queryRunner.query(`DROP TABLE "agent_command_approvals"`);
  }
}
