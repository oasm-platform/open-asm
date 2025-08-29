import { ViewColumn, ViewEntity } from 'typeorm';

@ViewEntity({
  name: 'ip_assets_view',
  expression: `SELECT
        a.id as "assetId",
        jsonb_array_elements_text(a."dnsRecords"::jsonb -> 'A') AS ip
    FROM assets a
    WHERE a."targetId" IS NOT NULL

    UNION ALL

    SELECT
        a.id as "assetId",
        jsonb_array_elements_text(a."dnsRecords"::jsonb -> 'AAAA') AS ip
    FROM assets a
    WHERE a."targetId" IS NOT NULL`,
})
export class IpAssetsView {
  @ViewColumn()
  assetId: string;

  @ViewColumn({
    name: 'ip',
  })
  ipAddress: string;
}
