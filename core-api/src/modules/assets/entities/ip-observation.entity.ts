import { BaseEntity } from '@/common/entities/base.entity';
import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  Entity,
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
export class IpObservation extends BaseEntity {
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
