import { ViewColumn, ViewEntity } from 'typeorm';

@ViewEntity({
  expression: `
    WITH workspace_targets_count AS (
      SELECT 
        wt."workspaceId",
        COUNT(*) as "totalTargets"
      FROM workspace_targets wt
      GROUP BY wt."workspaceId"
    ),
    workspace_assets_count AS (
      SELECT 
        wt."workspaceId",
        COUNT(DISTINCT a.id) as "totalAssets"
      FROM workspace_targets wt
      LEFT JOIN targets t ON t.id = wt."targetId"
      LEFT JOIN assets a ON a."targetId" = t.id
      GROUP BY wt."workspaceId"
    ),
    workspace_technologies AS (
      SELECT 
        wt."workspaceId",
        jsonb_agg(DISTINCT tech_element ORDER BY tech_element) as "technologies"
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
        jsonb_agg(DISTINCT cname_element ORDER BY cname_element) as "cnameRecords"
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
        jsonb_agg(
          DISTINCT (j."rawResult"::jsonb->>'status_code')::integer 
          ORDER BY (j."rawResult"::jsonb->>'status_code')::integer
        ) FILTER (
          WHERE (j."rawResult"::jsonb->>'status_code')::integer > 0
        ) as "statusCodes"
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
      w.id as "workspaceId",
      COALESCE(wtc."totalTargets", 0) as "totalTargets",
      COALESCE(wac."totalAssets", 0) as "totalAssets",
      COALESCE(wt."technologies", '[]'::jsonb) as "technologies",
      COALESCE(wc."cnameRecords", '[]'::jsonb) as "cnameRecords",
      COALESCE(wsc."statusCodes", '[]'::jsonb) as "statusCodes"
    FROM public.workspaces w
    LEFT JOIN workspace_targets_count wtc ON wtc."workspaceId" = w.id
    LEFT JOIN workspace_assets_count wac ON wac."workspaceId" = w.id
    LEFT JOIN workspace_technologies wt ON wt."workspaceId" = w.id
    LEFT JOIN workspace_cnames wc ON wc."workspaceId" = w.id
    LEFT JOIN workspace_status_codes wsc ON wsc."workspaceId" = w.id;
  `,
})
export class WorkspaceStatisticsView {
  @ViewColumn()
  workspaceId: string;

  @ViewColumn()
  totalTargets: number;

  @ViewColumn()
  totalAssets: number;

  @ViewColumn()
  technologies: string[];

  @ViewColumn()
  cnameRecords: string[];

  @ViewColumn()
  statusCodes: number[];
}
