import { ApiProperty } from '@nestjs/swagger';
import { IsArray } from 'class-validator';
import { BaseEntity } from 'src/common/entities/base.entity';
import { Job } from 'src/modules/jobs-registry/entities/job.entity';
import { Target } from 'src/modules/targets/entities/target.entity';
import { Vulnerability } from 'src/modules/vulnerabilities/entities/vulnerability.entity';
import { Column, Entity, ManyToOne, OneToMany, Unique } from 'typeorm';
import { HttpResponse } from './http-response.entity';
import { IpAssetsView } from './ip-assets.entity';
import { Port } from './ports.entity';
import { StatusCodeAssetsView } from './status-code-assets.entity';

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

  @ApiProperty({ type: [String], nullable: true, default: [] })
  @IsArray()
  @Column('text', { array: true, nullable: true })
  tags: string[];

  @ApiProperty()
  @Column({ default: false })
  isErrorPage?: boolean;

  @OneToMany(() => HttpResponse, (httpResponse) => httpResponse.asset, {
    onDelete: 'CASCADE',
  })
  httpResponses?: HttpResponse[];

  @OneToMany(() => Vulnerability, (vulnerability) => vulnerability.asset, {
    onDelete: 'CASCADE',
  })
  vulnerabilities?: Vulnerability[];

  @OneToMany(() => IpAssetsView, (ipAssets) => ipAssets.asset)
  ipAssets?: IpAssetsView[];

  @OneToMany(
    () => StatusCodeAssetsView,
    (statusCodeAssets) => statusCodeAssets.asset,
  )
  statusCodeAssets?: StatusCodeAssetsView[];
}
