import { BaseEntity } from '@/common/entities/base.entity';
import { User } from '@/modules/auth/entities/user.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { Column, Entity, JoinColumn, ManyToOne, Relation } from 'typeorm';

/** A builtin report generated on a cron, run with the owner's permissions at fire time. */
@Entity('report_schedules')
export class ReportSchedule extends BaseEntity {
  @Column('uuid')
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Relation<Workspace>;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: Relation<User>;

  @Column('varchar')
  type: 'SUMMARY' | 'VULNERABILITY';

  /** `targetIds`, `minSeverity`; no dates, every run covers all data. */
  @Column('jsonb', { default: {} })
  options: { targetIds?: string[]; minSeverity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO' };

  /** 5-field cron, UTC. */
  @Column('varchar')
  cron: string;
}
