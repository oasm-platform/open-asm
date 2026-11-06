import { BaseEntity } from '@/common/entities/base.entity';
import { IssueCommentType } from '@/common/enums/enum';
import { User } from '@/modules/auth/entities/user.entity';
import { Issue } from '@/modules/issues/entities/issue.entity';
import { Vulnerability } from '@/modules/vulnerabilities/entities/vulnerability.entity';
import { ApiProperty } from '@nestjs/swagger';
import {
  Check,
  Column,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  Relation,
} from 'typeorm';

/**
 * A comment on exactly one subject. Each commentable subject has its own
 * nullable foreign key (an "exclusive arc") instead of a polymorphic
 * type + id pair, so deleting the subject cascades to its comments in the
 * database — vulnerabilities disappear with their asset without any code
 * running. Add a column + CHECK branch for a new kind of subject.
 */
@Entity('comments')
@Index('IDX_comments_issueId', ['issue', 'createdAt'])
@Index('IDX_comments_vulnerabilityId', ['vulnerability', 'createdAt'])
@Check(
  'CHK_comments_one_subject',
  '("issueId" IS NOT NULL)::int + ("vulnerabilityId" IS NOT NULL)::int = 1',
)
export class Comment extends BaseEntity {
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
    nullable: true,
  })
  @JoinColumn({ name: 'issueId' })
  issue?: Relation<Issue>;

  @ApiProperty({ required: false, nullable: true, type: String })
  @Column({ type: 'uuid', nullable: true })
  issueId?: string | null;

  @ManyToOne(() => Vulnerability, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'vulnerabilityId' })
  vulnerability?: Relation<Vulnerability>;

  @ApiProperty({ required: false, nullable: true, type: String })
  @Column({ type: 'uuid', nullable: true })
  vulnerabilityId?: string | null;

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

  @ManyToOne(() => Comment)
  @JoinColumn({ name: 'repCommentId' })
  @ApiProperty({ type: () => Comment })
  repComment: Relation<Comment>;

  @DeleteDateColumn()
  deletedAt: Date;
}
