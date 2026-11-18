import { BaseEntity } from '@/common/entities/base.entity';
import { JobHistory } from '@/modules/jobs-registry/entities/job-history.entity';
import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
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
import { AssetService } from './asset-services.entity';

@Entity('discovered_urls')
@Unique('UQ_discovered_urls_service_url', ['assetServiceId', 'url'])
@Index('IDX_discovered_urls_service_createdAt', ['assetServiceId', 'createdAt'])
// Tenant scope (attack-surface-query): workspaceId and targetId equal the service's.
@ForeignKey(() => AssetService, ['assetServiceId', 'workspaceId'], ['id', 'workspaceId'], {
  name: 'FK_discovered_urls_service_workspace',
  onDelete: 'CASCADE',
})
@ForeignKey(() => AssetService, ['assetServiceId', 'targetId'], ['id', 'targetId'], {
  name: 'FK_discovered_urls_service_target',
  onDelete: 'CASCADE',
})
@Index('IDX_discovered_urls_workspace_createdAt', ['workspaceId', 'createdAt', 'id'])
@Index('IDX_discovered_urls_url_trgm', { synchronize: false })
export class DiscoveredUrl extends BaseEntity {
  /** The service's workspace (denormalized, see Asset.workspaceId). */
  @Column({ type: 'uuid' })
  workspaceId: string;

  /** The service's target (denormalized for "new" rows). */
  @Column({ type: 'uuid' })
  targetId: string;

  @ApiProperty()
  @IsString()
  @Column({ type: 'varchar' })
  url: string;

  @Column({ type: 'uuid' })
  assetServiceId: string;

  @ManyToOne(() => AssetService, (assetService) => assetService.discoveredUrls, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'assetServiceId' })
  assetService: Relation<AssetService>;

  @Column({ type: 'uuid', nullable: true })
  jobHistoryId: string;

  @ManyToOne(() => JobHistory, (jobHistory) => jobHistory.discoveredUrls, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'jobHistoryId' })
  jobHistory: Relation<JobHistory>;
}
