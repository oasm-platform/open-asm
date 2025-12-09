import { BullMQName, NotificationType } from '@/common/enums/enum';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectQueue(BullMQName.NOTIFICATION)
    private notificationQueue: Queue,
  ) {}

  async createNotification(
    recipients: string[],
    type: NotificationType,
    content: { key: string; metadata?: Record<string, any> },
  ) {
    await this.notificationQueue.add('create-notification', {
      recipients,
      type,
      content,
    });
  }
}
