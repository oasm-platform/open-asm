import { Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';
import { Asset } from '@/modules/assets/entities/assets.entity';
import { AssetGroup } from './asset-groups.entity';

@Entity('assets_group_assets')
export class AssetGroupAsset extends BaseEntity {
  @ManyToOne(() => AssetGroup, (assetGroup) => assetGroup.assetGroupAssets)
  @JoinColumn({ name: 'assetGroupId' })
  assetGroup: AssetGroup;

  @ManyToOne(() => Asset, (asset) => asset.id)
  @JoinColumn({ name: 'assetId' })
  asset: Asset;
}
