import { BullMQName, NotificationStatus } from '@/common/enums/enum';
import { User } from '@/modules/auth/entities/user.entity';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { I18nService } from 'nestjs-i18n';
import { In, Repository } from 'typeorm';
import { NotificationRecipient } from '../entities/notification-recipient.entity';
import { Notification } from '../entities/notification.entity';

import { NotificationsService } from '../notifications.service';

@Processor(BullMQName.NOTIFICATION)
export class NotificationsConsumer extends WorkerHost {
  constructor(
    @InjectRepository(Notification)
    private notificationRepo: Repository<Notification>,
    @InjectRepository(NotificationRecipient)
    private notificationRecipientRepo: Repository<NotificationRecipient>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private readonly i18n: I18nService,
    private notificationsService: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<any>): Promise<void> {
    const { recipients, type, content } = job.data;
    // Create notification
    const notification = await this.notificationRepo.save({
      type,
      content,
    });

    // Fetch users to get their language
    const users = await this.userRepo.findBy({
      id: In(recipients),
    });

    const recipientEntities: Partial<NotificationRecipient>[] = [];

    // Create recipient entities without message logic first
    for (const user of users) {
      recipientEntities.push({
        notificationId: notification.id,
        userId: user.id,
        status: NotificationStatus.SENT,
      });
    }

    if (recipientEntities.length > 0) {
      const savedRecipients = await this.notificationRecipientRepo.save(
        recipientEntities,
      );

      // Now iterate to send realtime notifications with translated message
      for (const recipient of savedRecipients) {
        // Find the user to get language (optimization: map user by id earlier)
        const user = users.find(u => u.id === recipient.userId);
        
        const message = this.i18n.translate<string>(content.key, {
          lang: user?.language || 'en',
          args: content.metadata || {},
        }) as unknown as string;

        // Attach message to payload for SSE/Websocket
        const payload = {
            ...recipient,
            message,
            notification // attach notification details if needed
        };
        // We need to type cast or adjust sendToUser to accept DTO or extended type
        this.notificationsService.sendToUser(recipient.userId, payload as any);
      }
    }
  }
}
