import { BaseEntity } from '@/common/entities/base.entity';
import { NotificationStatus } from '@/common/enums/enum';
import { User } from '@/modules/auth/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Notification } from './notification.entity';

@Entity('notification_recipients')
export class NotificationRecipient extends BaseEntity {
  @Column({ type: 'uuid' })
  notificationId: string;

  @ManyToOne(() => Notification)
  @JoinColumn({ name: 'notificationId' })
  notification: Notification;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({
    type: 'enum',
    enum: NotificationStatus,
    default: NotificationStatus.SENT,
  })
  status: NotificationStatus;
}
