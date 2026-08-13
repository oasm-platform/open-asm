import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIntegrationSyncScheduleIndex1786600000000 implements MigrationInterface {
  name = 'AddIntegrationSyncScheduleIndex1786600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Composite index backing the two scheduler lookups: the onModuleInit
    // backfill (syncSchedule != 'disabled' AND syncJobId IS NULL) and the
    // removeJobScheduler lookup by persisted repeatJobKey.
    await queryRunner.query(
      `CREATE INDEX "IDX_integrations_syncSchedule_syncJobId" ON "integrations" ("syncSchedule", "syncJobId") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_integrations_syncSchedule_syncJobId"`,
    );
  }
}
