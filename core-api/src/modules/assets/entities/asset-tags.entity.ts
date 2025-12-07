import { BaseEntity } from '@/common/entities/base.entity';
import { Tool } from '@/modules/tools/entities/tools.entity';
import { ApiProperty, PickType } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { Column, Entity, ManyToOne } from 'typeorm';
import { AssetService } from './asset-services.entity';

@Entity('asset_services_tags')
export class AssetTag extends BaseEntity {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Column()
  tag: string;

  @ManyToOne(() => AssetService, (assetService) => assetService.tags, {
    onDelete: 'CASCADE',
  })
  assetService: AssetService;

  @Column()
  assetServiceId: string;

  @ApiProperty({ type: () => PickType(Tool, ['id', 'name']) })
  @ManyToOne(() => Tool, (tool) => tool.assetTags)
  tool: Tool;

  @Column({ nullable: true })
  toolId: string;
}
