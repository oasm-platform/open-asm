import { MigrationInterface, QueryRunner } from "typeorm";

export class Agents1774420796097 implements MigrationInterface {
    name = 'Agents1774420796097'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "agent_conversations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "workspaceId" uuid NOT NULL, "llmConfigId" uuid NOT NULL, "title" character varying(500), "createdBy" uuid NOT NULL, CONSTRAINT "PK_2680ac7af80219a718cf98a1d21" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."agent_messages_role_enum" AS ENUM('user', 'assistant', 'system')`);
        await queryRunner.query(`CREATE TYPE "public"."agent_messages_messagetype_enum" AS ENUM('text', 'thinking', 'error')`);
        await queryRunner.query(`CREATE TABLE "agent_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "conversationId" uuid NOT NULL, "role" "public"."agent_messages_role_enum" NOT NULL, "content" text NOT NULL, "messageType" "public"."agent_messages_messagetype_enum" NOT NULL DEFAULT 'text', "metadata" jsonb, CONSTRAINT "PK_8c7cdeda30e81dba421925df4fe" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."agent_llm_configs_provider_enum" AS ENUM('openai', 'anthropic', 'custom')`);
        await queryRunner.query(`CREATE TABLE "agent_llm_configs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "workspaceId" uuid NOT NULL, "provider" "public"."agent_llm_configs_provider_enum" NOT NULL, "apiKey" text NOT NULL, "model" character varying(255) NOT NULL, "apiUrl" character varying(500), "isPreferred" boolean NOT NULL DEFAULT false, "createdBy" uuid NOT NULL, CONSTRAINT "PK_d66a8802726baef29259d395e5a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "agent_messages" ADD CONSTRAINT "FK_2dcccfcee4a1e60e53059bc7ccf" FOREIGN KEY ("conversationId") REFERENCES "agent_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "agent_messages" DROP CONSTRAINT "FK_2dcccfcee4a1e60e53059bc7ccf"`);
        await queryRunner.query(`DROP TABLE "agent_llm_configs"`);
        await queryRunner.query(`DROP TYPE "public"."agent_llm_configs_provider_enum"`);
        await queryRunner.query(`DROP TABLE "agent_messages"`);
        await queryRunner.query(`DROP TYPE "public"."agent_messages_messagetype_enum"`);
        await queryRunner.query(`DROP TYPE "public"."agent_messages_role_enum"`);
        await queryRunner.query(`DROP TABLE "agent_conversations"`);
    }

}
