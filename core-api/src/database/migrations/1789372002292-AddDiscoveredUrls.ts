import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDiscoveredUrls1789372002292 implements MigrationInterface {
  name = 'AddDiscoveredUrls1789372002292';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "discovered_urls" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "url" character varying NOT NULL, "assetServiceId" uuid NOT NULL, "jobHistoryId" uuid, CONSTRAINT "UQ_discovered_urls_service_url" UNIQUE ("assetServiceId", "url"), CONSTRAINT "PK_discovered_urls" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_discovered_urls_service_createdAt" ON "discovered_urls" ("assetServiceId", "createdAt") `,
    );
    await queryRunner.query(
      `ALTER TABLE "discovered_urls" ADD CONSTRAINT "FK_discovered_urls_assetService" FOREIGN KEY ("assetServiceId") REFERENCES "asset_services"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "discovered_urls" ADD CONSTRAINT "FK_discovered_urls_jobHistory" FOREIGN KEY ("jobHistoryId") REFERENCES "job_histories"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "discovered_urls" DROP CONSTRAINT "FK_discovered_urls_jobHistory"`,
    );
    await queryRunner.query(
      `ALTER TABLE "discovered_urls" DROP CONSTRAINT "FK_discovered_urls_assetService"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_discovered_urls_service_createdAt"`,
    );
    await queryRunner.query(`DROP TABLE "discovered_urls"`);
  }
}
