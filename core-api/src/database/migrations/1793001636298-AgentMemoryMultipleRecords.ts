import { MigrationInterface, QueryRunner } from "typeorm";

export class AgentMemoryMultipleRecords1793001636298 implements MigrationInterface {
    name = 'AgentMemoryMultipleRecords1793001636298'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // One record per memory: drop the unique (workspaceId, userId) index
        // and the workspace-only unique index 1780133631172 recreated, keep a
        // plain index for the per-user lookups. Existing rows stay as they
        // are, one memory each.
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_5e280da4a9fefee54d1857118d"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_98ab78321c205ba0fe30e20ab4"`);
        await queryRunner.query(`CREATE INDEX "IDX_98ab78321c205ba0fe30e20ab4" ON "agent_workspace_memories" ("workspaceId", "userId") `);
        // A blank row is not a memory
        await queryRunner.query(`DELETE FROM "agent_workspace_memories" WHERE btrim("content") = ''`);
        // Per-user memory switch, off by default (existing configs too): the
        // agent saves and reads long-term memories only once a user turns it on
        await queryRunner.query(`ALTER TABLE "agent_configs" ADD "memoryEnabled" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "agent_configs" DROP COLUMN "memoryEnabled"`);
        // Back to one row per user: fold each user's memories into the
        // oldest one, in the order they were saved
        await queryRunner.query(`UPDATE "agent_workspace_memories" m SET "content" = g."content" FROM (SELECT (array_agg("id" ORDER BY "createdAt", "id"))[1] AS "id", string_agg("content", E'\\n\\n' ORDER BY "createdAt", "id") AS "content" FROM "agent_workspace_memories" WHERE "userId" IS NOT NULL GROUP BY "workspaceId", "userId" HAVING count(*) > 1) g WHERE m."id" = g."id"`);
        await queryRunner.query(`DELETE FROM "agent_workspace_memories" m USING "agent_workspace_memories" k WHERE m."workspaceId" = k."workspaceId" AND m."userId" = k."userId" AND (k."createdAt", k."id") < (m."createdAt", m."id")`);
        await queryRunner.query(`DROP INDEX "public"."IDX_98ab78321c205ba0fe30e20ab4"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_98ab78321c205ba0fe30e20ab4" ON "agent_workspace_memories" ("workspaceId", "userId") `);
        // The workspace-only unique index is not restored: it predates the
        // userId column and would fail as soon as two users of a workspace
        // have memories
    }

}
