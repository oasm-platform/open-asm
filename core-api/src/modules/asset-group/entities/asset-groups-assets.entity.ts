import { BaseEntity } from '@/common/entities/base.entity';
import { Asset } from '@/modules/assets/entities/assets.entity';
import { Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AssetGroup } from './asset-groups.entity';

@Entity('assets_group_assets')
export class AssetGroupAsset extends BaseEntity {
  @ManyToOne(() => AssetGroup, (assetGroup) => assetGroup.assetGroupAssets, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'assetGroupId' })
  assetGroup: AssetGroup;

  @ManyToOne(() => Asset, (asset) => asset.id, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'assetId' })
  asset: Asset;
}
