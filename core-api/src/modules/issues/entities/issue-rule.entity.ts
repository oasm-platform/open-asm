import { BaseEntity } from '@/common/entities/base.entity';
import {
  IssuePriority,
  IssueRuleGroupBy,
  IssueType,
  Severity,
} from '@/common/enums/enum';
import { User } from '@/modules/auth/entities/user.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';

/** Conditions an event must meet; every field present must match. */
export interface IssueRuleConditions {
  /** Minimum severity of a vulnerability. */
  minSeverity?: Severity;
  /** Minimum EPSS score of a vulnerability. */
  minEpss?: number;
  /** Only these targets; empty or absent means every target. */
  targetIds?: string[];
}

/**
 * Event → conditions → open (or extend) an issue of `issueType`.
 * `event` is a catalog name such as `vulnerability.detected`.
 */
@Entity('issue_rules')
@Index('IDX_issue_rules_workspaceId_event', ['workspaceId', 'event'])
export class IssueRule extends BaseEntity {
  @ApiProperty()
  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Relation<Workspace>;

  @ApiProperty()
  @Column()
  name: string;

  @ApiProperty()
  @Column({ default: true })
  enabled: boolean;

  @ApiProperty()
  @Column({ type: 'varchar' })
  event: string;

  @ApiProperty({ type: Object })
  @Column({ type: 'jsonb', default: {} })
  conditions: IssueRuleConditions;

  @ApiProperty({ enum: IssueType })
  @Column({ type: 'varchar' })
  issueType: IssueType;

  @ApiProperty({ enum: IssueRuleGroupBy })
  @Column({ type: 'varchar', default: IssueRuleGroupBy.VULNERABILITY_NAME })
  groupBy: IssueRuleGroupBy;

  /** Fixed priority; null derives it from the highest severity matched. */
  @ApiProperty({ enum: IssuePriority, required: false, nullable: true })
  @Column({ type: 'varchar', nullable: true })
  priority?: IssuePriority | null;

  @ApiProperty({ required: false, nullable: true, type: String })
  @Column({ type: 'uuid', nullable: true })
  defaultAssigneeId?: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'defaultAssigneeId' })
  defaultAssignee?: Relation<User>;

  @ApiProperty({ required: false, nullable: true, type: String })
  @Column({ type: 'uuid', nullable: true })
  createdById?: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'createdById' })
  createdBy?: Relation<User>;
}
