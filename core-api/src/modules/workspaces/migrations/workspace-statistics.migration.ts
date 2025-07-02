import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWorkspaceStatisticsView0123456789126
  implements MigrationInterface
{
  /**
   * Creates a view with workspace statistics:
   * - total_targets: count of all targets in the workspace
   * - total_assets: count of all assets in the workspace
   * - technologies: array of unique technologies detected in the workspace
   * - cname_records: array of unique CNAME records detected in the workspace
   * - status_codes: array of unique status codes detected in the workspace
   * @param queryRunner
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE VIEW workspace_statistics_view AS
      WITH workspace_targets_count AS (
        SELECT 
          wt."workspaceId",
          COUNT(*) as total_targets
        FROM workspace_targets wt
        GROUP BY wt."workspaceId"
      ),
      workspace_assets_count AS (
        SELECT 
          wt."workspaceId",
          COUNT(DISTINCT a.id) as total_assets
        FROM workspace_targets wt
        LEFT JOIN targets t ON t.id = wt."targetId"
        LEFT JOIN assets a ON a."targetId" = t.id
        GROUP BY wt."workspaceId"
      ),
      workspace_technologies AS (
        SELECT 
          wt."workspaceId",
          jsonb_agg(DISTINCT tech_element ORDER BY tech_element) as technologies
        FROM workspace_targets wt
        LEFT JOIN targets t ON t.id = wt."targetId"
        LEFT JOIN assets a ON a."targetId" = t.id
        LEFT JOIN jobs j ON j."assetId" = a.id
        CROSS JOIN LATERAL jsonb_array_elements_text(j."rawResult"::jsonb->'tech') AS tech_element
        WHERE j."workerName" = 'httpx'
          AND j.status = 'completed'
          AND j."rawResult" IS NOT NULL
          AND j."rawResult"::jsonb ? 'tech'
        GROUP BY wt."workspaceId"
      ),
      workspace_cnames AS (
        SELECT 
          wt."workspaceId",
          jsonb_agg(DISTINCT cname_element ORDER BY cname_element) as cname_records
        FROM workspace_targets wt
        LEFT JOIN targets t ON t.id = wt."targetId"
        LEFT JOIN assets a ON a."targetId" = t.id
        CROSS JOIN LATERAL jsonb_array_elements_text(a."dnsRecords"::jsonb->'CNAME') AS cname_element
        WHERE a."dnsRecords" IS NOT NULL
          AND a."dnsRecords"::jsonb ? 'CNAME'
        GROUP BY wt."workspaceId"
      ),
      workspace_status_codes AS (
        SELECT 
          wt."workspaceId",
          jsonb_agg(DISTINCT (j."rawResult"::jsonb->>'status_code')::integer ORDER BY (j."rawResult"::jsonb->>'status_code')::integer) as status_codes
        FROM workspace_targets wt
        LEFT JOIN targets t ON t.id = wt."targetId"
        LEFT JOIN assets a ON a."targetId" = t.id
        LEFT JOIN jobs j ON j."assetId" = a.id
        WHERE j."workerName" = 'httpx'
          AND j.status = 'completed'
          AND j."rawResult" IS NOT NULL
          AND j."rawResult"::jsonb ? 'status_code'
        GROUP BY wt."workspaceId"
      )
      SELECT 
        w.id as workspace_id,
        COALESCE(wtc.total_targets, 0) as total_targets,
        COALESCE(wac.total_assets, 0) as total_assets,
        COALESCE(wt.technologies, '[]'::jsonb) as technologies,
        COALESCE(wc.cname_records, '[]'::jsonb) as cname_records,
        COALESCE(wsc.status_codes, '[]'::jsonb) as status_codes
      FROM public.workspace w -- Replace 'public' with 'your_schema' if needed
      LEFT JOIN workspace_targets_count wtc ON wtc."workspaceId" = w.id
      LEFT JOIN workspace_assets_count wac ON wac."workspaceId" = w.id
      LEFT JOIN workspace_technologies wt ON wt."workspaceId" = w.id
      LEFT JOIN workspace_cnames wc ON wc."workspaceId" = w.id
      LEFT JOIN workspace_status_codes wsc ON wsc."workspaceId" = w.id;
    `);
  }

  /**
   * Drops the view created in the up method.
   * @param queryRunner an instance of QueryRunner
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP VIEW IF EXISTS workspace_statistics_view`);
  }
}
