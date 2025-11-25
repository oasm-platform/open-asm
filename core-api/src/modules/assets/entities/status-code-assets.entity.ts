import { JoinColumn, ManyToOne, ViewColumn, ViewEntity } from 'typeorm';
import { Asset } from './assets.entity';
import { ApiProperty } from '@nestjs/swagger';
import { AssetService } from './asset-services.entity';

@ViewEntity({
  name: 'status_code_asset_services_view',
  expression: `
        SELECT http_responses.status_code AS "statusCode",
              http_responses."assetServiceId"
        FROM http_responses
        UNION
        SELECT UNNEST(chain_status_codes)::INT AS "statusCode",
              http_responses."assetServiceId"
        FROM http_responses
      `,
})
export class StatusCodeAssetsView {
  @ViewColumn()
  @ApiProperty()
  statusCode: number;

  @ViewColumn()
  @ApiProperty()
  assetServiceId: string;

  @ManyToOne(() => Asset, (asset) => asset.ipAssets)
  @JoinColumn({ name: 'assetServiceId' })
  assetService: AssetService;
}
