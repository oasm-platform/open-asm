import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Feature settings live in one jsonb column, one object per section, so a new
 * setting needs no migration: system-wide on `system_configs`, per workspace
 * on `workspaces`. Existing rows get `{}` from the default and read every
 * section's defaults from code.
 */
export class AddSystemConfigSettings1793362431901 implements MigrationInterface {
    name = 'AddSystemConfigSettings1793362431901'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "workspaces" ADD "settings" jsonb NOT NULL DEFAULT '{}'`);
        await queryRunner.query(`ALTER TABLE "system_configs" ADD "settings" jsonb NOT NULL DEFAULT '{}'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "system_configs" DROP COLUMN "settings"`);
        await queryRunner.query(`ALTER TABLE "workspaces" DROP COLUMN "settings"`);
    }

}
