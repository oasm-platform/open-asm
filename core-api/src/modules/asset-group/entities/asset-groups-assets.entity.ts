import { BaseEntity } from '@/common/entities/base.entity';
import { Asset } from '@/modules/assets/entities/assets.entity';
import { Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AssetGroup } from './asset-groups.entity';

@Entity('assets_group_assets')
export class AssetGroupAsset extends BaseEntity {
  @ManyToOne(() => AssetGroup, (ga) => ga.id)
  @JoinColumn({ name: 'asset_group_id' })
  assetGroup: AssetGroup;

  @ManyToOne(() => Asset, (asset) => asset.id)
  @JoinColumn({ name: 'asset_id' })
  asset: Asset;
}
