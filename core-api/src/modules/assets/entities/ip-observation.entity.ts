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
} from 'typeorm';
import { Asset } from './assets.entity';
import { AssetService } from './asset-services.entity';
import { HttpResponse } from './http-response.entity';

export type IpObservationSource =
  | 'httpx_a'
  | 'resolver'
  | 'dns_a'
  | 'dns_aaaa';

@Entity('ip_observations')
@Index('UQ_ip_observations_http', ['httpResponseId', 'ip', 'source'], {
  unique: true,
  where: '"httpResponseId" IS NOT NULL',
})
@Index('UQ_ip_observations_asset', ['assetId', 'ip', 'source'], {
  unique: true,
  where: '"assetId" IS NOT NULL',
})
@Index('IDX_ip_observations_ip', ['ip'])
@Index('IDX_ip_observations_assetServiceId', ['assetServiceId'])
// Tenant scope (attack-surface-query): workspaceId equals its parent's. A row
// has an asset (DNS) or a response (HTTP); MATCH SIMPLE checks the one set.
@ForeignKey(() => Asset, ['assetId', 'workspaceId'], ['id', 'workspaceId'], {
  name: 'FK_ip_observations_asset_workspace',
  onDelete: 'CASCADE',
})
@ForeignKey(() => HttpResponse, ['httpResponseId', 'workspaceId'], ['id', 'workspaceId'], {
  name: 'FK_ip_observations_response_workspace',
  onDelete: 'CASCADE',
})
@Index('IDX_ip_observations_workspace_ip', ['workspaceId', 'ip'])
@Index('IDX_ip_observations_workspace_createdAt', ['workspaceId', 'createdAt', 'id'])
// GiST inet_ops for subnet containment over many CIDRs (migration only).
@Index('IDX_ip_observations_ip_gist', { synchronize: false })
export class IpObservation extends BaseEntity {
  /** The parent's workspace (denormalized, see Asset.workspaceId). */
  @Column({ type: 'uuid' })
  workspaceId: string;

  @ApiProperty({ required: false })
  @Column({ type: 'uuid', nullable: true })
  httpResponseId?: string;

  @ManyToOne(() => HttpResponse, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'httpResponseId' })
  httpResponse?: Relation<HttpResponse>;

  @ApiProperty({ required: false })
  @Column({ type: 'uuid', nullable: true })
  assetServiceId?: string;

  @ManyToOne(() => AssetService, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'assetServiceId' })
  assetService?: Relation<AssetService>;

  @ApiProperty({ required: false })
  @Column({ type: 'uuid', nullable: true })
  assetId?: string;

  @ManyToOne(() => Asset, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'assetId' })
  asset?: Relation<Asset>;

  @ApiProperty()
  @Column({ type: 'inet' })
  ip: string;

  @ApiProperty({ enum: ['httpx_a', 'resolver', 'dns_a', 'dns_aaaa'] })
  @Column({ type: 'varchar' })
  source: IpObservationSource;

  @ApiProperty({ required: false })
  @Column({ type: 'varchar', nullable: true })
  jobHistoryId?: string;
}
