import { ApiProperty, PickType } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { BaseEntity } from 'src/common/entities/base.entity';
import { Tool } from 'src/modules/tools/entities/tools.entity';
import { Column, Entity, ManyToOne } from 'typeorm';
import { Asset } from './assets.entity';

@Entity('asset_tags')
export class AssetTag extends BaseEntity {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Column()
  tag: string;

  @ManyToOne(() => Asset, (asset) => asset.tags, {
    onDelete: 'CASCADE',
  })
  asset: Asset;

  @Column()
  assetId: string;

  @ApiProperty({ type: () => PickType(Tool, ['id', 'name']) })
  @ManyToOne(() => Tool, (tool) => tool.assetTags)
  tool: Tool;

  @Column({ nullable: true })
  toolId: string;
}
