import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAgentConfigs1791995130867 implements MigrationInterface {
  name = 'AddAgentConfigs1791995130867';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Agent settings per workspace member; agent_llm_configs keeps only the
    // provider connections.
    await queryRunner.query(
      `CREATE TABLE "agent_configs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "workspaceId" uuid NOT NULL, "userId" uuid NOT NULL, "modelsConfig" jsonb NOT NULL DEFAULT '{}', "searchProviders" jsonb NOT NULL DEFAULT '[]', "instruction" text, "maxSteps" integer, "defaultAgentMode" character varying, "defaultApprovalMode" character varying, "disabledTools" jsonb NOT NULL DEFAULT '[]', "responseLanguage" character varying(16), CONSTRAINT "PK_25aa11529ad4eedde0691d59192" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_agent_config_workspace_user" ON "agent_configs" ("workspaceId", "userId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_configs" ADD CONSTRAINT "FK_7e24ab83671700bdc510df490f7" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_configs" ADD CONSTRAINT "FK_8a52df3ca3b1de8945ea7a47f29" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // Backfill: each member's preferred connection becomes their default
    // model, with its limits. Members without one fall back to their oldest
    // connection at runtime.
    await queryRunner.query(
      `INSERT INTO "agent_configs" ("workspaceId", "userId", "modelsConfig", "maxSteps")
       SELECT DISTINCT ON (c."workspaceId", c."userId")
         c."workspaceId",
         c."userId",
         jsonb_build_object('default', jsonb_strip_nulls(jsonb_build_object(
           'llmConfigId', c."id",
           'model', c."model",
           'contextWindow', c."contextWindow",
           'maxOutputTokens', c."maxOutputTokens"
         ))),
         c."maxSteps"
       FROM "agent_llm_configs" c
       WHERE c."isPreferred" = true
       ORDER BY c."workspaceId", c."userId", c."updatedAt" DESC`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_llm_config_workspace_user_pref"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_llm_configs" DROP COLUMN "isPreferred"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_llm_configs" DROP COLUMN "contextWindow"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_llm_configs" DROP COLUMN "maxOutputTokens"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_llm_configs" DROP COLUMN "maxSteps"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "agent_llm_configs" ADD "maxSteps" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_llm_configs" ADD "maxOutputTokens" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_llm_configs" ADD "contextWindow" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_llm_configs" ADD "isPreferred" boolean NOT NULL DEFAULT false`,
    );

    // Restore the preferred flag, model and limits from each member's default
    await queryRunner.query(
      `UPDATE "agent_llm_configs" c
       SET "isPreferred" = true,
           "model" = COALESCE(a."modelsConfig"->'default'->>'model', c."model"),
           "contextWindow" = (a."modelsConfig"->'default'->>'contextWindow')::integer,
           "maxOutputTokens" = (a."modelsConfig"->'default'->>'maxOutputTokens')::integer,
           "maxSteps" = a."maxSteps"
       FROM "agent_configs" a
       WHERE a."workspaceId" = c."workspaceId"
         AND a."userId" = c."userId"
         AND a."modelsConfig"->'default'->>'llmConfigId' = c."id"::text`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_llm_config_workspace_user_pref" ON "agent_llm_configs" ("workspaceId", "userId", "isPreferred")`,
    );

    await queryRunner.query(
      `ALTER TABLE "agent_configs" DROP CONSTRAINT "FK_8a52df3ca3b1de8945ea7a47f29"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_configs" DROP CONSTRAINT "FK_7e24ab83671700bdc510df490f7"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_agent_config_workspace_user"`,
    );
    await queryRunner.query(`DROP TABLE "agent_configs"`);
  }
}
