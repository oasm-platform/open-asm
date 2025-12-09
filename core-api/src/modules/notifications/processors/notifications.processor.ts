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

    for (const user of users) {
      // Translate message
      const message = this.i18n.translate<string>(content.key, {
        lang: user.language || 'en',
        args: content.metadata || {},
      }) as unknown as string;

      recipientEntities.push({
        notificationId: notification.id,
        userId: user.id,
        status: NotificationStatus.SENT,
        message,
      });
    }

    if (recipientEntities.length > 0) {
      const savedRecipients = await this.notificationRecipientRepo.save(
        recipientEntities,
      );

      for (const recipient of savedRecipients) {
        this.notificationsService.sendToUser(recipient.userId, recipient);
      }
    }
  }
}
