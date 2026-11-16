import { MigrationInterface, QueryRunner } from "typeorm";

export class AddWorkerEncryptionPublicKey1794815185274 implements MigrationInterface {
    name = 'AddWorkerEncryptionPublicKey1794815185274'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "workers" ADD "encryptionPublicKey" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "workers" DROP COLUMN "encryptionPublicKey"`);
    }

}
