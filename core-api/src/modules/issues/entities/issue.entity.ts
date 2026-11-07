import { BaseEntity } from '@/common/entities/base.entity';
import {
  IssuePriority,
  IssueResolution,
  IssueStatus,
  IssueType,
} from '@/common/enums/enum';
import { User } from '@/modules/auth/entities/user.entity';
import { Comment } from '@/modules/comments/entities/comment.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Relation,
} from 'typeorm';
import { IssueLink } from './issue-link.entity';
import { IssueRule } from './issue-rule.entity';

/** External tracker reference, e.g. a Jira key. */
export interface IssueExternalRef {
  provider: string;
  key: string;
  url?: string;
}

/**
 * A unit of work. The core is the same for every `type`; what a type means
 * (progress, when it resolves or reopens) lives in its IssueTypeHandler, and
 * what it is about lives in `issue_links`.
 */
@Entity('issues')
@Index('IDX_issues_workspaceId_status', ['workspace', 'status'])
@Index('IDX_issues_workspaceId_no', ['workspaceId', 'no'], { unique: true })
@Index('IDX_issues_assigneeId', ['assigneeId'])
@Index('IDX_issues_open_groupKey', ['workspaceId', 'type', 'groupKey'], {
  unique: true,
  where: `"groupKey" IS NOT NULL AND "status" IN ('open', 'in_progress')`,
})
export class Issue extends BaseEntity {
  @ApiProperty()
  @Column()
  title: string;

  @ApiProperty()
  @Column({ nullable: true })
  description?: string;

  @ApiProperty({ enum: IssueType })
  @Column({ type: 'varchar', default: IssueType.TASK })
  type: IssueType;

  @ApiProperty({ enum: IssueStatus })
  @Column({
    type: 'varchar',
    default: IssueStatus.OPEN,
  })
  status: IssueStatus;

  @ApiProperty({ enum: IssuePriority })
  @Column({ type: 'varchar', default: IssuePriority.P3 })
  priority: IssuePriority;

  @ApiProperty({ enum: IssueResolution, required: false, nullable: true })
  @Column({ type: 'varchar', nullable: true })
  resolution?: IssueResolution | null;

  @ApiProperty({ required: false, nullable: true, type: Date })
  @Column('timestamptz', { nullable: true })
  resolvedAt?: Date | null;

  @ApiProperty({ required: false, nullable: true, type: Date })
  @Column('timestamptz', { nullable: true })
  dueAt?: Date | null;

  @ApiProperty({ required: false, nullable: true, type: String })
  @Column({ type: 'uuid', nullable: true })
  assigneeId?: string | null;

  @ApiProperty({ type: () => User, required: false })
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assigneeId' })
  assignee?: Relation<User>;

  /** Rule that created the issue; null when created by hand. */
  @ApiProperty({ required: false, nullable: true, type: String })
  @Column({ type: 'uuid', nullable: true })
  ruleId?: string | null;

  @ManyToOne(() => IssueRule, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'ruleId' })
  rule?: Relation<IssueRule>;

  /**
   * Rules attach new matches to the open issue with the same key instead of
   * opening another one (unique among open issues of a type).
   */
  @ApiProperty({ required: false, nullable: true, type: String })
  @Column({ type: 'varchar', nullable: true })
  groupKey?: string | null;

  @ApiProperty({ required: false, nullable: true, type: Object })
  @Column({ type: 'jsonb', nullable: true })
  externalRef?: IssueExternalRef | null;

  @ApiProperty()
  @Column({ nullable: true })
  workspaceId: string;

  @ApiProperty()
  @Column({ type: 'int', default: 0 })
  no: number;

  @ApiProperty({ type: [String] })
  @Column('simple-array', { nullable: true })
  tags?: string[];

  @ManyToOne(() => Workspace, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Relation<Workspace>;

  @ApiProperty({ type: () => User })
  @ManyToOne(() => User)
  @JoinColumn({ name: 'createdById' })
  createdBy: Relation<User>;

  @Column({ nullable: true })
  createdById: string;

  @OneToMany(() => Comment, (comment) => comment.issue)
  comments: Comment[];

  @OneToMany(() => IssueLink, (link) => link.issue)
  links: IssueLink[];
}
