import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConnectorToolTypeAndUniqueNameType1788000000000 implements MigrationInterface {
  name = 'AddConnectorToolTypeAndUniqueNameType1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add 'connector' to tools_type_enum if the enum still exists (pre-varchar conversion).
    // After 1784014752144 the column is varchar and the enum is dropped, so we must not fail.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regtype('public.tools_type_enum') IS NOT NULL THEN
          IF NOT EXISTS (
            SELECT 1 FROM pg_enum
            WHERE enumlabel = 'connector'
            AND enumtypid = to_regtype('public.tools_type_enum')
          ) THEN
            ALTER TYPE "public"."tools_type_enum" ADD VALUE 'connector';
          END IF;
        END IF;
      END
      $$;
    `);

    // Same for workers_type_enum
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regtype('public.workers_type_enum') IS NOT NULL THEN
          IF NOT EXISTS (
            SELECT 1 FROM pg_enum
            WHERE enumlabel = 'connector'
            AND enumtypid = to_regtype('public.workers_type_enum')
          ) THEN
            ALTER TYPE "public"."workers_type_enum" ADD VALUE 'connector';
          END IF;
        END IF;
      END
      $$;
    `);

    // Drop old unique constraint on tools.name (name is quoted as column)
    // The constraint name from init migration is UQ_d95e4bbca1f6fffc98a6cf12973
    await queryRunner.query(`
      ALTER TABLE "tools" DROP CONSTRAINT IF EXISTS "UQ_d95e4bbca1f6fffc98a6cf12973";
    `);

    // Also drop the new constraint if it already exists (idempotency for re-runs)
    await queryRunner.query(`
      ALTER TABLE "tools" DROP CONSTRAINT IF EXISTS "UQ_tools_name_type";
    `);

    // Create new unique constraint on (name, type) — allows same name across different types (e.g. nuclei builtin vs connector)
    await queryRunner.query(`
      ALTER TABLE "tools" ADD CONSTRAINT "UQ_tools_name_type" UNIQUE ("name", "type");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tools" DROP CONSTRAINT IF EXISTS "UQ_tools_name_type";
    `);

    await queryRunner.query(`
      ALTER TABLE "tools" ADD CONSTRAINT "UQ_d95e4bbca1f6fffc98a6cf12973" UNIQUE ("name");
    `);

    // Note: Postgres does not support removing enum values easily.
    // We leave 'connector' value in the enum; it is backward-compatible.
  }
}
