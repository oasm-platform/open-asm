import { MigrationInterface, QueryRunner } from "typeorm";

export class AgentWorkspaceMemory1778100000000 implements MigrationInterface {
    name = 'AgentWorkspaceMemory1778100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "agent_workspace_memories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "workspaceId" uuid NOT NULL, "content" text NOT NULL DEFAULT '', CONSTRAINT "PK_agent_workspace_memories" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_agent_workspace_memories_workspaceId" ON "agent_workspace_memories" ("workspaceId")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_agent_workspace_memories_workspaceId"`);
        await queryRunner.query(`DROP TABLE "agent_workspace_memories"`);
    }
}
