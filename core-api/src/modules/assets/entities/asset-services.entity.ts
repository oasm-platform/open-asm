import { BaseEntity } from '@/common/entities/base.entity';
import { JobHistory } from '@/modules/jobs-registry/entities/job-history.entity';
import { Job } from '@/modules/jobs-registry/entities/job.entity';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Relation,
  Unique,
} from 'typeorm';
import { AssetTag } from './asset-tags.entity';
import { Asset } from './assets.entity';
import { DiscoveredUrl } from './discovered-url.entity';
import { HttpResponse } from './http-response.entity';

@Entity('asset_services')
@Unique(['assetId', 'port'])
@Index(['createdAt'])
@Index('IDX_asset_services_jobHistoryId', ['jobHistoryId'])
export class AssetService extends BaseEntity {
  @ApiProperty()
  @Column()
  value: string;

  @ApiProperty()
  @Index()
  @Column({ type: 'integer' })
  port: number;

  @ApiProperty()
  @Column({ type: 'varchar' })
  assetId: string;

  @ManyToOne(() => Asset, (asset) => asset.assetServices, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'assetId' })
  asset: Relation<Asset>;

  /**
   * The run that first found this service. Set on insert only — the port
   * upsert never overwrites it. NULL for services that predate this column.
   */
  @Column({ type: 'uuid', nullable: true })
  jobHistoryId?: string | null;

  // Provenance only: deleting the run must not delete the service.
  @ManyToOne(() => JobHistory, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'jobHistoryId' })
  jobHistory?: Relation<JobHistory>;

  @OneToMany(() => HttpResponse, (httpResponse) => httpResponse.assetService, {
    onDelete: 'CASCADE',
  })
  httpResponses?: Relation<HttpResponse[]>;

  @OneToMany(() => DiscoveredUrl, (u) => u.assetService, {
    onDelete: 'CASCADE',
  })
  discoveredUrls?: Relation<DiscoveredUrl[]>;

  @OneToMany(() => Job, (job) => job.assetService, {
    onDelete: 'CASCADE',
  })
  jobs?: Relation<Job[]>;

  @OneToMany(() => AssetTag, (assetTag) => assetTag.assetService, {
    onDelete: 'CASCADE',
  })
  tags: Relation<AssetTag[]>;

  @ApiProperty()
  @Index({ where: '"isErrorPage" = false' })
  @Column({ default: false })
  isErrorPage?: boolean;

  @ApiProperty({ required: false })
  @Column({ nullable: true })
  @IsOptional()
  screenshotPath?: string;
}
