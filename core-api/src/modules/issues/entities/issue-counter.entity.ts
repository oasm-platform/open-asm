import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Relation,
} from 'typeorm';

/**
 * Last issue number handed out per workspace. Numbers come from here rather
 * than from max(no) so deleting the newest issue never frees its number for
 * the next one: "#12" keeps meaning the same issue in links and notes.
 */
@Entity('issue_counters')
export class IssueCounter {
  @PrimaryColumn({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Relation<Workspace>;

  @Column({ type: 'integer', default: 0 })
  lastNo: number;
}
