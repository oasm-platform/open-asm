import { MigrationInterface, QueryRunner } from "typeorm";

export class AddArtifacts1793088593368 implements MigrationInterface {
    name = 'AddArtifacts1793088593368'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "workspace_storage_usage" ("workspaceId" uuid NOT NULL, "quotaBytes" bigint, "usedBytes" bigint NOT NULL DEFAULT '0', "reservedBytes" bigint NOT NULL DEFAULT '0', "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_wsu_quota_nonneg" CHECK ("quotaBytes" IS NULL OR "quotaBytes" >= 0), CONSTRAINT "CHK_wsu_reserved_nonneg" CHECK ("reservedBytes" >= 0), CONSTRAINT "CHK_wsu_used_nonneg" CHECK ("usedBytes" >= 0), CONSTRAINT "PK_5383288b693046e70f095922e85" PRIMARY KEY ("workspaceId"))`);
        await queryRunner.query(`CREATE TABLE "artifact_folders" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "workspaceId" uuid NOT NULL, "parentFolderId" uuid, "name" text NOT NULL, "createdByUserId" uuid, CONSTRAINT "PK_0a67b8bc3105250feb80543b894" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_artifact_folders_workspace_parent" ON "artifact_folders" ("workspaceId", "parentFolderId") `);
        await queryRunner.query(`CREATE TABLE "artifact_shares" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "artifactId" uuid NOT NULL, "userId" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_artifact_shares_artifact_user" UNIQUE ("artifactId", "userId"), CONSTRAINT "PK_d6a4221b2da073cc25a7b1d6e01" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_artifact_shares_user" ON "artifact_shares" ("userId") `);
        await queryRunner.query(`CREATE TABLE "artifacts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "workspaceId" uuid NOT NULL, "parentFolderId" uuid, "createdByUserId" uuid, "source" character varying NOT NULL DEFAULT 'upload', "name" text NOT NULL, "bucket" character varying NOT NULL DEFAULT 'artifacts', "objectKey" text NOT NULL, "mimeType" character varying NOT NULL, "sizeBytes" bigint NOT NULL, "shareType" character varying NOT NULL DEFAULT 'private', "status" character varying NOT NULL DEFAULT 'pending', "metadata" jsonb NOT NULL DEFAULT '{}', "expiresAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_artifacts_bucket_objectKey" UNIQUE ("bucket", "objectKey"), CONSTRAINT "PK_6516bbed3c129918e05c5012edb" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_artifacts_status_expires" ON "artifacts" ("status", "expiresAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_artifacts_workspace_folder" ON "artifacts" ("workspaceId", "parentFolderId") `);
        await queryRunner.query(`CREATE INDEX "IDX_artifacts_creator" ON "artifacts" ("createdByUserId") `);
        await queryRunner.query(`CREATE INDEX "IDX_artifacts_workspace_created" ON "artifacts" ("workspaceId", "createdAt") `);
        await queryRunner.query(`ALTER TABLE "workspace_storage_usage" ADD CONSTRAINT "FK_5383288b693046e70f095922e85" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "artifact_folders" ADD CONSTRAINT "FK_66b2c62fdd35175687109efc008" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "artifact_folders" ADD CONSTRAINT "FK_79425e6131a6b7e89fa1ce5e661" FOREIGN KEY ("parentFolderId") REFERENCES "artifact_folders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "artifact_folders" ADD CONSTRAINT "FK_3d3c0c623d91ad55702afad7886" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "artifact_shares" ADD CONSTRAINT "FK_097eb1828bdb0ba9b2bcf3a6539" FOREIGN KEY ("artifactId") REFERENCES "artifacts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "artifact_shares" ADD CONSTRAINT "FK_63e1597d428bc4ddafb2e9f2589" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "artifacts" ADD CONSTRAINT "FK_02f6c8c3b32471516031067f0c8" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "artifacts" ADD CONSTRAINT "FK_7bdb0c26dfdcbd4839c02d16c2e" FOREIGN KEY ("parentFolderId") REFERENCES "artifact_folders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "artifacts" ADD CONSTRAINT "FK_55fd53b1bd3a069377ebb755bd0" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "artifacts" DROP CONSTRAINT "FK_55fd53b1bd3a069377ebb755bd0"`);
        await queryRunner.query(`ALTER TABLE "artifacts" DROP CONSTRAINT "FK_7bdb0c26dfdcbd4839c02d16c2e"`);
        await queryRunner.query(`ALTER TABLE "artifacts" DROP CONSTRAINT "FK_02f6c8c3b32471516031067f0c8"`);
        await queryRunner.query(`ALTER TABLE "artifact_shares" DROP CONSTRAINT "FK_63e1597d428bc4ddafb2e9f2589"`);
        await queryRunner.query(`ALTER TABLE "artifact_shares" DROP CONSTRAINT "FK_097eb1828bdb0ba9b2bcf3a6539"`);
        await queryRunner.query(`ALTER TABLE "artifact_folders" DROP CONSTRAINT "FK_3d3c0c623d91ad55702afad7886"`);
        await queryRunner.query(`ALTER TABLE "artifact_folders" DROP CONSTRAINT "FK_79425e6131a6b7e89fa1ce5e661"`);
        await queryRunner.query(`ALTER TABLE "artifact_folders" DROP CONSTRAINT "FK_66b2c62fdd35175687109efc008"`);
        await queryRunner.query(`ALTER TABLE "workspace_storage_usage" DROP CONSTRAINT "FK_5383288b693046e70f095922e85"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_artifacts_workspace_created"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_artifacts_creator"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_artifacts_workspace_folder"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_artifacts_status_expires"`);
        await queryRunner.query(`DROP TABLE "artifacts"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_artifact_shares_user"`);
        await queryRunner.query(`DROP TABLE "artifact_shares"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_artifact_folders_workspace_parent"`);
        await queryRunner.query(`DROP TABLE "artifact_folders"`);
        await queryRunner.query(`DROP TABLE "workspace_storage_usage"`);
    }

}
