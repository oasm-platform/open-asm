import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniqueIndexIssuesSource1780637537501
  implements MigrationInterface
{
  name = 'AddUniqueIndexIssuesSource1780637537501';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Partial unique index: only enforce uniqueness for OPEN issues
    // This prevents duplicate issues for the same vulnerability in a workspace
    // while allowing new issues after an existing one is closed
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_issues_sourceType_sourceId_workspaceId_open"
      ON "issues" ("sourceType", "sourceId", "workspaceId")
      WHERE "status" = 'open' AND "sourceType" IS NOT NULL AND "sourceId" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_issues_sourceType_sourceId_workspaceId_open"`,
    );
  }
}
