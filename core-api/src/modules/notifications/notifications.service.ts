import { BullMQName, NotificationStatus, NotificationType } from '@/common/enums/enum';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, MessageEvent } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { filter, map, Observable, Subject } from 'rxjs';
import { Repository } from 'typeorm';
import { NotificationRecipient } from './entities/notification-recipient.entity';

import { I18nService } from 'nestjs-i18n';
import { NotificationResponseDto } from './dto/notification.dto';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectQueue(BullMQName.NOTIFICATION)
    private notificationQueue: Queue,
    @InjectRepository(NotificationRecipient)
    private notificationRecipientRepo: Repository<NotificationRecipient>,
    private readonly i18n: I18nService,
  ) {}

  private notificationSubject = new Subject<{
    userId: string;
    data: NotificationRecipient;
  }>();

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

  sendToUser(userId: string, data: NotificationRecipient) {
    console.log(`[NotificationsService] Sending to user ${userId}:`, data.id);
    this.notificationSubject.next({ userId, data });
  }

  subscribeToStream(userId: string): Observable<MessageEvent> {
    console.log(`[NotificationsService] User ${userId} subscribing to stream`);
    return this.notificationSubject.asObservable().pipe(
      filter((event) => event.userId === userId),
      map((event) => {
        return {
          data: event.data,
        } as MessageEvent;
      }),
    );
  }

  async getNotifications(userId: string, page: number, limit: number, lang: string = 'en') {
    const offset = (page - 1) * limit;
    const [notifications, total] = await this.notificationRecipientRepo
      .createQueryBuilder('recipient')
      .leftJoinAndSelect('recipient.notification', 'notification')
      .where('recipient.userId = :userId', { userId })
      .orderBy('recipient.createdAt', 'DESC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    const data = await Promise.all(
      notifications.map(async (n) => {
        const message = this.i18n.translate<string>(n.notification.content.key, {
          lang,
          args: n.notification.content.metadata || {},
        }) as unknown as string;

        return {
          ...n,
          message,
        } as NotificationResponseDto;
      })
    );

    return {
      data,
      total,
      page,
      limit,
    };
  }

  async getUnreadCount(userId: string) {
    return this.notificationRecipientRepo.count({
      where: {
        userId,
        status: NotificationStatus.SENT,
      },
    });
  }

  async markAllAsRead(userId: string) {
    return this.notificationRecipientRepo.update(
      { userId, status: NotificationStatus.SENT },
      { status: NotificationStatus.UNREAD },
    );
  }

  async markAsRead(id: string, userId: string) {
    return this.notificationRecipientRepo.update(
      { id, userId },
      { status: NotificationStatus.READED },
    );
  }
}
