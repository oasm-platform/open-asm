import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Shared notebook of a chat's workflow: the facts, decisions and open issues
 * the main agent and its subagents leave for each other.
 *
 * All-in-one: every schema change of the feature, in this single migration.
 *
 * 1. `agent_workflow_notes` (append-only) references `agent_conversations`
 *    and is deleted with it. `subagentId` and `stepId` are plain uuids (no
 *    FK): a note outlives a scrapped plan step.
 * 2. Index on (`conversationId`, `createdAt`) for the newest-first reads.
 *
 * No backfill: existing chats simply start with an empty notebook. The other
 * new subagent fields (brief, plan step, dependencies, structured result)
 * live in the existing `agent_subagents.metadata` jsonb, so old rows keep
 * working unchanged.
 */
export class AddAgentWorkflowNotes1794301013473 implements MigrationInterface {
  name = 'AddAgentWorkflowNotes1794301013473';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "agent_workflow_notes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "conversationId" uuid NOT NULL, "subagentId" uuid, "stepId" uuid, "kind" character varying(20) NOT NULL, "key" character varying(200), "content" text NOT NULL, "author" character varying(100) NOT NULL, CONSTRAINT "PK_1c7da15424708bb438bc3898621" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_agent_workflow_note_conversation" ON "agent_workflow_notes" ("conversationId", "createdAt") `,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_workflow_notes" ADD CONSTRAINT "FK_fdf4b6d5f2f4d2f9c78d93a0bf6" FOREIGN KEY ("conversationId") REFERENCES "agent_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "agent_workflow_notes" DROP CONSTRAINT "FK_fdf4b6d5f2f4d2f9c78d93a0bf6"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_agent_workflow_note_conversation"`,
    );
    await queryRunner.query(`DROP TABLE "agent_workflow_notes"`);
  }
}
