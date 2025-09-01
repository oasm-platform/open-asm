import { ApiProperty } from '@nestjs/swagger';
import { JoinColumn, ManyToOne, ViewColumn, ViewEntity } from 'typeorm';
import { Asset } from './assets.entity';

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
  @ApiProperty()
  assetId: string;

  @ViewColumn({
    name: 'ip',
  })
  @ApiProperty()
  ipAddress: string;

  @ManyToOne(() => Asset, (asset) => asset.ipAssets)
  @JoinColumn({ name: 'assetId' })
  asset: Asset;
}
