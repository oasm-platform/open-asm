import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationRef1786500000000 implements MigrationInterface {
  name = 'AddNotificationRef1786500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ref/refId let callers tag a notification with the feature it belongs
    // to (e.g. ref='target', refId='1234') and later delete all related
    // notifications with a single lookup instead of tracking ids.
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "ref" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "refId" character varying`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_ref" ON "notifications" ("ref", "refId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_notifications_ref"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "refId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "ref"`,
    );
  }
}
