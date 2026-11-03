import { BaseEntity } from '@/common/entities/base.entity';
import { Asset } from '@/modules/assets/entities/assets.entity';
import { Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { AssetGroup } from './asset-groups.entity';

@Entity('project_assets')
@Index('IDX_pa_projectId', ['assetGroup'])
@Index('IDX_pa_assetId', ['asset'])
export class AssetGroupAsset extends BaseEntity {
  @ManyToOne(() => AssetGroup, (assetGroup) => assetGroup.assetGroupAssets, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'projectId' })
  assetGroup: Relation<AssetGroup>;

  @ManyToOne(() => Asset, (asset) => asset.id, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'assetId' })
  asset: Relation<Asset>;
}
