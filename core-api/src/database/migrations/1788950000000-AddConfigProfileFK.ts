import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConfigProfileFK1788950000000 implements MigrationInterface {
  name = 'AddConfigProfileFK1788950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Clean up orphaned references
    await queryRunner.query(`
      DELETE FROM jobs j
      WHERE j."configProfileId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM tool_config_profiles p WHERE p.id = j."configProfileId"
        )
    `);
    await queryRunner.query(`
      ALTER TABLE jobs
      ADD CONSTRAINT "FK_jobs_configProfileId"
      FOREIGN KEY ("configProfileId")
      REFERENCES "tool_config_profiles"("id")
      ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE jobs DROP CONSTRAINT "FK_jobs_configProfileId"`,
    );
  }
}
