import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { NotificationRecipient } from './entities/notification-recipient.entity';
import { Notification } from './entities/notification.entity';
import { NotificationsService } from './notifications.service';

import { NotificationsController } from './notifications.controller';

/**
 * Notification READ side (list, unread count, mark read, SSE stream) plus the
 * direct write path for notifications addressed to specific users.
 *
 * It no longer registers a BullMQ queue or a consumer: everything addressed to
 * a workspace is produced by the `notifications` consumer group in
 * `EventBridgeModule`, which is where the recipient lookup lives. The only
 * writes that still come through this module are the ones whose audience is a
 * hand-picked set of user ids (workspace invitations) and therefore cannot be
 * derived from a domain event.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Notification, NotificationRecipient, User])],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
