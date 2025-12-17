import { BaseEntity } from '@/common/entities/base.entity';
import { User } from '@/modules/auth/entities/user.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Issue } from './issue.entity';

@Entity('issue_comments')
export class IssueComment extends BaseEntity {
  @ApiProperty()
  @Column()
  content: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @Column({ nullable: true })
  createdById: string;

  @ManyToOne(() => Issue, (issue) => issue.comments)
  @JoinColumn({ name: 'issueId' })
  issue: Issue;

  @Column({ nullable: true })
  issueId: string;
}
