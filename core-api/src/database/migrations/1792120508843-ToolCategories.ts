import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Replaces `tools.category` + `tools.targetTypes` with `tools.categories`
 * (jsonb `[{ name, targetTypes }]`): a tool may run in several categories,
 * each with its own target types. The first entry is the default category.
 *
 * Backfill keeps every tool's behaviour: one category, its old target types.
 * `jobs.category` is untouched — it already records the category a job runs.
 *
 * SCOPE NOTE: `task migration:generate` also emitted the pre-existing
 * entity/schema drift (FKs, indexes and CHECK constraints on unrelated tables)
 * and ordered the drop before the add, which would lose every row's category.
 * Only the `tools` statements are kept, reordered around the backfill.
 */
export class ToolCategories1792120508843 implements MigrationInterface {
    name = 'ToolCategories1792120508843'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tools" ADD "categories" jsonb NOT NULL DEFAULT '[]'`);
        await queryRunner.query(`UPDATE "tools" SET "categories" = jsonb_build_array(jsonb_build_object('name', "category", 'targetTypes', to_jsonb("targetTypes")))`);
        await queryRunner.query(`ALTER TABLE "tools" ALTER COLUMN "categories" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "tools" ADD CONSTRAINT "CHK_tools_categories_not_empty" CHECK (jsonb_typeof("categories") = 'array' AND jsonb_array_length("categories") > 0)`);
        await queryRunner.query(`ALTER TABLE "tools" DROP COLUMN "category"`);
        await queryRunner.query(`ALTER TABLE "tools" DROP COLUMN "targetTypes"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Lossy by design: only the default (first) category survives a rollback.
        await queryRunner.query(`ALTER TABLE "tools" ADD "targetTypes" text array NOT NULL DEFAULT '{DOMAIN,IP,CIDR}'`);
        await queryRunner.query(`ALTER TABLE "tools" ADD "category" character varying`);
        await queryRunner.query(`UPDATE "tools" SET "category" = "categories"->0->>'name', "targetTypes" = ARRAY(SELECT jsonb_array_elements_text("categories"->0->'targetTypes'))`);
        await queryRunner.query(`ALTER TABLE "tools" ALTER COLUMN "category" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "tools" DROP CONSTRAINT "CHK_tools_categories_not_empty"`);
        await queryRunner.query(`ALTER TABLE "tools" DROP COLUMN "categories"`);
    }

}
