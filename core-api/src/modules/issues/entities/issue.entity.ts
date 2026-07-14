import { BaseEntity } from '@/common/entities/base.entity';
import { IssueSourceType, IssueStatus } from '@/common/enums/enum';
import { User } from '@/modules/auth/entities/user.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, Relation } from 'typeorm';
import { IssueComment } from './issue-comment.entity';

@Entity('issues')
@Index('IDX_issues_workspaceId_status', ['workspace', 'status'])
@Index(
  'IDX_issues_sourceType_sourceId_workspaceId_open',
  ['sourceType', 'sourceId', 'workspaceId'],
  { where: "status = 'open' AND \"sourceType\" IS NOT NULL AND \"sourceId\" IS NOT NULL" },
)
export class Issue extends BaseEntity {
  @ApiProperty()
  @Column()
  title: string;

  @ApiProperty()
  @Column({ nullable: true })
  description?: string;

  @ApiProperty()
  @Column({
    type: 'varchar',
    default: IssueStatus.OPEN,
  })
  status: IssueStatus;

  @ApiProperty()
  @Column({
    type: 'varchar',
    nullable: true,
  })
  sourceType: IssueSourceType;

  @ApiProperty()
  @Column({ nullable: true })
  sourceId: string;

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

  @OneToMany(() => IssueComment, (comment) => comment.issue)
  comments: IssueComment[];
}
