import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterWorkersAddRunMode1787721487000
  implements MigrationInterface
{
  name = 'AlterWorkersAddRunMode1787721487000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workers" ADD COLUMN "runMode" varchar NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workers" DROP COLUMN "runMode"`,
    );
  }
}
