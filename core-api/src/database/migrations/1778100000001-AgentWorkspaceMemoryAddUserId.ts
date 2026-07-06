import { MigrationInterface, QueryRunner } from "typeorm";

export class AgentWorkspaceMemoryAddUserId1778100000001 implements MigrationInterface {
    name = 'AgentWorkspaceMemoryAddUserId1778100000001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Drop the old unique index on workspaceId only
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_agent_workspace_memories_workspaceId"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_5e280da4a9fefee54d1857118d"`);

        // Add userId column (nullable first to handle existing rows)
        await queryRunner.query(`ALTER TABLE "agent_workspace_memories" ADD "userId" uuid`);

        // Create composite unique index on [workspaceId, userId]
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_agent_workspace_memories_workspaceId_userId" ON "agent_workspace_memories" ("workspaceId", "userId")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop the composite unique index
        await queryRunner.query(`DROP INDEX "IDX_agent_workspace_memories_workspaceId_userId"`);

        // Remove userId column
        await queryRunner.query(`ALTER TABLE "agent_workspace_memories" DROP COLUMN "userId"`);

        // Restore old unique index on workspaceId
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_5e280da4a9fefee54d1857118d" ON "agent_workspace_memories" ("workspaceId")`);
    }
}
