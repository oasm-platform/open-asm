import { MigrationInterface, QueryRunner } from "typeorm";

export class VulAnalyze1775363502747 implements MigrationInterface {
    name = 'VulAnalyze1775363502747'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "vulnerabilities" ADD "analyzeStatus" character varying NOT NULL DEFAULT 'not_analyzed'`);
        await queryRunner.query(`ALTER TABLE "vulnerabilities" ADD "analyzeResult" character varying`);
        await queryRunner.query(`ALTER TABLE "agent_messages" DROP CONSTRAINT "FK_2dcccfcee4a1e60e53059bc7ccf"`);
        await queryRunner.query(`ALTER TABLE "agent_conversations" ALTER COLUMN "id" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "agent_messages" ADD CONSTRAINT "FK_2dcccfcee4a1e60e53059bc7ccf" FOREIGN KEY ("conversationId") REFERENCES "agent_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "agent_messages" DROP CONSTRAINT "FK_2dcccfcee4a1e60e53059bc7ccf"`);
        await queryRunner.query(`ALTER TABLE "agent_conversations" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "agent_messages" ADD CONSTRAINT "FK_2dcccfcee4a1e60e53059bc7ccf" FOREIGN KEY ("conversationId") REFERENCES "agent_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "vulnerabilities" DROP COLUMN "analyzeResult"`);
        await queryRunner.query(`ALTER TABLE "vulnerabilities" DROP COLUMN "analyzeStatus"`);
    }

}
