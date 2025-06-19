import { BaseEntity } from 'src/common/entities/base.entity';
import { Column, Entity, OneToMany } from 'typeorm';
import { WorkspaceTarget } from './workspace-target.entity';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsString } from 'class-validator';

@Entity('targets')
export class Target extends BaseEntity {
  @ApiProperty({
    example: 'https://example.com',
    description: 'The target value',
  })
  @IsString()
  @Column({ unique: true })
  value: string;

  @Column({ nullable: true, default: () => 'CURRENT_TIMESTAMP' })
  lastDiscoveredAt: Date;

  @Column({ default: false })
  isReScan: boolean;

  @OneToMany(() => WorkspaceTarget, (workspaceTarget) => workspaceTarget.target)
  workspaceTargets: WorkspaceTarget[];
}
