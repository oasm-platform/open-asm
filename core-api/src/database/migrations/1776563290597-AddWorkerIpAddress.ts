import { MigrationInterface, QueryRunner } from "typeorm";

export class AddWorkerIpAddress1776563290597 implements MigrationInterface {
    name = 'AddWorkerIpAddress1776563290597'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "workers" ADD "ipAddress" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "workers" DROP COLUMN "ipAddress"`);
    }

}
