import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Code-finding fields on `vulnerabilities`, reported by repository scanners
 * (connectors with targetTypes: [git_org]): the line range within
 * `filePath` (which already exists), the commit the finding was seen in, and
 * for dependency findings the package with its installed and fixed versions.
 *
 * All-in-one: every schema change of the feature, in this single migration.
 *
 * Every column is nullable with no backfill: host findings never carry these
 * fields and existing rows are untouched. Deduplication of host findings is
 * unchanged too (same fingerprint formula); only findings on repository
 * assets add the connector's own fingerprint to the key.
 *
 * SCOPE NOTE: `typeorm migration:generate` also emitted the pre-existing
 * entity/schema drift documented in 1791532946059-AddEventIdToAuditEvents
 * (FKs, indexes and CHECK constraints on unrelated tables). It is removed
 * here per the repo's migration rule.
 */
export class AddCodeFindingFields1791797618566 implements MigrationInterface {
  name = 'AddCodeFindingFields1791797618566';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "vulnerabilities" ADD "lineStart" integer`);
    await queryRunner.query(`ALTER TABLE "vulnerabilities" ADD "lineEnd" integer`);
    await queryRunner.query(`ALTER TABLE "vulnerabilities" ADD "commit" character varying`);
    await queryRunner.query(`ALTER TABLE "vulnerabilities" ADD "packageName" character varying`);
    await queryRunner.query(`ALTER TABLE "vulnerabilities" ADD "installedVersion" character varying`);
    await queryRunner.query(`ALTER TABLE "vulnerabilities" ADD "fixedVersion" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "vulnerabilities" DROP COLUMN "fixedVersion"`);
    await queryRunner.query(`ALTER TABLE "vulnerabilities" DROP COLUMN "installedVersion"`);
    await queryRunner.query(`ALTER TABLE "vulnerabilities" DROP COLUMN "packageName"`);
    await queryRunner.query(`ALTER TABLE "vulnerabilities" DROP COLUMN "commit"`);
    await queryRunner.query(`ALTER TABLE "vulnerabilities" DROP COLUMN "lineEnd"`);
    await queryRunner.query(`ALTER TABLE "vulnerabilities" DROP COLUMN "lineStart"`);
  }
}
