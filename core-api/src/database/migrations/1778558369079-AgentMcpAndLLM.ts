import { MigrationInterface, QueryRunner } from 'typeorm';

export class AgentMcpAndLLM1778558369079 implements MigrationInterface {
  name = 'AgentMcpAndLLM1778558369079';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // LLMConfigName
    await queryRunner.query(
      `ALTER TABLE "agent_llm_configs" ADD COLUMN IF NOT EXISTS "name" varchar(255)`,
    );

    // AgentMCPConfig
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "agent_mcp_configs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "workspaceId" uuid NOT NULL, "configJson" jsonb NOT NULL DEFAULT '{"mcpServers":{}}', CONSTRAINT "PK_agent_mcp_configs" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_agent_mcp_configs_workspaceId" ON "agent_mcp_configs" ("workspaceId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // AgentMCPConfig
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_agent_mcp_configs_workspaceId"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_mcp_configs"`);

    // LLMConfigName
    await queryRunner.query(
      `ALTER TABLE "agent_llm_configs" DROP COLUMN IF EXISTS "name"`,
    );
  }
}
