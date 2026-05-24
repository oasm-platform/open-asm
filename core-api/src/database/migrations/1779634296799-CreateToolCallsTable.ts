import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateToolCallsTable1779634296799 implements MigrationInterface {
  name = 'CreateToolCallsTable1779634296799';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "agent_message_tool_calls" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"createdAt" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `"updatedAt" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `"messageId" uuid NOT NULL, ` +
        `"conversationId" uuid NOT NULL, ` +
        `"toolCallId" character varying(255) NOT NULL, ` +
        `"toolName" character varying(255) NOT NULL, ` +
        `"args" jsonb NOT NULL, ` +
        `"result" jsonb, ` +
        `"isError" boolean NOT NULL DEFAULT false, ` +
        `"durationMs" integer, ` +
        `"workerId" uuid, ` +
        `CONSTRAINT "PK_tool_calls" PRIMARY KEY ("id")` +
        `)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_tc_tool_name" ON "agent_message_tool_calls" ("toolName")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_tc_message" ON "agent_message_tool_calls" ("messageId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_tc_conversation" ON "agent_message_tool_calls" ("conversationId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_tc_errors" ON "agent_message_tool_calls" ("isError") WHERE "isError" = TRUE`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_message_tool_calls" ADD CONSTRAINT "FK_tc_message" FOREIGN KEY ("messageId") REFERENCES "agent_messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_message_tool_calls" ADD CONSTRAINT "FK_tc_conversation" FOREIGN KEY ("conversationId") REFERENCES "agent_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "agent_message_tool_calls" DROP CONSTRAINT "FK_tc_conversation"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_message_tool_calls" DROP CONSTRAINT "FK_tc_message"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_tc_errors"`);
    await queryRunner.query(`DROP INDEX "public"."idx_tc_conversation"`);
    await queryRunner.query(`DROP INDEX "public"."idx_tc_message"`);
    await queryRunner.query(`DROP INDEX "public"."idx_tc_tool_name"`);
    await queryRunner.query(`DROP TABLE "agent_message_tool_calls"`);
  }
}
