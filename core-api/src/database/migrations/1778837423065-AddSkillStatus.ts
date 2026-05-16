import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSkillStatus1778837423065 implements MigrationInterface {
    name = 'AddSkillStatus1778837423065'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."agent_skills_status_enum" AS ENUM('active', 'inactive')`);
        await queryRunner.query(`ALTER TABLE "agent_skills" ADD "status" "public"."agent_skills_status_enum" NOT NULL DEFAULT 'active'`);
        await queryRunner.query(`ALTER TABLE "agent_mcp_configs" ALTER COLUMN "configJson" SET DEFAULT '{"mcpServers":{}}'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "agent_mcp_configs" ALTER COLUMN "configJson" SET DEFAULT '{"mcpServers": {}}'`);
        await queryRunner.query(`ALTER TABLE "agent_skills" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."agent_skills_status_enum"`);
    }

}
