import { BaseEntity } from '@/common/entities/base.entity';
import { JobHistory } from '@/modules/jobs-registry/entities/job-history.entity';
import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  Relation,
  Unique,
} from 'typeorm';
import { AssetService } from './asset-services.entity';

@Entity('discovered_urls')
@Unique('UQ_discovered_urls_service_url', ['assetServiceId', 'url'])
@Index('IDX_discovered_urls_service_createdAt', ['assetServiceId', 'createdAt'])
export class DiscoveredUrl extends BaseEntity {
  @ApiProperty()
  @IsString()
  @Column({ type: 'varchar' })
  url: string;

  @Column({ type: 'varchar' })
  assetServiceId: string;

  @ManyToOne(() => AssetService, (assetService) => assetService.discoveredUrls, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'assetServiceId' })
  assetService: Relation<AssetService>;

  @Column({ type: 'varchar', nullable: true })
  jobHistoryId: string;

  @ManyToOne(() => JobHistory, (jobHistory) => jobHistory.discoveredUrls, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'jobHistoryId' })
  jobHistory: Relation<JobHistory>;
}
