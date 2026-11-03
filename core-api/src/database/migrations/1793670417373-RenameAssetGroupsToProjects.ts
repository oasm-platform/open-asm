import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Renames asset groups to projects and records which project found each
 * vulnerability.
 *
 * All-in-one: renames, new provenance columns/table and the backfills, in this
 * order, in this single migration.
 *
 * 1. Renames, never drop + create: `asset_groups` → `projects`,
 *    `assets_group_assets` → `project_assets`, `asset_group_workflows` →
 *    `project_workflows`, and `assetGroupId` → `projectId` on both join
 *    tables. Row ids are kept, so `project_workflows.jobId` (the BullMQ repeat
 *    key) and the `id` carried by every scheduled job still resolve; the queue
 *    name itself is unchanged on purpose. PK/FK/UQ constraints and indexes are
 *    renamed to the names TypeORM derives for the new tables, so the entities
 *    and the schema agree.
 *
 * 2. Provenance: `job_histories.projectId` / `projectWorkflowId` (nullable,
 *    SET NULL) tag runs started by a project, and `project_vulnerabilities`
 *    holds one row per (project, vulnerability) with the first/last run that
 *    reported it. A vulnerability row is shared by the whole workspace while
 *    an asset can sit in several projects, so the link cannot live on
 *    `vulnerabilities`.
 *
 * 3. Backfills, so existing data keeps working:
 *    - permission keys `group.read|write` → `project.read|write` in
 *      `workspace_permissions`, otherwise custom groups lose project access;
 *    - audit rows are NOT rewritten: `audit_events` is append-only
 *      (`block_audit_mutation` trigger, 1786800000000-CreateAuditEvents), so
 *      entries written before this keep `asset_group.created|deleted`;
 *    - past project runs are tagged only when the match is unambiguous: the
 *      run's workflow belongs to exactly one project whose name equals the run
 *      name (project runs are named after the project) and the run is not
 *      target-scoped. Anything else stays NULL ("unknown project"), e.g. runs
 *      of a project renamed since;
 *    - `project_vulnerabilities` is seeded from `vulnerabilities.jobHistoryId`
 *      for those tagged runs. Older data only knows the run that first found a
 *      vulnerability, so first = last seen and timesSeen = 1.
 *
 * SCOPE NOTE: `typeorm migration:generate` emitted CREATE TABLE for the new
 * names (which would have lost every row) plus unrelated churn on
 * `tool_config_profiles`, `jobs`, `discovered_urls`, `workspace_*`,
 * `agent_*`, `audit_events`, `integrations` and `workflows` indexes. That is
 * the pre-existing drift documented in 1791780166474-AddIntegrationCapabilities,
 * so it is removed here. Same for `project_workflows.projectId/workflowId`
 * being nullable in the schema while the entity declares them NOT NULL: kept
 * as is, it predates this change.
 */
