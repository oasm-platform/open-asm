import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTargetTypeIp1774180600511 implements MigrationInterface {
    name = 'AddTargetTypeIp1774180600511'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."targets_type_enum" RENAME TO "targets_type_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."targets_type_enum" AS ENUM('DOMAIN', 'CIDR', 'IP')`);
        await queryRunner.query(`ALTER TABLE "targets" ALTER COLUMN "type" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "targets" ALTER COLUMN "type" TYPE "public"."targets_type_enum" USING "type"::"text"::"public"."targets_type_enum"`);
        await queryRunner.query(`ALTER TABLE "targets" ALTER COLUMN "type" SET DEFAULT 'DOMAIN'`);
        await queryRunner.query(`DROP TYPE "public"."targets_type_enum_old"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."targets_type_enum_old" AS ENUM('DOMAIN', 'CIDR')`);
        await queryRunner.query(`ALTER TABLE "targets" ALTER COLUMN "type" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "targets" ALTER COLUMN "type" TYPE "public"."targets_type_enum_old" USING "type"::"text"::"public"."targets_type_enum_old"`);
        await queryRunner.query(`ALTER TABLE "targets" ALTER COLUMN "type" SET DEFAULT 'DOMAIN'`);
        await queryRunner.query(`DROP TYPE "public"."targets_type_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."targets_type_enum_old" RENAME TO "targets_type_enum"`);
    }

}
