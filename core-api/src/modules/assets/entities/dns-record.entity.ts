import { BaseEntity } from '@/common/entities/base.entity';
import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  Entity,
  ForeignKey,
  Index,
  JoinColumn,
  ManyToOne,
  Relation,
  Unique,
} from 'typeorm';
import { Asset } from './assets.entity';

@Entity('dns_records')
// The unique (assetId, …) prefix serves assetId lookups and the FK.
@Unique(['assetId', 'recordType', 'value'])
// Tenant scope (attack-surface-query): workspaceId equals the host's.
@ForeignKey(() => Asset, ['assetId', 'workspaceId'], ['id', 'workspaceId'], {
  name: 'FK_dns_records_asset_workspace',
  onDelete: 'CASCADE',
})
@Index('IDX_dns_records_workspace_createdAt', ['workspaceId', 'createdAt', 'id'])
export class DnsRecord extends BaseEntity {
  /** The host's workspace (denormalized, see Asset.workspaceId). */
  @Column({ type: 'uuid' })
  workspaceId: string;

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
