import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAgentProviders1774515308007 implements MigrationInterface {
    name = 'AddAgentProviders1774515308007'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."agent_llm_configs_provider_enum" RENAME TO "agent_llm_configs_provider_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."agent_llm_configs_provider_enum" AS ENUM('openai', 'openrouter', 'gemini', 'anthropic', 'kilo_code', 'custom')`);
        await queryRunner.query(`ALTER TABLE "agent_llm_configs" ALTER COLUMN "provider" TYPE "public"."agent_llm_configs_provider_enum" USING "provider"::"text"::"public"."agent_llm_configs_provider_enum"`);
        await queryRunner.query(`DROP TYPE "public"."agent_llm_configs_provider_enum_old"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."agent_llm_configs_provider_enum_old" AS ENUM('openai', 'openrouter', 'anthropic', 'custom')`);
        await queryRunner.query(`ALTER TABLE "agent_llm_configs" ALTER COLUMN "provider" TYPE "public"."agent_llm_configs_provider_enum_old" USING "provider"::"text"::"public"."agent_llm_configs_provider_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."agent_llm_configs_provider_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."agent_llm_configs_provider_enum_old" RENAME TO "agent_llm_configs_provider_enum"`);
    }

}
