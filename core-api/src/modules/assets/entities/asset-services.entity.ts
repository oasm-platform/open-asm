import { BaseEntity } from '@/common/entities/base.entity';
import { Job } from '@/modules/jobs-registry/entities/job.entity';
import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Unique,
} from 'typeorm';
import { AssetTag } from './asset-tags.entity';
import { Asset } from './assets.entity';
import { HttpResponse } from './http-response.entity';
import { StatusCodeAssetsView } from './status-code-assets.entity';

@Entity('asset_services')
@Unique(['assetId', 'port'])
@Index(['createdAt'])
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
  asset: Asset;

  @OneToMany(() => HttpResponse, (httpResponse) => httpResponse.assetService, {
    onDelete: 'CASCADE',
  })
  httpResponses?: HttpResponse[];

  @OneToMany(() => Job, (job) => job.assetService, {
    onDelete: 'CASCADE',
  })
  jobs?: Job[];

  @OneToMany(
    () => StatusCodeAssetsView,
    (statusCodeAssets) => statusCodeAssets.assetService,
  )
  statusCodeAssets?: StatusCodeAssetsView[];

  @OneToMany(() => AssetTag, (assetTag) => assetTag.assetService, {
    onDelete: 'CASCADE',
  })
  tags: AssetTag[];

  @ApiProperty()
  @Index({ where: '"isErrorPage" = false' })
  @Column({ default: false })
  isErrorPage?: boolean;
}
