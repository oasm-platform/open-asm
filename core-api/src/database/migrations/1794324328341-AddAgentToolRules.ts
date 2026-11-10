import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAgentToolRules1794324328341 implements MigrationInterface {
    name = 'AddAgentToolRules1794324328341'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "agent_tool_rules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "workspaceId" uuid NOT NULL, "createdBy" uuid, "toolName" character varying(255) NOT NULL, "pattern" text, "isRegex" boolean NOT NULL DEFAULT false, "action" character varying NOT NULL, "priority" integer NOT NULL DEFAULT '0', "enabled" boolean NOT NULL DEFAULT true, "description" character varying(500), CONSTRAINT "PK_071d024ff739d6071fa7057c250" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_1558d6efadbbed6f1a8ca92423" ON "agent_tool_rules" ("workspaceId", "enabled") `);
        await queryRunner.query(`ALTER TABLE "agent_tool_rules" ADD CONSTRAINT "FK_47aa786e3fc76174ca638ac34ab" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "agent_tool_rules" ADD CONSTRAINT "FK_9bf372a1e03511548f064c55f90" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "agent_tool_rules" DROP CONSTRAINT "FK_9bf372a1e03511548f064c55f90"`);
        await queryRunner.query(`ALTER TABLE "agent_tool_rules" DROP CONSTRAINT "FK_47aa786e3fc76174ca638ac34ab"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1558d6efadbbed6f1a8ca92423"`);
        await queryRunner.query(`DROP TABLE "agent_tool_rules"`);
    }

}
