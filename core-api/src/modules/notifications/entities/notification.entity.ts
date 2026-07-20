import { BaseEntity } from '@/common/entities/base.entity';
import { NotificationScope, NotificationType } from '@/common/enums/enum';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';

@Entity('notifications')
@Index('IDX_notifications_workspaceId', ['workspace'])
export class Notification extends BaseEntity {
  @Column({ type: 'varchar' })
  scope: NotificationScope;

  @Column({ type: 'varchar' })
  type: NotificationType;

  @Column('jsonb')
  metadata: Record<string, string>;

  @Column({ type: 'uuid', nullable: true })
  workspaceId?: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Relation<Workspace>;
}
