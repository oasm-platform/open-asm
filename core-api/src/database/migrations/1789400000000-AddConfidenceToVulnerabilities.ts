import { MigrationInterface, QueryRunner } from "typeorm";

export class AddConfidenceToVulnerabilities1789400000000 implements MigrationInterface {
    name = 'AddConfidenceToVulnerabilities1789400000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "vulnerabilities" ADD "confidence" double precision`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "vulnerabilities" DROP COLUMN "confidence"`);
    }

}
