import { BaseEntity } from '@/common/entities/base.entity';
import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  Relation,
  Unique,
} from 'typeorm';
import { Asset } from './assets.entity';

@Entity('dns_records')
@Unique(['assetId', 'recordType', 'value'])
@Index('IDX_dns_records_assetId', ['assetId'])
@Index('IDX_dns_records_type', ['recordType'])
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
