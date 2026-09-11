import { MigrationInterface, QueryRunner } from "typeorm";

export class AddJobConfig1788880791398 implements MigrationInterface {
    name = 'AddJobConfig1788880791398'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "jobs" ADD "config" jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "config"`);
    }

}
