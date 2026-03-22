import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTargetType1773900000000 implements MigrationInterface {
  name = 'AddTargetType1773900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if this migration has already been executed
    const migrationExists: Array<unknown> = await queryRunner.query(
      `SELECT 1 FROM "migrations" WHERE "name" = $1 LIMIT 1`,
      [this.name],
    );

    if (migrationExists.length > 0) {
      return;
    }

    // Create enum type for target type
    await queryRunner.query(
      `CREATE TYPE "public"."targets_type_enum" AS ENUM('DOMAIN', 'CIDR')`,
    );

    // Add type column to targets table with default value 'DOMAIN'
    await queryRunner.query(
      `ALTER TABLE "targets" ADD "type" "public"."targets_type_enum" NOT NULL DEFAULT 'DOMAIN'`,
    );

    // Insert migration record
    await queryRunner.query(
      `INSERT INTO "migrations" ("timestamp", "name") VALUES ($1, $2)`,
      [1773900000000, this.name],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove type column from targets table
    await queryRunner.query(`ALTER TABLE "targets" DROP COLUMN "type"`);

    // Drop enum type
    await queryRunner.query(`DROP TYPE "public"."targets_type_enum"`);

    // Remove migration record
    await queryRunner.query(
      `DELETE FROM "migrations" WHERE "name" = $1`,
      [this.name],
    );
  }
}
