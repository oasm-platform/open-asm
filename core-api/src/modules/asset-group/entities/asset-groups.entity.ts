import { BaseEntity } from '@/common/entities/base.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity } from 'typeorm';

@Entity('asset_groups')
export class AssetGroup extends BaseEntity {
  @ApiProperty()
  @Column()
  name: string;
}
