import { BullMQName, NotificationStatus } from '@/common/enums/enum';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { NotificationRecipient } from './entities/notification-recipient.entity';

import { I18nService } from 'nestjs-i18n';
import { NotificationResponseDto } from './dto/notification.dto';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { getManyResponse } from '@/utils/getManyResponse';
import { RedisService } from '@/services/redis/redis.service';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectQueue(BullMQName.NOTIFICATION)
    private notificationQueue: Queue,
    @InjectRepository(NotificationRecipient)
    private notificationRecipientRepo: Repository<NotificationRecipient>,
    private readonly i18n: I18nService,
    private readonly redisService: RedisService,
  ) {}

  async createNotification(body: CreateNotificationDto) {
    await this.notificationQueue.add('create-notification', body);
  }

  subscribeToStream(userId: string) {
    return this.redisService.client.subscribe(`notification:${userId}`);
  }

  async getNotifications(
    userId: string,
    query: GetManyBaseQueryParams,
    lang: string = 'en',
  ) {
    const offset = (query.page - 1) * query.limit;
    const [notifications, total] = await this.notificationRecipientRepo
      .createQueryBuilder('recipient')
      .leftJoinAndSelect('recipient.notification', 'notification')
      .where('recipient.userId = :userId', { userId })
      .orderBy('recipient.createdAt', 'DESC')
      .select([
        'recipient.id',
        'recipient.status',
        'recipient.createdAt',
        'notification.id',
        'notification.type',
        'notification.content',
      ])
      .skip(offset)
      .take(query.limit)
      .getManyAndCount();

    const data = notifications.map((n) => {
      const message = this.i18n.translate<string>(n.notification.content.key, {
        lang,
        args: n.notification.content.metadata || {},
      }) as string;

      return {
        ...n,
        message,
      } as NotificationResponseDto;
    });

    return getManyResponse({
      query,
      data,
      total,
    });
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
      { userId },
      { status: NotificationStatus.READ },
    );
  }

  async markAllAsUnread(userId: string) {
    return this.notificationRecipientRepo.update(
      { userId, status: NotificationStatus.SENT },
      { status: NotificationStatus.UNREAD },
    );
  }

  async markAsRead(id: string, userId: string) {
    return this.notificationRecipientRepo.update(
      { id, userId },
      { status: NotificationStatus.READ },
    );
  }
}
