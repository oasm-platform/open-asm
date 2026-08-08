import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWorkspacePermissionTables1786002229271
  implements MigrationInterface
{
  name = 'CreateWorkspacePermissionTables1786002229271';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "workspace_permissions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" text NOT NULL, "permissions" text array NOT NULL DEFAULT '{}', "isSystem" boolean NOT NULL DEFAULT false, "workspaceId" uuid NOT NULL, CONSTRAINT "PK_workspace_permissions" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_wp_workspace_name" ON "workspace_permissions" ("workspaceId", "name") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_wp_workspaceId" ON "workspace_permissions" ("workspaceId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "workspace_member_permissions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "memberId" uuid NOT NULL, "permissionId" uuid NOT NULL, CONSTRAINT "PK_workspace_member_permissions" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_wmp_member_permission" ON "workspace_member_permissions" ("memberId", "permissionId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_wmp_permissionId" ON "workspace_member_permissions" ("permissionId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "workspace_invitations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "email" text NOT NULL, "permissionIds" uuid array NOT NULL DEFAULT '{}', "tokenHash" text NOT NULL, "status" character varying NOT NULL DEFAULT 'pending', "expiresAt" TIMESTAMP NOT NULL, "workspaceId" uuid NOT NULL, "invitedById" uuid, CONSTRAINT "UQ_wi_tokenHash" UNIQUE ("tokenHash"), CONSTRAINT "PK_workspace_invitations" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_wi_workspaceId" ON "workspace_invitations" ("workspaceId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_wi_email" ON "workspace_invitations" ("email") `,
    );
    await queryRunner.query(
      `ALTER TABLE "workspace_permissions" ADD CONSTRAINT "FK_wp_workspace" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspace_member_permissions" ADD CONSTRAINT "FK_wmp_member" FOREIGN KEY ("memberId") REFERENCES "workspace_members"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspace_member_permissions" ADD CONSTRAINT "FK_wmp_permission" FOREIGN KEY ("permissionId") REFERENCES "workspace_permissions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspace_invitations" ADD CONSTRAINT "FK_wi_workspace" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspace_invitations" ADD CONSTRAINT "FK_wi_invitedBy" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    // Prevent duplicate memberships (double-accept race guard)
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_wm_workspace_user_unique" ON "workspace_members" ("workspaceId", "userId") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_wm_workspace_user_unique"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspace_invitations" DROP CONSTRAINT "FK_wi_invitedBy"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspace_invitations" DROP CONSTRAINT "FK_wi_workspace"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspace_member_permissions" DROP CONSTRAINT "FK_wmp_permission"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspace_member_permissions" DROP CONSTRAINT "FK_wmp_member"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspace_permissions" DROP CONSTRAINT "FK_wp_workspace"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_wi_email"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_wi_workspaceId"`);
    await queryRunner.query(`DROP TABLE "workspace_invitations"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_wmp_permissionId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_wmp_member_permission"`);
    await queryRunner.query(`DROP TABLE "workspace_member_permissions"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_wp_workspaceId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_wp_workspace_name"`);
    await queryRunner.query(`DROP TABLE "workspace_permissions"`);
  }
}
