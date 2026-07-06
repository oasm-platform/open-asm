import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Migrations1776960340581 implements MigrationInterface {
    name = 'Migrations1776960340581';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "vulnerabilities" DROP CONSTRAINT "FK_f7e68acbb73cc61c0496f67d851"`);
        await queryRunner.query(`ALTER TABLE "workflows" DROP CONSTRAINT "FK_ea41b368d8f4373d76b58112897"`);
        await queryRunner.query(`ALTER TABLE "asset_group_workflows" DROP CONSTRAINT "FK_1d91e7329d311307ee7d72a213d"`);
        await queryRunner.query(`ALTER TABLE "asset_group_workflows" DROP CONSTRAINT "FK_b49dbca7f4cf406bd42786f3f0a"`);
        await queryRunner.query(`ALTER TABLE "asset_groups" DROP CONSTRAINT "FK_54ff1d9c294707e71753fec2b18"`);
        await queryRunner.query(`ALTER TABLE "assets_group_assets" DROP CONSTRAINT "FK_05289fd83f48eeae11d258143af"`);
        await queryRunner.query(`ALTER TABLE "assets_group_assets" DROP CONSTRAINT "FK_6fa72968a572d63e85086b58aec"`);
        await queryRunner.query(`ALTER TABLE "workers" DROP CONSTRAINT "FK_f2fd09d8d31a1ac0a84a0cbb780"`);
        await queryRunner.query(`ALTER TABLE "workspace_tools" DROP CONSTRAINT "FK_cb01f0a705ff81d8a94969fc553"`);
        await queryRunner.query(`ALTER TABLE "workspace_statistics" DROP CONSTRAINT "FK_f34fc0f16afe8444ae433d25636"`);
        await queryRunner.query(`ALTER TABLE "templates" DROP CONSTRAINT "FK_b8a4692f30364e281a01651340a"`);
        await queryRunner.query(`ALTER TABLE "issue_comments" DROP CONSTRAINT "FK_94b28cbe4b8110d9fedcb44c489"`);
        await queryRunner.query(`ALTER TABLE "issues" DROP CONSTRAINT "FK_53edb5e14a09491261b628e0401"`);
        await queryRunner.query(`CREATE TABLE "system_configs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" text NOT NULL DEFAULT 'Open ASM', "logoPath" text, CONSTRAINT "PK_29ac548e654c799fd885e1b9b71" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "workspace_targets" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "workspace_targets" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "tools" ADD "command" character varying`);
        await queryRunner.query(`ALTER TABLE "tools" ADD "isBuiltIn" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "workspace_statistics" ADD "services" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "vulnerabilities" ADD CONSTRAINT "FK_f7e68acbb73cc61c0496f67d851" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "workflows" ADD CONSTRAINT "FK_ea41b368d8f4373d76b58112897" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "asset_group_workflows" ADD CONSTRAINT "FK_b49dbca7f4cf406bd42786f3f0a" FOREIGN KEY ("assetGroupId") REFERENCES "asset_groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "asset_group_workflows" ADD CONSTRAINT "FK_1d91e7329d311307ee7d72a213d" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "asset_groups" ADD CONSTRAINT "FK_54ff1d9c294707e71753fec2b18" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "assets_group_assets" ADD CONSTRAINT "FK_6fa72968a572d63e85086b58aec" FOREIGN KEY ("assetGroupId") REFERENCES "asset_groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "assets_group_assets" ADD CONSTRAINT "FK_05289fd83f48eeae11d258143af" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "workers" ADD CONSTRAINT "FK_f2fd09d8d31a1ac0a84a0cbb780" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "workspace_tools" ADD CONSTRAINT "FK_cb01f0a705ff81d8a94969fc553" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "workspace_statistics" ADD CONSTRAINT "FK_f34fc0f16afe8444ae433d25636" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "templates" ADD CONSTRAINT "FK_b8a4692f30364e281a01651340a" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "issue_comments" ADD CONSTRAINT "FK_94b28cbe4b8110d9fedcb44c489" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "issues" ADD CONSTRAINT "FK_53edb5e14a09491261b628e0401" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`CREATE VIEW "tls_assets_view" AS 
    SELECT DISTINCT ON (hr.tls->>'host', hr."assetServiceId")
      hr."assetServiceId",
      hr.tls->>'host'           AS host,
      hr.tls->>'sni'            AS sni,
      hr.tls->>'subject_dn'     AS subject_dn,
      hr.tls->>'subject_cn'     AS subject_cn,
      hr.tls->>'issuer_dn'      AS issuer_dn,
      hr.tls->>'not_before'     AS not_before,
      hr.tls->>'not_after'      AS not_after,
      hr.tls->>'tls_version'    AS tls_version,
      hr.tls->>'cipher'         AS cipher,
      hr.tls->>'tls_connection' AS tls_connection,
      (hr.tls->'subject_an')::text AS subject_an
    FROM http_responses hr
    WHERE hr.tls IS NOT NULL
    ORDER BY hr.tls->>'host', hr."assetServiceId", hr."createdAt" DESC
  `);
        await queryRunner.query(`INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES (DEFAULT, $1, DEFAULT, $2, $3, $4)`, ['public','VIEW','tls_assets_view',"SELECT DISTINCT ON (hr.tls->>'host', hr.\"assetServiceId\")\n      hr.\"assetServiceId\",\n      hr.tls->>'host'           AS host,\n      hr.tls->>'sni'            AS sni,\n      hr.tls->>'subject_dn'     AS subject_dn,\n      hr.tls->>'subject_cn'     AS subject_cn,\n      hr.tls->>'issuer_dn'      AS issuer_dn,\n      hr.tls->>'not_before'     AS not_before,\n      hr.tls->>'not_after'      AS not_after,\n      hr.tls->>'tls_version'    AS tls_version,\n      hr.tls->>'cipher'         AS cipher,\n      hr.tls->>'tls_connection' AS tls_connection,\n      (hr.tls->'subject_an')::text AS subject_an\n    FROM http_responses hr\n    WHERE hr.tls IS NOT NULL\n    ORDER BY hr.tls->>'host', hr.\"assetServiceId\", hr.\"createdAt\" DESC"]);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "schema" = $3`, ['VIEW','tls_assets_view','public']);
        await queryRunner.query(`DROP VIEW "tls_assets_view"`);
        await queryRunner.query(`ALTER TABLE "issues" DROP CONSTRAINT "FK_53edb5e14a09491261b628e0401"`);
        await queryRunner.query(`ALTER TABLE "issue_comments" DROP CONSTRAINT "FK_94b28cbe4b8110d9fedcb44c489"`);
        await queryRunner.query(`ALTER TABLE "templates" DROP CONSTRAINT "FK_b8a4692f30364e281a01651340a"`);
        await queryRunner.query(`ALTER TABLE "workspace_statistics" DROP CONSTRAINT "FK_f34fc0f16afe8444ae433d25636"`);
        await queryRunner.query(`ALTER TABLE "workspace_tools" DROP CONSTRAINT "FK_cb01f0a705ff81d8a94969fc553"`);
        await queryRunner.query(`ALTER TABLE "workers" DROP CONSTRAINT "FK_f2fd09d8d31a1ac0a84a0cbb780"`);
        await queryRunner.query(`ALTER TABLE "assets_group_assets" DROP CONSTRAINT "FK_05289fd83f48eeae11d258143af"`);
        await queryRunner.query(`ALTER TABLE "assets_group_assets" DROP CONSTRAINT "FK_6fa72968a572d63e85086b58aec"`);
        await queryRunner.query(`ALTER TABLE "asset_groups" DROP CONSTRAINT "FK_54ff1d9c294707e71753fec2b18"`);
        await queryRunner.query(`ALTER TABLE "asset_group_workflows" DROP CONSTRAINT "FK_1d91e7329d311307ee7d72a213d"`);
        await queryRunner.query(`ALTER TABLE "asset_group_workflows" DROP CONSTRAINT "FK_b49dbca7f4cf406bd42786f3f0a"`);
        await queryRunner.query(`ALTER TABLE "workflows" DROP CONSTRAINT "FK_ea41b368d8f4373d76b58112897"`);
        await queryRunner.query(`ALTER TABLE "vulnerabilities" DROP CONSTRAINT "FK_f7e68acbb73cc61c0496f67d851"`);
        await queryRunner.query(`ALTER TABLE "workspace_statistics" DROP COLUMN "services"`);
        await queryRunner.query(`ALTER TABLE "tools" DROP COLUMN "isBuiltIn"`);
        await queryRunner.query(`ALTER TABLE "tools" DROP COLUMN "command"`);
        await queryRunner.query(`ALTER TABLE "workspace_targets" DROP COLUMN "updatedAt"`);
        await queryRunner.query(`ALTER TABLE "workspace_targets" DROP COLUMN "createdAt"`);
        await queryRunner.query(`DROP TABLE "system_configs"`);
        await queryRunner.query(`ALTER TABLE "issues" ADD CONSTRAINT "FK_53edb5e14a09491261b628e0401" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "issue_comments" ADD CONSTRAINT "FK_94b28cbe4b8110d9fedcb44c489" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "templates" ADD CONSTRAINT "FK_b8a4692f30364e281a01651340a" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "workspace_statistics" ADD CONSTRAINT "FK_f34fc0f16afe8444ae433d25636" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "workspace_tools" ADD CONSTRAINT "FK_cb01f0a705ff81d8a94969fc553" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "workers" ADD CONSTRAINT "FK_f2fd09d8d31a1ac0a84a0cbb780" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "assets_group_assets" ADD CONSTRAINT "FK_6fa72968a572d63e85086b58aec" FOREIGN KEY ("assetGroupId") REFERENCES "asset_groups"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "assets_group_assets" ADD CONSTRAINT "FK_05289fd83f48eeae11d258143af" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "asset_groups" ADD CONSTRAINT "FK_54ff1d9c294707e71753fec2b18" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "asset_group_workflows" ADD CONSTRAINT "FK_b49dbca7f4cf406bd42786f3f0a" FOREIGN KEY ("assetGroupId") REFERENCES "asset_groups"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "asset_group_workflows" ADD CONSTRAINT "FK_1d91e7329d311307ee7d72a213d" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "workflows" ADD CONSTRAINT "FK_ea41b368d8f4373d76b58112897" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "vulnerabilities" ADD CONSTRAINT "FK_f7e68acbb73cc61c0496f67d851" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
