import { MigrationInterface, QueryRunner } from "typeorm";

export class AddWorkerMetadata1776482218991 implements MigrationInterface {
    name = 'AddWorkerMetadata1776482218991'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "workers" ADD "name" character varying`);
        await queryRunner.query(`ALTER TABLE "workers" ADD "os" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "workers" DROP COLUMN "os"`);
        await queryRunner.query(`ALTER TABLE "workers" DROP COLUMN "name"`);
    }

}
