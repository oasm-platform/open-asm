import { BullMQName } from '@/common/enums/enum';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { NotificationRecipient } from './entities/notification-recipient.entity';
import { Notification } from './entities/notification.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsConsumer } from './processors/notifications.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, NotificationRecipient, User]),
    BullModule.registerQueue({
      name: BullMQName.NOTIFICATION,
    }),
  ],
  providers: [NotificationsService, NotificationsConsumer],
  exports: [NotificationsService],
})
export class NotificationsModule {}
