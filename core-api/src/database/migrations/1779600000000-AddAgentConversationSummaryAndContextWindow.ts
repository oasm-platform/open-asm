import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAgentConversationSummaryAndContextWindow1779600000000 implements MigrationInterface {
    name = 'AddAgentConversationSummaryAndContextWindow1779600000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "agent_conversations" ADD "summary" text`);
        await queryRunner.query(`ALTER TABLE "agent_llm_configs" ADD "contextWindow" integer`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "agent_llm_configs" DROP COLUMN "contextWindow"`);
        await queryRunner.query(`ALTER TABLE "agent_conversations" DROP COLUMN "summary"`);
    }
}
