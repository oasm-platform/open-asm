import { BaseEntity } from '@/common/entities/base.entity';
import { AssetGroupAsset } from '@/modules/asset-group/entities/asset-groups-assets.entity';
import { JobHistory } from '@/modules/jobs-registry/entities/job-history.entity';
import { Job } from '@/modules/jobs-registry/entities/job.entity';
import { Target } from '@/modules/targets/entities/target.entity';
import { Vulnerability } from '@/modules/vulnerabilities/entities/vulnerability.entity';
import { ApiProperty } from '@nestjs/swagger';
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
import { AssetService } from './asset-services.entity';
import { DnsRecord } from './dns-record.entity';

@Entity('assets')
@Unique(['value', 'target'])
@Index('IDX_assets_targetId', ['targetId'])
@Index('IDX_assets_targetId_isEnabled', ['targetId', 'isEnabled'])
@Index('IDX_assets_jobHistoryId', ['jobHistoryId'])
export class Asset extends BaseEntity {
  @ApiProperty()
  @Column()
  value: string;

  @ApiProperty()
  @Column({ type: 'varchar', nullable: true })
  targetId: string;

  // Relationships
  @ManyToOne(() => Target, (target) => target.assets, {
    onDelete: 'CASCADE',
  })
  target: Relation<Target>;

  /**
   * The run that first found this asset. Set on insert only, so a re-scan that
   * finds it again keeps the original run. NULL for assets created outside a
   * run (the target's primary asset, cloud integration imports) and for assets
   * that predate this column.
   */
  @Column({ type: 'uuid', nullable: true })
  jobHistoryId?: string | null;

  // Provenance only: deleting the run must not delete the asset.
  @ManyToOne(() => JobHistory, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'jobHistoryId' })
  jobHistory?: Relation<JobHistory>;

  @ApiProperty()
  @Column({ default: false })
  isPrimary?: boolean;

  @OneToMany(() => Job, (job) => job.asset, {
    onDelete: 'CASCADE',
  })
  jobs?: Relation<Job[]>;

  @ApiProperty()
  @Column({ type: 'json', nullable: true })
  dnsRecords?: object;

  @OneToMany(() => AssetService, (assetService) => assetService.asset, {
    onDelete: 'CASCADE',
  })
  assetServices?: Relation<AssetService[]>;

  @OneToMany(() => Vulnerability, (vulnerability) => vulnerability.asset, {
    onDelete: 'CASCADE',
  })
  vulnerabilities?: Relation<Vulnerability[]>;

  @OneToMany(() => AssetGroupAsset, (aga) => aga.asset, {
    onDelete: 'CASCADE',
  })
  assetGroupAssets?: Relation<AssetGroupAsset[]>;

  @OneToMany(() => DnsRecord, (dns) => dns.asset, {
    onDelete: 'CASCADE',
  })
  dnsRecordRows?: Relation<DnsRecord[]>;

  @ApiProperty()
  @Column({ default: true })
  isEnabled: boolean;

  /**
   * Kind-specific attributes. For a repository asset (GIT_ORG target):
   * {@link RepositoryAssetMetadata}. Null for host assets.
   */
  @ApiProperty({
    required: false,
    nullable: true,
    type: Object,
    additionalProperties: true,
  })
  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown> | null;
}

/**
 * Metadata of a repository asset. `remoteId` is the provider's stable id: a
 * renamed repository keeps its asset (and its findings) instead of turning
 * into a new one.
 */
export interface RepositoryAssetMetadata {
  provider: string;
  remoteId: string;
  fullName: string;
  url: string;
  defaultBranch: string | null;
  private: boolean;
  archived: boolean;
  fork: boolean;
  pushedAt: string | null;
}
