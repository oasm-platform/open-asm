import { BullMQName, NotificationStatus } from '@/common/enums/enum';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
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
  ) {
    super();
  }

  async process(job: Job<any>): Promise<void> {
    const { recipients, type, content } = job.data;

    const notification = await this.notificationRepo.save({
      type,
      content,
    });

    const recipientEntities = recipients.map((userId: string) => ({
      notificationId: notification.id,
      userId,
      status: NotificationStatus.SENT,
    }));

    await this.notificationRecipientRepo.save(recipientEntities);
  }
}
