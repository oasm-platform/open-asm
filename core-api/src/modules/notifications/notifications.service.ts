import { NotificationStatus } from '@/common/enums/enum';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { NotificationRecipient } from './entities/notification-recipient.entity';
import { Notification } from './entities/notification.entity';

import { NotificationsSink } from '../event-bridge/sinks/notifications/notifications.sink';
import { I18nService } from 'nestjs-i18n';
import { CreateNotificationDto } from './dto/create-notification.dto';
import {
  GetNotificationsQueryDto,
  NotificationListResponseDto,
  NotificationResponseDto,
} from './dto/notification.dto';
import {
  CURSOR_TS_SQL,
  decodeNotificationCursor,
  encodeNotificationCursor,
} from './notification-cursor';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(NotificationRecipient)
    private notificationRecipientRepo: Repository<NotificationRecipient>,
    @InjectRepository(Notification)
    private notificationRepo: Repository<Notification>,
    private readonly i18n: I18nService,
    private readonly sink: NotificationsSink,
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

  /**
   * Keyset-paginated, newest first: fetches limit + 1 to learn whether a next
   * page exists, without counting the user's rows. The (userId, createdAt)
   * index serves both the filter and the order.
   */
  async getNotifications(
    userId: string,
    workspaceId: string | undefined,
    query: GetNotificationsQueryDto,
    lang: string = 'en',
  ): Promise<NotificationListResponseDto> {
    const limit = query.limit ?? 20;
    const qb = this.notificationRecipientRepo
      .createQueryBuilder('recipient')
      .leftJoinAndSelect('recipient.notification', 'notification')
      .where('recipient.userId = :userId', { userId })
      .andWhere(
        workspaceId
          ? '(notification.workspaceId = :workspaceId OR notification.workspaceId IS NULL)'
          : 'notification.workspaceId IS NULL',
        { workspaceId },
      )
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
      .addSelect(CURSOR_TS_SQL, 'cursor_ts')
      .orderBy('recipient.createdAt', 'DESC')
      .addOrderBy('recipient.id', 'DESC')
      // `limit`, not `take`: the join is many-to-one, so rows map 1:1 to
      // recipients and TypeORM's two-query `take` path is pure overhead.
      .limit(limit + 1);

    if (query.cursor) {
      const cursor = decodeNotificationCursor(query.cursor);
      qb.andWhere(
        '(recipient.createdAt, recipient.id) < (CAST(:cursorTs AS timestamp), CAST(:cursorId AS uuid))',
        { cursorTs: cursor.createdAt, cursorId: cursor.id },
      );
    }

    const { entities, raw } = await qb.getRawAndEntities<{
      recipient_id: string;
      cursor_ts: string;
    }>();
    const hasMore = entities.length > limit;
    const notifications = hasMore ? entities.slice(0, limit) : entities;
    const last = notifications[notifications.length - 1];
    const lastTs = last && raw.find((r) => r.recipient_id === last.id)?.cursor_ts;

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
    return {
      data,
      nextCursor:
        hasMore && last && lastTs
          ? encodeNotificationCursor({ createdAt: lastTs, id: last.id })
          : null,
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

  /**
   * Back to UNREAD, not SENT: the user has already seen it, so it should get
   * its unread dot back without bumping the bell's "new" count.
   */
  async markAsUnread(id: string, userId: string) {
    return this.notificationRecipientRepo.update(
      { id, userId },
      { status: NotificationStatus.UNREAD },
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
