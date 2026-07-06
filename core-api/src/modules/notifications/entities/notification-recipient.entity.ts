import { BaseEntity } from '@/common/entities/base.entity';
import { NotificationStatus } from '@/common/enums/enum';
import { User } from '@/modules/auth/entities/user.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { Notification } from './notification.entity';

@Entity('notification_recipients')
@Index('IDX_notif_recipient_userId', ['user', 'createdAt'])
@Index('IDX_notif_recipient_notifId', ['notification'])
export class NotificationRecipient extends BaseEntity {
  @Column({ type: 'uuid' })
  notificationId: string;

  @ManyToOne(() => Notification, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'notificationId' })
  notification: Relation<Notification>;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: Relation<User>;

  @Column({
    type: 'enum',
    enum: NotificationStatus,
    default: NotificationStatus.SENT,
  })
  status: NotificationStatus;
}
