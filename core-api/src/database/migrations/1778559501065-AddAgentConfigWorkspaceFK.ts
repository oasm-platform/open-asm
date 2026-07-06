import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAgentConfigWorkspaceFK1778559501065 implements MigrationInterface {
    name = 'AddAgentConfigWorkspaceFK1778559501065';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "agent_mcp_configs" ALTER COLUMN "configJson" SET DEFAULT '{"mcpServers":{}}'`);
        
        const mcpConstraintExists = await queryRunner.query(`SELECT 1 FROM pg_constraint WHERE conname = 'FK_c1a0d811acc122c7a93dbb35ff9'`);
        if (mcpConstraintExists.length === 0) {
            await queryRunner.query(`ALTER TABLE "agent_mcp_configs" ADD CONSTRAINT "FK_c1a0d811acc122c7a93dbb35ff9" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        }

        const llmConstraintExists = await queryRunner.query(`SELECT 1 FROM pg_constraint WHERE conname = 'FK_064526304f45578cad3d1d4f98e'`);
        if (llmConstraintExists.length === 0) {
            await queryRunner.query(`ALTER TABLE "agent_llm_configs" ADD CONSTRAINT "FK_064526304f45578cad3d1d4f98e" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "agent_llm_configs" DROP CONSTRAINT "FK_064526304f45578cad3d1d4f98e"`);
        await queryRunner.query(`ALTER TABLE "agent_mcp_configs" DROP CONSTRAINT "FK_c1a0d811acc122c7a93dbb35ff9"`);
        await queryRunner.query(`ALTER TABLE "agent_mcp_configs" ALTER COLUMN "configJson" SET DEFAULT '{"mcpServers": {}}'`);
    }

}
