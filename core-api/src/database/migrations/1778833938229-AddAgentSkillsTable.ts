import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAgentSkillsTable1778833938229 implements MigrationInterface {
  name = 'AddAgentSkillsTable1778833938229';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_skills'`,
    );

    if (tableExists.length === 0) {
      // Fresh install: create table with final schema directly
      await queryRunner.query(
        `CREATE TABLE "agent_skills" (
          "id"          uuid NOT NULL DEFAULT uuid_generate_v4(),
          "createdAt"   TIMESTAMP NOT NULL DEFAULT now(),
          "updatedAt"   TIMESTAMP NOT NULL DEFAULT now(),
          "workspaceId" uuid NOT NULL,
          "title"       character varying(500) NOT NULL,
          "description" text NOT NULL,
          "embedding"   text,
          CONSTRAINT "PK_12090b937204870afb85bf39cb8" PRIMARY KEY ("id")
        )`,
      );
    } else {
      // Existing install: migrate from old schema (name/content/category/riskLevel/metadata)
      const titleExists = await queryRunner.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = 'agent_skills' AND column_name = 'title'`,
      );

      if (titleExists.length === 0) {
        await queryRunner.query(`ALTER TABLE "agent_skills" ADD "title" character varying(500)`);
        await queryRunner.query(`ALTER TABLE "agent_skills" ADD "description" text`);
        await queryRunner.query(`UPDATE "agent_skills" SET "title" = "name", "description" = COALESCE("content", '')`);
        await queryRunner.query(`ALTER TABLE "agent_skills" ALTER COLUMN "title" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "agent_skills" ALTER COLUMN "description" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "agent_skills" DROP COLUMN IF EXISTS "name"`);
        await queryRunner.query(`ALTER TABLE "agent_skills" DROP COLUMN IF EXISTS "content"`);
        await queryRunner.query(`ALTER TABLE "agent_skills" DROP COLUMN IF EXISTS "metadata"`);
        await queryRunner.query(`ALTER TABLE "agent_skills" DROP COLUMN IF EXISTS "category"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."agent_skills_category_enum"`);
        await queryRunner.query(`ALTER TABLE "agent_skills" DROP COLUMN IF EXISTS "riskLevel"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."agent_skills_risklevel_enum"`);

        const embeddingCol = await queryRunner.query(
          `SELECT data_type FROM information_schema.columns WHERE table_name = 'agent_skills' AND column_name = 'embedding'`,
        );
        if (embeddingCol.length > 0 && embeddingCol[0].data_type !== 'text') {
          await queryRunner.query(`ALTER TABLE "agent_skills" DROP COLUMN "embedding"`);
          await queryRunner.query(`ALTER TABLE "agent_skills" ADD "embedding" text`);
        }
      }
    }

    await queryRunner.query(
      `ALTER TABLE "agent_mcp_configs" ALTER COLUMN "configJson" SET DEFAULT '{"mcpServers":{}}'`,
    );

    const fkExists = await queryRunner.query(
      `SELECT 1 FROM pg_constraint WHERE conname = 'FK_7114d709fe278c1733cf7cc2058'`,
    );
    if (fkExists.length === 0) {
      await queryRunner.query(
        `ALTER TABLE "agent_skills" ADD CONSTRAINT "FK_7114d709fe278c1733cf7cc2058" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "agent_skills" DROP CONSTRAINT IF EXISTS "FK_7114d709fe278c1733cf7cc2058"`);
    await queryRunner.query(`ALTER TABLE "agent_mcp_configs" ALTER COLUMN "configJson" SET DEFAULT '{"mcpServers": {}}'`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_skills"`);
  }
}
