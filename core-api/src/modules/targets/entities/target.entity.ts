import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';
import { BaseEntity } from 'src/common/entities/base.entity';
import { Asset } from 'src/modules/assets/entities/assets.entity';
import { Column, Entity, OneToMany } from 'typeorm';
import { WorkspaceTarget } from './workspace-target.entity';

@Entity('targets')
export class Target extends BaseEntity {
  @ApiProperty({
    example: 'example.com',
    description:
      'The target domain (with optional URL path, will be parsed to extract domain)',
  })
  @IsString()
  @Matches(/^(?!\d+\.\d+\.\d+\.\d+)(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/, {
    message: 'Target must be a valid domain (IP is not allowed)',
  })
  @Transform(({ value }) => {
    try {
      const hasProtocol = /^https?:\/\//.test(value);
      const url = new URL(hasProtocol ? value : `http://${value}`);
      return url.hostname;
    } catch (err) {
      return value;
    }
  })
  @Column({ unique: true, type: 'varchar' })
  value: string;

  @ApiProperty()
  @Column({
    type: 'timestamp',
    nullable: true,
    default: () => 'CURRENT_TIMESTAMP',
  })
  lastDiscoveredAt: Date;

  @Column({ type: 'boolean', default: false })
  isReScan: boolean;

  @OneToMany(() => WorkspaceTarget, (workspaceTarget) => workspaceTarget.target)
  workspaceTargets: WorkspaceTarget[];

  @OneToMany(() => Asset, (asset) => asset.target)
  assets: Asset[];
}
