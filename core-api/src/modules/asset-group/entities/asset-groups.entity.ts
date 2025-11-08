import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Unique,
} from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { AssetGroupAsset } from './asset-groups-assets.entity';
import { AssetGroupTool } from './asset-groups-tools.entity';

@Unique(['name', 'workspace'])
@Entity('asset_groups')
export class AssetGroup extends BaseEntity {
  @ApiProperty()
  @Column()
  name: string;

  @ManyToOne(() => Workspace, (workspace) => workspace.id)
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @OneToMany(
    () => AssetGroupAsset,
    (assetGroupAsset) => assetGroupAsset.assetGroup,
  )
  assetGroupAssets: AssetGroupAsset[];

  @OneToMany(
    () => AssetGroupTool,
    (assetGroupTool) => assetGroupTool.assetGroup,
  )
  assetGroupTools: AssetGroupTool[];
}
