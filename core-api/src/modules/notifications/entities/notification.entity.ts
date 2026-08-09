import { BaseEntity } from '@/common/entities/base.entity';
import { NotificationScope, NotificationType } from '@/common/enums/enum';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';

@Entity('notifications')
@Index('IDX_notifications_workspaceId', ['workspace'])
@Index('IDX_notifications_ref', ['ref', 'refId'])
export class Notification extends BaseEntity {
  @Column({ type: 'varchar' })
  scope: NotificationScope;

  @Column({ type: 'varchar' })
  type: NotificationType;

  @Column('jsonb')
  metadata: Record<string, string>;

  /**
   * Name of the feature this notification belongs to (e.g. 'target'),
   * used together with {@link refId} to locate/delete notifications
   * once the related work is completed.
   */
  @Column({ type: 'varchar', nullable: true })
  ref?: string;

  /**
   * Identifier of the related feature record (e.g. '1234').
   */
  @Column({ type: 'varchar', nullable: true })
  refId?: string;

  @Column({ type: 'uuid', nullable: true })
  workspaceId?: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Relation<Workspace>;
}
