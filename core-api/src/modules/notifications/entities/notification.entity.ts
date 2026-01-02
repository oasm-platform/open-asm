import { BaseEntity } from '@/common/entities/base.entity';
import { NotificationScope, NotificationType } from '@/common/enums/enum';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('notifications')
export class Notification extends BaseEntity {
  @Column({ type: 'enum', enum: NotificationScope })
  scope: NotificationScope;

  @Column({ type: 'enum', enum: NotificationType })
  type: NotificationType;

  @Column('jsonb')
  metadata: Record<string, string>;

  @Column({ type: 'uuid', nullable: true })
  workspaceId?: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Workspace;
}
