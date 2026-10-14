import {
  EventBusGroup,
  NotificationScope,
  NotificationStatus,
  NotificationType,
} from '@/common/enums/enum';
import { User } from '@/modules/auth/entities/user.entity';
import { NotificationRecipient } from '@/modules/notifications/entities/notification-recipient.entity';
import { Notification } from '@/modules/notifications/entities/notification.entity';
import { RedisService } from '@/services/redis/redis.service';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';
import type { EventSink } from '../../consuming/event-sink';
import { claimEventOnce } from '../../consuming/idempotency';
import type { EventName } from '../../contracts/event-catalog';
import type { ConsumedEvent } from '../../contracts/event-envelope';
import { SUBSCRIPTIONS } from '../../routing/subscriptions';
import { NOTIFICATION_RULES, type NotificationRule } from './notification-rules';

/**
 * Consumer group `notifications`: turns domain events into in-app notification
 * rows and SSE pushes. WHICH events notify whom lives in
 * `notification-rules.ts`; this class only executes the rules.
 *
 *  - producers do not know who is notified, only WHAT happened — the recipient
 *    lookup happens here;
 *  - idempotency is on the CloudEvents `id` via a Redis marker, because the
 *    `notifications` table has no event-id column.
 *
 * Not exclusive: each notification is an independent row, so two replicas
 * racing is harmless and horizontal scaling is free.
 *
 * Events addressed to specific users that are NOT derivable from a domain
 * event (a workspace invitation) stay on the direct `NotificationsService`
 * path, which reuses {@link deliver} so both routes write identical rows.
 */
@Injectable()
export class NotificationsSink implements EventSink {
  readonly group = EventBusGroup.Notifications;
  readonly domains = SUBSCRIPTIONS[EventBusGroup.Notifications];

  constructor(
    private readonly redis: RedisService,
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(NotificationRecipient)
    private readonly recipientRepo: Repository<NotificationRecipient>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  accepts(name: EventName): boolean {
    return name in NOTIFICATION_RULES;
  }

  async handle(name: EventName, event: ConsumedEvent): Promise<void> {
    const rules = NOTIFICATION_RULES[name] ?? [];
    // Several rules of one event usually share the audience; look the
    // workspace members up once per event, not once per rule.
    let members: Promise<string[]> | undefined;

    for (const rule of rules) {
      if (rule.when && !rule.when(event)) {
        continue;
      }

      const recipients =
        rule.audience === 'workspace-members'
          ? await (members ??= this.workspaceMembers(event.workspaceId))
          : this.namedRecipient(rule, event);
      if (recipients.length === 0) {
        continue;
      }

      // At-least-once ⇒ a redelivery must not duplicate the row. The claim is
      // per (event, notification type) so one event legitimately producing
      // two different notifications still writes both.
      const first = await claimEventOnce(
        this.redis,
        this.group,
        `${event.eventId}:${rule.type}`,
      );
      if (!first) {
        continue;
      }

      await this.deliver(
        event.workspaceId,
        rule,
        recipients,
        rule.metadata(event),
      );
    }
  }

  /**
   * Fans a notification out to its recipients and pushes it over SSE.
   *
   * Reused by the direct (non-event) path so both routes produce byte-identical
   * rows and pushes.
   */
  async deliver(
    workspaceId: string | undefined,
    rule: { type: NotificationType; scope: NotificationScope },
    recipients: string[],
    metadata: Record<string, string>,
    ref?: { name: string; id: string },
  ): Promise<void> {
    const notification = await this.notificationRepo.save({
      scope: rule.scope,
      type: rule.type,
      workspaceId,
      metadata,
      ...(ref ? { ref: ref.name, refId: ref.id } : {}),
    });

    const users = await this.userRepo.findBy({ id: In(recipients) });
    if (users.length === 0) {
      return;
    }

    await this.recipientRepo.save(
      users.map((user) => ({
        notificationId: notification.id,
        userId: user.id,
        status: NotificationStatus.SENT,
      })),
    );

    const message = JSON.stringify({
      notificationId: notification.id,
      scope: rule.scope,
      metadata,
      ...(ref ? { ref: ref.name, refId: ref.id } : {}),
    });
    for (const user of users) {
      await this.redis.publisher.publish(`notification:${user.id}`, message);
    }
  }

  private namedRecipient(rule: NotificationRule, event: ConsumedEvent): string[] {
    if (rule.audience === 'workspace-members') return [];
    const userId = rule.audience.userId(event);
    return userId ? [userId] : [];
  }

  /**
   * WORKSPACE MEMBERS, resolved here rather than by the producer: a member who
   * joins tomorrow starts receiving notifications without touching a producer.
   * The owner/administrator is included — a workspace with no notified member
   * would leave a scan result invisible.
   */
  private async workspaceMembers(workspaceId: string): Promise<string[]> {
    const members = await this.userRepo
      .createQueryBuilder('user')
      .innerJoin('user.workspaceMembers', 'member')
      .innerJoin('member.workspace', 'workspace')
      .where('workspace.id = :workspaceId', { workspaceId })
      .getMany();
    return members.map((user) => user.id);
  }
}
