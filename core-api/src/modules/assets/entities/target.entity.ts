import { BaseEntity } from 'src/common/entities/base.entity';
import { Column, Entity, OneToMany } from 'typeorm';
import { WorkspaceTarget } from './workspace-target.entity';

@Entity('targets')
export class Target extends BaseEntity {
  @Column()
  value: string;

  @Column({ nullable: true, default: () => 'CURRENT_TIMESTAMP' })
  lastDiscoveredAt: Date;

  @Column({ default: false })
  isReScan: boolean;

  @OneToMany(() => WorkspaceTarget, (workspaceTarget) => workspaceTarget.target)
  workspaceTargets: WorkspaceTarget[];
}
