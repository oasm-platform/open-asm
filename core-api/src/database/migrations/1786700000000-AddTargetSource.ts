import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTargetSource1786700000000 implements MigrationInterface {
    name = 'AddTargetSource1786700000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Backfills existing rows to MANUAL.
        await queryRunner.query(`ALTER TABLE "targets" ADD "source" character varying NOT NULL DEFAULT 'MANUAL'`);
        // Explicit backfill: every pre-existing target defaults to MANUAL (belt-and-braces on top of the column DEFAULT).
        await queryRunner.query(`UPDATE "targets" SET "source" = 'MANUAL' WHERE "source" IS NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "targets" DROP COLUMN "source"`);
    }

}
