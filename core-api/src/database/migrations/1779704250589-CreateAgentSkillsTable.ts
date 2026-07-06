import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAgentSkillsTable1779704250589 implements MigrationInterface {
  name = 'CreateAgentSkillsTable1779704250589';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_skills" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "workspaceId" uuid NOT NULL,
        "createdBy" uuid NOT NULL,
        "name" character varying(255) NOT NULL,
        "description" text NOT NULL,
        "content" text NOT NULL,
        "isEnabled" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_agent_skills" PRIMARY KEY ("id"),
        CONSTRAINT "FK_agent_skills_workspace" FOREIGN KEY ("workspaceId")
          REFERENCES "workspaces"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_agent_skills_creator" FOREIGN KEY ("createdBy")
          REFERENCES "users"("id") ON DELETE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_agent_skills_workspace_name"
        ON "agent_skills" ("workspaceId", "name")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_agent_skills_workspace_name"`);
    await queryRunner.query(`DROP TABLE "agent_skills"`);
  }
}
