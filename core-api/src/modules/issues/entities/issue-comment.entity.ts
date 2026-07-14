import { BaseEntity } from '@/common/entities/base.entity';
import { IssueCommentType } from '@/common/enums/enum';
import { User } from '@/modules/auth/entities/user.entity';
import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  Relation,
} from 'typeorm';
import { Issue } from './issue.entity';

@Entity('issue_comments')
@Index('IDX_issue_comments_issueId', ['issue', 'createdAt'])
export class IssueComment extends BaseEntity {
  @ApiProperty()
  @Column()
  content: string;

  @ApiProperty({ type: () => User })
  @ManyToOne(() => User)
  @JoinColumn({ name: 'createdById' })
  createdBy: Relation<User>;

  @Column({ nullable: true })
  createdById: string;

  @ManyToOne(() => Issue, (issue) => issue.comments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'issueId' })
  issue: Relation<Issue>;

  @Column({ nullable: false })
  issueId: string;

  @ApiProperty()
  @Column({ default: true })
  isCanDelete: boolean;

  @ApiProperty()
  @Column({ default: true })
  isCanEdit: boolean;

  @ApiProperty({
    enum: IssueCommentType,
    default: IssueCommentType.CONTENT,
  })
  @Column({ type: 'varchar', default: IssueCommentType.CONTENT })
  type: IssueCommentType;

  @ApiProperty({ required: false })
  @Column({ nullable: true })
  repCommentId: string;

  @ManyToOne(() => IssueComment)
  @JoinColumn({ name: 'repCommentId' })
  @ApiProperty({ type: () => IssueComment })
  repComment: Relation<IssueComment>;

  @DeleteDateColumn()
  deletedAt: Date;
}
