import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropWorkspaceMemberRole1786300000000
  implements MigrationInterface
{
  name = 'DropWorkspaceMemberRole1786300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The legacy role column ('owner'/'member') was superseded by the
    // granular permission-group system. It was converted from an enum to
    // varchar by ConvertEnumColumnsToString and is no longer declared on the
    // entity, so it can be dropped safely.
    await queryRunner.query(
      `ALTER TABLE "workspace_members" DROP COLUMN "role"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workspace_members" ADD "role" character varying NOT NULL DEFAULT 'owner'`,
    );
  }
}