export class RenameAssetGroupsToProjects1793670417373
  implements MigrationInterface
{
  name = 'RenameAssetGroupsToProjects1793670417373';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Tables and columns.
    await queryRunner.query(`ALTER TABLE "asset_groups" RENAME TO "projects"`);
    await queryRunner.query(
      `ALTER TABLE "assets_group_assets" RENAME TO "project_assets"`,
    );
    await queryRunner.query(
      `ALTER TABLE "asset_group_workflows" RENAME TO "project_workflows"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_assets" RENAME COLUMN "assetGroupId" TO "projectId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_workflows" RENAME COLUMN "assetGroupId" TO "projectId"`,
    );

    // Constraints (renaming a PK/UQ renames its index too) and indexes.
    for (const [table, from, to] of CONSTRAINT_RENAMES) {
      await queryRunner.query(
        `ALTER TABLE "${table}" RENAME CONSTRAINT "${from}" TO "${to}"`,
      );
    }
    for (const [from, to] of INDEX_RENAMES) {
      await queryRunner.query(`ALTER INDEX "${from}" RENAME TO "${to}"`);
    }

    // 2. Provenance.
    await queryRunner.query(`ALTER TABLE "job_histories" ADD "projectId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "job_histories" ADD "projectWorkflowId" uuid`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_job_histories_projectWorkflowId" ON "job_histories" ("projectWorkflowId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_job_histories_projectId_createdAt" ON "job_histories" ("projectId", "createdAt") `,
    );
    await queryRunner.query(
      `ALTER TABLE "job_histories" ADD CONSTRAINT "FK_4c73dad25a7d49cf19f9147f3ac" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_histories" ADD CONSTRAINT "FK_4173ac02d0545ac4eac52c658fa" FOREIGN KEY ("projectWorkflowId") REFERENCES "project_workflows"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "project_vulnerabilities" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "projectId" uuid NOT NULL, "vulnerabilityId" uuid NOT NULL, "firstSeenJobHistoryId" uuid, "lastSeenJobHistoryId" uuid, "firstSeenAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "lastSeenAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "timesSeen" integer NOT NULL DEFAULT '1', CONSTRAINT "UQ_pv_projectId_vulnerabilityId" UNIQUE ("projectId", "vulnerabilityId"), CONSTRAINT "PK_7481e71c12393eee4a9dee3036c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_pv_vulnerabilityId" ON "project_vulnerabilities" ("vulnerabilityId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_pv_projectId_lastSeenAt" ON "project_vulnerabilities" ("projectId", "lastSeenAt") `,
    );
    await queryRunner.query(
      `ALTER TABLE "project_vulnerabilities" ADD CONSTRAINT "FK_d22f738aadb67846d12de0e4f75" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_vulnerabilities" ADD CONSTRAINT "FK_c1f443360dbb13f40ad873ad2c9" FOREIGN KEY ("vulnerabilityId") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_vulnerabilities" ADD CONSTRAINT "FK_734a9332bd0194c689f387b3943" FOREIGN KEY ("firstSeenJobHistoryId") REFERENCES "job_histories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_vulnerabilities" ADD CONSTRAINT "FK_a043d5650f586146af850928dfd" FOREIGN KEY ("lastSeenJobHistoryId") REFERENCES "job_histories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    // 3. Backfills.
    await queryRunner.query(
      `UPDATE "workspace_permissions"
          SET "permissions" = array_replace(array_replace("permissions", 'group.read', 'project.read'), 'group.write', 'project.write')
        WHERE "permissions" && ARRAY['group.read', 'group.write']::text[]`,
    );

    await queryRunner.query(
      `UPDATE "job_histories" jh
          SET "projectId" = m."projectId",
              "projectWorkflowId" = m."projectWorkflowId"
         FROM (
           SELECT run.id AS "jobHistoryId",
                  MIN(pw."projectId"::text)::uuid AS "projectId",
                  MIN(pw.id::text)::uuid AS "projectWorkflowId"
             FROM "job_histories" run
             JOIN "project_workflows" pw ON pw."workflowId" = run."workflowId"
             JOIN "projects" p ON p.id = pw."projectId" AND p.name = run."jobHistoryName"
            WHERE run.scope IS NULL OR run.scope -> 'targetIds' IS NULL
            GROUP BY run.id
           HAVING COUNT(*) = 1
         ) m
        WHERE jh.id = m."jobHistoryId"`,
    );

    await queryRunner.query(
      `INSERT INTO "project_vulnerabilities"
              ("projectId", "vulnerabilityId", "firstSeenJobHistoryId", "lastSeenJobHistoryId", "firstSeenAt", "lastSeenAt", "timesSeen")
       SELECT jh."projectId", v.id, jh.id, jh.id,
              COALESCE(v."firstDetectedDate", v."createdAt"),
              COALESCE(v."firstDetectedDate", v."createdAt"),
              1
         FROM "vulnerabilities" v
         JOIN "job_histories" jh ON jh.id = v."jobHistoryId"
        WHERE jh."projectId" IS NOT NULL
       ON CONFLICT ("projectId", "vulnerabilityId") DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 3. Backfills (project_vulnerabilities and the run tags go with their
    //    table/columns below).
    await queryRunner.query(
      `UPDATE "workspace_permissions"
          SET "permissions" = array_replace(array_replace("permissions", 'project.read', 'group.read'), 'project.write', 'group.write')
        WHERE "permissions" && ARRAY['project.read', 'project.write']::text[]`,
    );

    // 2. Provenance.
    await queryRunner.query(`DROP TABLE "project_vulnerabilities"`);
    await queryRunner.query(
      `ALTER TABLE "job_histories" DROP CONSTRAINT "FK_4173ac02d0545ac4eac52c658fa"`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_histories" DROP CONSTRAINT "FK_4c73dad25a7d49cf19f9147f3ac"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_job_histories_projectId_createdAt"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_job_histories_projectWorkflowId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_histories" DROP COLUMN "projectWorkflowId"`,
    );
    await queryRunner.query(`ALTER TABLE "job_histories" DROP COLUMN "projectId"`);

    // 1. Indexes, constraints, columns, tables.
    for (const [from, to] of INDEX_RENAMES) {
      await queryRunner.query(`ALTER INDEX "${to}" RENAME TO "${from}"`);
    }
    for (const [table, from, to] of CONSTRAINT_RENAMES) {
      await queryRunner.query(
        `ALTER TABLE "${table}" RENAME CONSTRAINT "${to}" TO "${from}"`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE "project_workflows" RENAME COLUMN "projectId" TO "assetGroupId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_assets" RENAME COLUMN "projectId" TO "assetGroupId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_workflows" RENAME TO "asset_group_workflows"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_assets" RENAME TO "assets_group_assets"`,
    );
    await queryRunner.query(`ALTER TABLE "projects" RENAME TO "asset_groups"`);
  }
}

/** [table (new name), old constraint, new constraint] */
const CONSTRAINT_RENAMES: ReadonlyArray<[string, string, string]> = [
  ['projects', 'PK_1e8f37dccf890f00482ac0bb1ab', 'PK_6271df0a7aed1d6c0691ce6ac50'],
  ['projects', 'UQ_d1c6dfd6a740b46f543fe0a721c', 'UQ_8dda42e217868233acdfd77f170'],
  // workspaceId
  ['projects', 'FK_54ff1d9c294707e71753fec2b18', 'FK_108ff8a2d40c2b294511c92a7c8'],
  ['project_assets', 'PK_491c815ecb7be371fd5abe9effb', 'PK_7b9fd4c5f92d38acb7e270e0cce'],
  // projectId
  ['project_assets', 'FK_6fa72968a572d63e85086b58aec', 'FK_5529071de26d3313ac9759259ae'],
  // assetId
  ['project_assets', 'FK_05289fd83f48eeae11d258143af', 'FK_327cd55257e3260f823d29f8daf'],
  ['project_workflows', 'PK_bcacdb266f0a7df6e9d9733d00e', 'PK_90915ae85d062ee141add6aaa1e'],
  // projectId
  ['project_workflows', 'FK_b49dbca7f4cf406bd42786f3f0a', 'FK_5919bc91763db92759c619c851b'],
  // workflowId
  ['project_workflows', 'FK_1d91e7329d311307ee7d72a213d', 'FK_c2e12d06fb0b8b93707c0b14356'],
];

/** [old index, new index] */
const INDEX_RENAMES: ReadonlyArray<[string, string]> = [
  ['IDX_aga_assetGroupId', 'IDX_pa_projectId'],
  ['IDX_aga_assetId', 'IDX_pa_assetId'],
  ['IDX_agw_assetGroupId', 'IDX_pw_projectId'],
  ['IDX_agw_workflowId', 'IDX_pw_workflowId'],
  ['IDX_agw_assetGroupId_workflowId', 'IDX_pw_projectId_workflowId'],
];
