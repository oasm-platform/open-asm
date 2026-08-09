import { BullMQName, NotificationStatus } from '@/common/enums/enum';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { In, Repository } from 'typeorm';
import { NotificationRecipient } from './entities/notification-recipient.entity';
import { Notification } from './entities/notification.entity';

import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { RedisService } from '@/services/redis/redis.service';
import { getManyResponse } from '@/utils/getManyResponse';
import { I18nService } from 'nestjs-i18n';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationResponseDto } from './dto/notification.dto';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectQueue(BullMQName.NOTIFICATION)
    private notificationQueue: Queue,
    @InjectRepository(NotificationRecipient)
    private notificationRecipientRepo: Repository<NotificationRecipient>,
    @InjectRepository(Notification)
    private notificationRepo: Repository<Notification>,
    private readonly i18n: I18nService,
    private readonly redisService: RedisService,
  ) {}

  async createNotification(body: CreateNotificationDto) {
    await this.notificationQueue.add(BullMQName.NOTIFICATION, body);
  }

  subscribeToStream(userId: string) {
    return this.redisService.subscriber.subscribe(`notification:${userId}`);
  }

  async getNotifications(
    userId: string,
    workspaceId: string | undefined,
    query: GetManyBaseQueryParams,
    lang: string = 'en',
  ) {
    const offset = (query.page - 1) * query.limit;
    const [notifications, total] = await this.notificationRecipientRepo
      .createQueryBuilder('recipient')
      .leftJoinAndSelect('recipient.notification', 'notification')
      .where('recipient.userId = :userId', { userId })
      .andWhere(
        workspaceId
          ? '(notification.workspaceId = :workspaceId OR notification.workspaceId IS NULL)'
          : 'notification.workspaceId IS NULL',
        { workspaceId },
      )
      .orderBy('recipient.createdAt', 'DESC')
      .select([
        'recipient.id',
        'recipient.status',
        'recipient.createdAt',
        'notification.id',
        'notification.type',
        'notification.metadata',
        'notification.workspaceId',
        'notification.ref',
        'notification.refId',
      ])
      .skip(offset)
      .take(query.limit)
      .getManyAndCount();
    const data: NotificationResponseDto[] = notifications.map((n) => {
      const key = `notification.${n.notification.type}`;
      const message = this.i18n.translate<string>(key, {
        lang,
        args: n.notification.metadata || {},
      }) as string;
      const url = this.i18n.translate<string>(key, {
        lang: 'routers',
        args: n.notification.metadata || {},
      }) as string;

      return {
        id: n.id,
        status: n.status,
        createdAt: n.createdAt,
        message,
        url,
        workspaceId: n.notification.workspaceId ?? undefined,
        ref: n.notification.ref ?? undefined,
        refId: n.notification.refId ?? undefined,
      };
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

  async deleteNotification(id: string, userId: string) {
    return this.notificationRecipientRepo.delete({ id, userId });
  }

  /**
   * Deletes notifications tagged with the given {@link ref}/{@link refId}.
   *
   * Without {@link userId} this is a global cleanup — the Notification rows
   * are removed and recipients cascade. With {@link userId} only that user's
   * recipient records are removed, keeping the notification for other users
   * (same semantics as {@link deleteNotification}).
   */
  async deleteByRef(ref: string, refId: string, userId?: string) {
    const where = { ref, refId };

    if (userId) {
      const notifications = await this.notificationRepo.find({
        where,
        select: ['id'],
      });
      if (notifications.length === 0) return;
      return this.notificationRecipientRepo.delete({
        userId,
        notificationId: In(notifications.map((n) => n.id)),
      });
    }

    return this.notificationRepo.delete(where);
  }
}
