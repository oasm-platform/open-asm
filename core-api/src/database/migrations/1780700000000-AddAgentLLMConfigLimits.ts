import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAgentLLMConfigLimits1780700000000
  implements MigrationInterface
{
  name = 'AddAgentLLMConfigLimits1780700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "agent_llm_configs" ADD "maxOutputTokens" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_llm_configs" ADD "maxSteps" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "agent_llm_configs" DROP COLUMN "maxSteps"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_llm_configs" DROP COLUMN "maxOutputTokens"`,
    );
  }
}
