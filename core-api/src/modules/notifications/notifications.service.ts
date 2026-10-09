import { NotificationStatus } from '@/common/enums/enum';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { NotificationRecipient } from './entities/notification-recipient.entity';
import { Notification } from './entities/notification.entity';

import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { NotificationsSinkService } from '../event-bridge/notifications.sink.service';
import { RedisService } from '@/services/redis/redis.service';
import { getManyResponse } from '@/utils/getManyResponse';
import { I18nService } from 'nestjs-i18n';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationResponseDto } from './dto/notification.dto';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(NotificationRecipient)
    private notificationRecipientRepo: Repository<NotificationRecipient>,
    @InjectRepository(Notification)
    private notificationRepo: Repository<Notification>,
    private readonly i18n: I18nService,
    private readonly redisService: RedisService,
    private readonly sink: NotificationsSinkService,
  ) {}

  /**
   * Delivers a notification to an EXPLICIT recipient list, inline.
   *
   * This is the path for notifications addressed to specific people rather than
   * to a workspace's membership — today only the workspace invitation, which
   * goes to the user who raised it. Its recipient set is a function of who was
   * invited, so it cannot be derived from a domain event, and defaulting to
   * "all members" would send invitations to people who were never involved.
   *
   * Everything addressed to a workspace goes through the `notifications`
   * consumer group instead, so this is no longer the general path — it is the
   * exception that needs a hand-picked audience.
   *
   * It writes inline rather than through a queue because the volume is a
   * handful per invitation, and the delivery path (`sink.deliver`) is shared
   * with the consumer lane — leaving exactly one implementation of what a
   * notification row looks like.
   */
  async createNotification(body: CreateNotificationDto) {
    await this.sink.deliver(
      body.workspaceId,
      { type: body.type, scope: body.scope },
      body.recipients,
      body.metadata ?? {},
      body.ref && body.refId ? { name: body.ref, id: body.refId } : undefined,
    );
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
