import { BaseEntity } from '@/common/entities/base.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Unique,
} from 'typeorm';
import { AssetGroupAsset } from './asset-groups-assets.entity';
import { AssetGroupWorkflow } from './asset-groups-workflows.entity';

@Unique(['name', 'workspace'])
@Entity('asset_groups')
export class AssetGroup extends BaseEntity {
  @ApiProperty()
  @Column()
  name: string;

  @ManyToOne(() => Workspace, (workspace) => workspace.id)
  @JoinColumn({ name: 'workspaceId' })
  workspace: Workspace;

  @OneToMany(
    () => AssetGroupAsset,
    (assetGroupAsset) => assetGroupAsset.assetGroup,
  )
  assetGroupAssets: AssetGroupAsset[];

  @OneToMany(
    () => AssetGroupWorkflow,
    (assetGroupWorkflows) => assetGroupWorkflows.assetGroup,
  )
  assetGroupWorkflows: AssetGroupWorkflow[];
}
