import { BaseEntity } from '@/common/entities/base.entity';
import { AssetGroupAsset } from '@/modules/asset-group/entities/asset-groups-assets.entity';
import { Job } from '@/modules/jobs-registry/entities/job.entity';
import { Target } from '@/modules/targets/entities/target.entity';
import { Vulnerability } from '@/modules/vulnerabilities/entities/vulnerability.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, ManyToOne, OneToMany, Unique } from 'typeorm';
import { AssetService } from './asset-services.entity';
import { IpAssetsView } from './ip-assets.entity';
import { Port } from './ports.entity';

@Entity('assets')
@Unique(['value', 'target'])
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
  target: Target;

  @ApiProperty()
  @Column({ default: false })
  isPrimary?: boolean;

  @OneToMany(() => Job, (job) => job.asset, {
    onDelete: 'CASCADE',
  })
  jobs?: Job[];

  @OneToMany(() => Port, (port) => port.asset, {
    onDelete: 'CASCADE',
  })
  ports?: Port[];

  @ApiProperty()
  @Column({ type: 'json', nullable: true })
  dnsRecords?: object;

  @OneToMany(() => AssetService, (assetService) => assetService.asset, {
    onDelete: 'CASCADE',
  })
  assetServices?: AssetService[];

  @OneToMany(() => Vulnerability, (vulnerability) => vulnerability.asset, {
    onDelete: 'CASCADE',
  })
  vulnerabilities?: Vulnerability[];

  @OneToMany(() => AssetGroupAsset, (aga) => aga.asset, {
    onDelete: 'CASCADE',
  })
  assetGroupAssets?: AssetGroupAsset[];

  @OneToMany(() => IpAssetsView, (ipAssets) => ipAssets.asset)
  ipAssets?: IpAssetsView[];

  @ApiProperty()
  @Column({ default: true })
  isEnabled: boolean;
}
