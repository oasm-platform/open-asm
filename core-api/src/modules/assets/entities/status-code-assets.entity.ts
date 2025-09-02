import { JoinColumn, ManyToOne, ViewColumn, ViewEntity } from 'typeorm';
import { Asset } from './assets.entity';
import { ApiProperty } from '@nestjs/swagger';

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
  @ApiProperty()
  statusCode: number;

  @ViewColumn()
  @ApiProperty()
  assetId: string;

  @ManyToOne(() => Asset, (asset) => asset.ipAssets)
  @JoinColumn({ name: 'assetId' })
  asset: Asset;
}
