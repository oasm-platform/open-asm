import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkspaceDEK1785000000000 implements MigrationInterface {
  name = 'AddWorkspaceDEK1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workspaces" ADD COLUMN "dek" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspaces" ADD COLUMN "dekAt" timestamp`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "workspaces" DROP COLUMN "dekAt"`);
    await queryRunner.query(`ALTER TABLE "workspaces" DROP COLUMN "dek"`);
  }
}
