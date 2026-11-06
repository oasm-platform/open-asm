import { BaseEntity } from '@/common/entities/base.entity';
import { IssueLinkResourceType } from '@/common/enums/enum';
import { User } from '@/modules/auth/entities/user.entity';
import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  Relation,
  Unique,
} from 'typeorm';
import { Issue } from './issue.entity';

/**
 * What an issue is about. Polymorphic on purpose: an issue can point at any
 * kind of resource, several at once, and a new kind needs no schema change.
 * The price is no foreign key to the resource, so readers must tolerate a
 * link whose resource has been deleted.
 */
@Entity('issue_links')
@Unique('UQ_issue_links_issue_resource', ['issueId', 'resourceType', 'resourceId'])
@Index('IDX_issue_links_resource', ['resourceType', 'resourceId'])
export class IssueLink extends BaseEntity {
  @ApiProperty()
  @Column({ type: 'uuid' })
  issueId: string;

  @ManyToOne(() => Issue, (issue) => issue.links, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'issueId' })
  issue: Relation<Issue>;

  @ApiProperty({ enum: IssueLinkResourceType })
  @Column({ type: 'varchar' })
  resourceType: IssueLinkResourceType;

  @ApiProperty()
  @Column({ type: 'uuid' })
  resourceId: string;

  /** Null when a rule attached it. */
  @ApiProperty({ required: false, nullable: true, type: String })
  @Column({ type: 'uuid', nullable: true })
  addedById?: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'addedById' })
  addedBy?: Relation<User>;
}
