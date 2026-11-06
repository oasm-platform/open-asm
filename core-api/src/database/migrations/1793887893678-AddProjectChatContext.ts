import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A chat can be about a project, and the project carries what that chat
 * reads as context.
 *
 * All-in-one: every change of the feature, in this single migration.
 *
 * 1. `agent_conversations.projectId` (uuid, nullable, indexed) references
 *    `projects`; the chat's data tools then stay inside that project.
 *    Deleting the project deletes its chats (their messages, plans and
 *    subagents cascade from the chat).
 * 2. `projects.instruction` (varchar(2000), nullable): what an agent chatting
 *    about the project must follow, edited in the project settings.
 * 3. `project_artifacts`: the files (workspace artifacts, so the workspace
 *    quota) attached to a project, one row per (project, artifact). Deleting
 *    either side drops the row.
 * 4. `agent_llm_configs.reasoningEffort` (varchar(20), nullable): the effort
 *    picked for the connection's model in the chat model picker.
 * 5. `agent_configs.defaultReasoningEffort` (varchar(20), nullable): the
 *    effort set in the agent settings for models with none picked.
 *
 * Existing conversations, projects, connections and settings stay null /
 * without files, i.e. as before (models run at the provider default effort),
 * so there is nothing to backfill.
 */
export class AddProjectChatContext1793887893678 implements MigrationInterface {
  name = 'AddProjectChatContext1793887893678';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "agent_conversations" ADD "projectId" uuid`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_agent_conv_projectId" ON "agent_conversations" ("projectId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_conversations" ADD CONSTRAINT "FK_b21bc8d32df378732c6c7d00463" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "projects" ADD "instruction" character varying(2000)`,
    );

    await queryRunner.query(
      `ALTER TABLE "agent_llm_configs" ADD "reasoningEffort" character varying(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_configs" ADD "defaultReasoningEffort" character varying(20)`,
    );

    await queryRunner.query(
      `CREATE TABLE "project_artifacts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "projectId" uuid NOT NULL, "artifactId" uuid NOT NULL, CONSTRAINT "UQ_project_artifacts_projectId_artifactId" UNIQUE ("projectId", "artifactId"), CONSTRAINT "PK_bf8e108132fdb9323183cea0ced" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_project_artifacts_artifactId" ON "project_artifacts" ("artifactId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "project_artifacts" ADD CONSTRAINT "FK_5de27cb7b729f9aaec396a768ee" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_artifacts" ADD CONSTRAINT "FK_c04b1cf08eec361deff4388c04c" FOREIGN KEY ("artifactId") REFERENCES "artifacts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "agent_configs" DROP COLUMN "defaultReasoningEffort"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_llm_configs" DROP COLUMN "reasoningEffort"`,
    );

    await queryRunner.query(
      `ALTER TABLE "project_artifacts" DROP CONSTRAINT "FK_c04b1cf08eec361deff4388c04c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_artifacts" DROP CONSTRAINT "FK_5de27cb7b729f9aaec396a768ee"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_project_artifacts_artifactId"`,
    );
    await queryRunner.query(`DROP TABLE "project_artifacts"`);

    await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "instruction"`);

    await queryRunner.query(
      `ALTER TABLE "agent_conversations" DROP CONSTRAINT "FK_b21bc8d32df378732c6c7d00463"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_agent_conv_projectId"`);
    await queryRunner.query(
      `ALTER TABLE "agent_conversations" DROP COLUMN "projectId"`,
    );
  }
}
