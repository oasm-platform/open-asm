import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAgentConversationTodos1780800000000
  implements MigrationInterface
{
  name = 'CreateAgentConversationTodos1780800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create the new todos table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_conversation_todos" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "conversationId" uuid NOT NULL,
        "content" text NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'pending',
        "sortOrder" integer NOT NULL DEFAULT 0,
        "version" integer NOT NULL DEFAULT 1,
        CONSTRAINT "PK_agent_conversation_todos" PRIMARY KEY ("id"),
        CONSTRAINT "FK_agent_conv_todo_conversation"
          FOREIGN KEY ("conversationId")
          REFERENCES "agent_conversations"("id") ON DELETE CASCADE
      )
    `);

    // 2. Create indexes
    await queryRunner.query(`
      CREATE INDEX "IDX_agent_conv_todo_conversation"
        ON "agent_conversation_todos" ("conversationId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_agent_conv_todo_status"
        ON "agent_conversation_todos" ("status")
    `);

    // 3. Migrate existing data from jsonb column to new table
    // Uses ordinality to preserve the original array order as sortOrder
    await queryRunner.query(`
      INSERT INTO "agent_conversation_todos"
        ("conversationId", "content", "status", "sortOrder")
      SELECT
        c."id" AS "conversationId",
        (t.item ->> 'content') AS "content",
        COALESCE((t.item ->> 'status'), 'pending') AS "status",
        (t.ordinality - 1) AS "sortOrder"
      FROM "agent_conversations" c,
           jsonb_array_elements(c."todos") WITH ORDINALITY AS t(item, ordinality)
      WHERE c."todos" IS NOT NULL
        AND jsonb_array_length(c."todos") > 0
    `);

    // 4. Drop the old jsonb column
    await queryRunner.query(
      `ALTER TABLE "agent_conversations" DROP COLUMN "todos"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Re-add the jsonb column
    await queryRunner.query(
      `ALTER TABLE "agent_conversations" ADD "todos" jsonb DEFAULT '[]'::jsonb`,
    );

    // 2. Migrate data back to jsonb
    await queryRunner.query(`
      UPDATE "agent_conversations" c
      SET "todos" = (
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id', t."id",
              'content', t."content",
              'status', t."status",
              'updatedAt', to_jsonb(t."updatedAt")
            ) ORDER BY t."sortOrder"
          ),
          '[]'::jsonb
        )
        FROM "agent_conversation_todos" t
        WHERE t."conversationId" = c."id"
      )
    `);

    // 3. Drop the new table
    await queryRunner.query(
      `DROP INDEX "public"."IDX_agent_conv_todo_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_agent_conv_todo_conversation"`,
    );
    await queryRunner.query(`DROP TABLE "agent_conversation_todos"`);
  }
}
