import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `tools.targetTypes` — the target types whose assets a tool may scan.
 * Job creation only selects assets of these target types, so a host scanner
 * never receives a repository (and vice versa) whichever workflow runs it.
 *
 * All-in-one: column + backfill, in this single migration.
 *
 * Every existing tool scans hosts, so the column defaults to
 * {DOMAIN,IP,CIDR}: existing rows keep exactly their current behaviour.
 * The one built-in that is domain-only today, `subfinder`, is narrowed here so
 * the rule holds before the first tool sync runs; the sync then keeps built-in
 * values (built-in-tools.ts) and connector values (manifest `targetTypes`)
 * up to date.
 *
 * SCOPE NOTE: `typeorm migration:generate` also emitted the pre-existing
 * entity/schema drift documented in 1791532946059-AddEventIdToAuditEvents
 * (FKs, indexes and CHECK constraints on unrelated tables). It is removed
 * here per the repo's migration rule.
 */
export class AddToolTargetTypes1791794631981 implements MigrationInterface {
  name = 'AddToolTargetTypes1791794631981';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Column. A constant default is catalog-only in Postgres 11+, so every
    //    existing row reads {DOMAIN,IP,CIDR} without a table rewrite.
    await queryRunner.query(
      `ALTER TABLE "tools" ADD "targetTypes" text array NOT NULL DEFAULT '{DOMAIN,IP,CIDR}'`,
    );

    // 2. Backfill the only built-in that must not run on IP/CIDR targets.
    await queryRunner.query(
      `UPDATE "tools" SET "targetTypes" = '{DOMAIN}' WHERE "name" = 'subfinder' AND "type" = 'built_in'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tools" DROP COLUMN "targetTypes"`);
  }
}
