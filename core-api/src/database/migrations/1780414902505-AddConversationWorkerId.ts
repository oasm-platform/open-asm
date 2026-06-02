import { MigrationInterface, QueryRunner } from "typeorm";

export class AddConversationWorkerId1780414902505 implements MigrationInterface {
    name = 'AddConversationWorkerId1780414902505'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "agent_conversations" ADD "workerId" uuid`);
        await queryRunner.query(`ALTER TABLE "agent_mcp_configs" ALTER COLUMN "configJson" SET DEFAULT '{"mcpServers":{}}'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "agent_mcp_configs" ALTER COLUMN "configJson" SET DEFAULT '{"mcpServers": {}}'`);
        await queryRunner.query(`ALTER TABLE "agent_conversations" DROP COLUMN "workerId"`);
    }

}
