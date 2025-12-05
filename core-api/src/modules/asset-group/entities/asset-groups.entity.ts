import { BaseEntity } from '@/common/entities/base.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
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
  @IsString()
  @IsOptional()
  @Column()
  name: string;

  @ManyToOne(() => Workspace, (workspace) => workspace.id)
  @JoinColumn({ name: 'workspaceId' })
  workspace: Workspace;

  @ApiProperty({ example: '#78716C', required: false })
  @IsString()
  @IsOptional()
  @Column({ nullable: true, default: '#78716C' }) // stone-500 tailwind css
  hexColor: string;

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
