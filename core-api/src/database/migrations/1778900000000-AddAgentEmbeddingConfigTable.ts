import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAgentEmbeddingConfigTable1778900000000
  implements MigrationInterface
{
  name = 'AddAgentEmbeddingConfigTable1778900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."agent_embedding_configs_provider_enum" AS ENUM('openai', 'gemini', 'mistral', 'cohere', 'custom')`,
    );

    await queryRunner.query(
      `CREATE TABLE "agent_embedding_configs" (
        "id"          uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt"   TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"   TIMESTAMP NOT NULL DEFAULT now(),
        "workspaceId" uuid NOT NULL,
        "name"        character varying(255),
        "provider"    "public"."agent_embedding_configs_provider_enum" NOT NULL,
        "apiKey"      text NOT NULL,
        "model"       character varying(255) NOT NULL,
        "apiUrl"      character varying(500),
        "isPreferred" boolean NOT NULL DEFAULT false,
        "createdBy"   uuid NOT NULL,
        CONSTRAINT "PK_agent_embedding_configs" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `ALTER TABLE "agent_embedding_configs"
       ADD CONSTRAINT "FK_agent_embedding_configs_workspaceId"
       FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
       ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "agent_embedding_configs" DROP CONSTRAINT IF EXISTS "FK_agent_embedding_configs_workspaceId"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_embedding_configs"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."agent_embedding_configs_provider_enum"`,
    );
  }
}
