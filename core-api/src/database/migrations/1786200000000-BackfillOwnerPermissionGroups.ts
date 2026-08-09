import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillOwnerPermissionGroups1786200000000
  implements MigrationInterface
{
  name = 'BackfillOwnerPermissionGroups1786200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Workspaces created before the permission tables existed have no Admin
    // group. Without a backfill every guarded endpoint (configs, api-key,
    // members, invitations, ...) would 403 for them, including their owners.
    await queryRunner.query(
      `INSERT INTO "workspace_permissions" ("id", "workspaceId", "name", "permissions", "isSystem", "createdAt", "updatedAt")
       SELECT gen_random_uuid(), w."id", 'Admin', ARRAY['*']::text[], true, now(), now()
       FROM "workspaces" w
       WHERE NOT EXISTS (
         SELECT 1 FROM "workspace_permissions" wp
         WHERE wp."workspaceId" = w."id" AND wp."name" = 'Admin'
       )`,
    );
    // Link each workspace owner to the freshly seeded Admin group.
    await queryRunner.query(
      `INSERT INTO "workspace_member_permissions" ("id", "memberId", "permissionId", "createdAt")
       SELECT gen_random_uuid(), wm."id", wp."id", now()
       FROM "workspace_members" wm
       JOIN "workspaces" w ON w."id" = wm."workspaceId" AND w."ownerId" = wm."userId"
       JOIN "workspace_permissions" wp ON wp."workspaceId" = w."id" AND wp."isSystem" = true
       WHERE NOT EXISTS (
         SELECT 1 FROM "workspace_member_permissions" wmp
         WHERE wmp."memberId" = wm."id" AND wmp."permissionId" = wp."id"
       )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove only the backfilled system Admin groups (safe no-op on fresh DBs).
    await queryRunner.query(
      `DELETE FROM "workspace_permissions" WHERE "isSystem" = true AND "name" = 'Admin' AND "createdAt" = "updatedAt"`,
    );
  }
}
