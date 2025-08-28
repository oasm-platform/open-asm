import { ViewColumn, ViewEntity } from 'typeorm';

@ViewEntity({
  name: 'status_code_assets_view',
  expression: `
        SELECT http_responses.status_code AS "statusCode",
              http_responses."assetId" 
        FROM http_responses
        UNION
        SELECT UNNEST(chain_status_codes)::INT AS "statusCode",
              http_responses."assetId"
        FROM http_responses
      `,
})
export class StatusCodeAssetsView {
  @ViewColumn()
  statusCode: number;

  @ViewColumn()
  assetId: string;
}
