import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAgentTodos1779455022685 implements MigrationInterface {
    name = 'AddAgentTodos1779455022685'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "agent_conversations" ADD "todos" jsonb DEFAULT '[]'::jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "agent_conversations" DROP COLUMN "todos"`);
    }
}
