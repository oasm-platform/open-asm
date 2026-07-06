import { MigrationInterface, QueryRunner } from "typeorm";

export class AgentModes1779276336904 implements MigrationInterface {
    name = 'AgentModes1779276336904'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "workers" ADD "enabledAgentMode" boolean DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "agent_conversations" ADD "agentMode" character varying NOT NULL DEFAULT 'ask'`);
        await queryRunner.query(`ALTER TABLE "agent_mcp_configs" ALTER COLUMN "configJson" SET DEFAULT '{"mcpServers":{}}'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "agent_mcp_configs" ALTER COLUMN "configJson" SET DEFAULT '{"mcpServers": {}}'`);
        await queryRunner.query(`ALTER TABLE "agent_conversations" DROP COLUMN "agentMode"`);
        await queryRunner.query(`ALTER TABLE "workers" DROP COLUMN "enabledAgentMode"`);
    }

}
