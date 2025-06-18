import { BaseEntity } from 'src/common/entities/base.entity';
import { Column, Entity, OneToMany } from 'typeorm';
import { WorkspaceTarget } from './workspace-target.entity';
import { ApiProperty } from '@nestjs/swagger';

@Entity('targets')
export class Target extends BaseEntity {
  @ApiProperty({
    example: 'https://example.com',
    description: 'The target value',
  })
  @Column({ unique: true })
  value: string;

  @Column({ nullable: true, default: () => 'CURRENT_TIMESTAMP' })
  lastDiscoveredAt: Date;

  @ApiProperty({
    example: true,
    description: 'Whether to re-scan the target',
  })
  @Column({ default: false })
  isReScan: boolean;

  @OneToMany(() => WorkspaceTarget, (workspaceTarget) => workspaceTarget.target)
  workspaceTargets: WorkspaceTarget[];
}
