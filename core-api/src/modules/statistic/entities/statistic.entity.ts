import { BaseEntity } from '@/common/entities/base.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, ManyToOne } from 'typeorm';
import { Workspace } from '../../workspaces/entities/workspace.entity';

@Entity('workspace_statistics')
export class Statistic extends BaseEntity {
  @ApiProperty({ description: 'Number of assets', default: 0 })
  @Column({ default: 0 })
  assets: number;

  @ApiProperty({ description: 'Number of targets', default: 0 })
  @Column({ default: 0 })
  targets: number;

  @ApiProperty({ description: 'Number of vulnerabilities', default: 0 })
  @Column({ default: 0 })
  vuls: number;

  @ApiProperty({
    description: 'Number of critical vulnerabilities',
    default: 0,
  })
  @Column({ default: 0 })
  criticalVuls: number;

  @ApiProperty({
    description: 'Number of high severity vulnerabilities',
    default: 0,
  })
  @Column({ default: 0 })
  highVuls: number;

  @ApiProperty({
    description: 'Number of medium severity vulnerabilities',
    default: 0,
  })
  @Column({ default: 0 })
  mediumVuls: number;

  @ApiProperty({
    description: 'Number of low severity vulnerabilities',
    default: 0,
  })
  @Column({ default: 0 })
  lowVuls: number;

  @ApiProperty({
    description: 'Number of info severity vulnerabilities',
    default: 0,
  })
  @Column({ default: 0 })
  infoVuls: number;

  @ApiProperty({ description: 'Number of technologies detected', default: 0 })
  @Column({ default: 0 })
  techs: number;

  @ApiProperty({ description: 'Number of ports', default: 0 })
  @Column({ default: 0 })
  ports: number;

  @ApiProperty({ description: 'Number of services', default: 0 })
  @Column({ default: 0 })
  services: number;

  @ApiProperty({ description: 'Security score', default: 0 })
  @Column({ default: 0, type: 'decimal', precision: 5, scale: 2 })
  score: number;

  @ManyToOne(() => Workspace, (workspace) => workspace.statistics)
  workspace: Workspace;
}
