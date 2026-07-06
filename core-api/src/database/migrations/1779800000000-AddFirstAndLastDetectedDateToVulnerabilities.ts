import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFirstAndLastDetectedDateToVulnerabilities1779800000000
  implements MigrationInterface
{
  name = 'AddFirstAndLastDetectedDateToVulnerabilities1779800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vulnerabilities"
      ADD COLUMN "firstDetectedDate" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(`
      ALTER TABLE "vulnerabilities"
      ADD COLUMN "lastSeenDate" TIMESTAMP WITH TIME ZONE
    `);

    await queryRunner.query(`
      UPDATE "vulnerabilities"
      SET
        "firstDetectedDate" = "createdAt",
        "lastSeenDate" = "updatedAt"
      WHERE "firstDetectedDate" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vulnerabilities" DROP COLUMN "lastSeenDate"
    `);
    await queryRunner.query(`
      ALTER TABLE "vulnerabilities" DROP COLUMN "firstDetectedDate"
    `);
  }
}
