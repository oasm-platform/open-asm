import { BaseEntity } from '@/common/entities/base.entity';
import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  Relation,
  Unique,
} from 'typeorm';
import { Asset } from './assets.entity';

@Entity('dns_records')
// The unique (assetId, …) prefix serves assetId lookups and the FK.
@Unique(['assetId', 'recordType', 'value'])
export class DnsRecord extends BaseEntity {
  @ApiProperty()
  @Column({ type: 'uuid' })
  assetId: string;

  @ManyToOne(() => Asset, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assetId' })
  asset: Relation<Asset>;

  @ApiProperty()
  @Column({ type: 'varchar' })
  recordType: string;

  @ApiProperty()
  @Column({ type: 'text' })
  value: string;

  @ApiProperty({ required: false })
  @Column({ type: 'uuid', nullable: true })
  jobHistoryId?: string;
}
