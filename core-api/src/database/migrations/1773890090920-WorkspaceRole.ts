import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkspaceRole1773890090920 implements MigrationInterface {
    name = 'WorkspaceRole1773890090920'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."workspace_members_role_enum" AS ENUM('owner', 'member')`);
        await queryRunner.query(`ALTER TABLE "workspace_members" ADD "role" "public"."workspace_members_role_enum" NOT NULL DEFAULT 'owner'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "workspace_members" DROP COLUMN "role"`);
        await queryRunner.query(`DROP TYPE "public"."workspace_members_role_enum"`);
    }

}
