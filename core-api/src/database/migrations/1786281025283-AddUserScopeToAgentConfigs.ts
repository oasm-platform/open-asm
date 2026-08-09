import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserScopeToAgentConfigs1786281025283
  implements MigrationInterface
{
  name = 'AddUserScopeToAgentConfigs1786281025283';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Scope agent LLM configs (and their preferred flag) per workspace member.
    await queryRunner.query(
      `ALTER TABLE "agent_llm_configs" ADD "userId" uuid`,
    );

    // Backfill: assign existing configs to the first member of their workspace.
    await queryRunner.query(
      `UPDATE "agent_llm_configs" c
       SET "userId" = sub."userId"
       FROM (
         SELECT DISTINCT ON (wm."workspaceId") wm."workspaceId", wm."userId"
         FROM "workspace_members" wm
         ORDER BY wm."workspaceId", wm."createdAt" ASC, wm."id" ASC
       ) sub
       WHERE c."workspaceId" = sub."workspaceId" AND c."userId" IS NULL`,
    );

    // Drop configs belonging to workspaces that no longer have any member.
    await queryRunner.query(
      `DELETE FROM "agent_llm_configs" WHERE "userId" IS NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "agent_llm_configs" ALTER COLUMN "userId" SET NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "agent_llm_configs" ADD CONSTRAINT "FK_llm_config_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // Backfill legacy conversations with a missing createdBy.
    await queryRunner.query(
      `UPDATE "agent_conversations" c
       SET "createdBy" = sub."userId"
       FROM (
         SELECT DISTINCT ON (wm."workspaceId") wm."workspaceId", wm."userId"
         FROM "workspace_members" wm
         ORDER BY wm."workspaceId", wm."createdAt" ASC, wm."id" ASC
       ) sub
       WHERE c."workspaceId" = sub."workspaceId" AND c."createdBy" IS NULL`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_llm_config_workspace_pref"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_llm_config_workspace_user_pref" ON "agent_llm_configs" ("workspaceId", "userId", "isPreferred")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_llm_config_workspace_user_pref"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_llm_configs" DROP CONSTRAINT "FK_llm_config_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_llm_configs" DROP COLUMN "userId"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_llm_config_workspace_pref" ON "agent_llm_configs" ("workspaceId", "isPreferred")`,
    );
  }
}
