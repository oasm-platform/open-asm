import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniqueIndexIssuesSource1780637537501
  implements MigrationInterface
{
  name = 'AddUniqueIndexIssuesSource1780637537501';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Delete duplicate open issues, keeping only the newest one per source combo
    await queryRunner.query(`
      DELETE FROM "issues"
      WHERE "id" NOT IN (
        SELECT DISTINCT ON ("sourceType", "sourceId", "workspaceId") "id"
        FROM "issues"
        WHERE "status" = 'open' AND "sourceType" IS NOT NULL AND "sourceId" IS NOT NULL
        ORDER BY "sourceType", "sourceId", "workspaceId", "createdAt" DESC
      )
      AND "status" = 'open'
      AND "sourceType" IS NOT NULL
      AND "sourceId" IS NOT NULL
    `);

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
