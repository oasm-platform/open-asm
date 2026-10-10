import {
  EventBusGroup,
  NotificationScope,
  NotificationStatus,
  NotificationType,
} from '@/common/enums/enum';
import { RedisLockService } from '@/services/redis/distributed-lock.service';
import { RedisService } from '@/services/redis/redis.service';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';
import { Notification } from '../notifications/entities/notification.entity';
import { NotificationRecipient } from '../notifications/entities/notification-recipient.entity';
import { User } from '../auth/entities/user.entity';
import type { EventName } from '../connectors/event';
import { SUBSCRIPTIONS } from './event-policy';
import {
  StreamConsumerService,
  claimEventOnce,
  type ConsumedEvent,
} from './stream-consumer.service';

/**
 * One event → the in-app notifications it implies.
 *
 * This is the business rule the plan says belongs at the TOP of the handler,
 * not in the transport: `SUBSCRIPTIONS` decides whether the transport hands an
 * entry over at all, this decides whether the event actually says something to
 * a human. Keeping them apart is what stops the subscription table from
 * becoming a second, half-tested copy of the notification rules.
 *
 * An event with no entry is explicitly NOT notified, and the list is small on
 * purpose: a scan that finds 400 assets should produce one "new assets" note,
 * not 400. The `workflow.run.completed` payload already carries the aggregate.
 */
interface NotificationRule {
  type: NotificationType;
  scope: NotificationScope;
  /** Where the recipients come from. */
  audience: 'workspace-members' | 'actor';
  /** Projects the event payload into the i18n message arguments. */
  metadata: (payload: WorkflowRunPayload) => Record<string, string>;
}

/** The `workflow.run.completed` payload, as published by StatisticService. */
interface WorkflowRunPayload {
  targetValue?: string;
  targetId?: string;
  hosts?: number;
  ports?: number;
  services?: number;
  techs?: number;
  incompleteDetails?: string;
  /** `vulnerability.analysis.completed` reuses the same channel. */
  userId?: string;
  vulnerabilityId?: string;
  vulnerabilityName?: string;
  /** `vulnerability.detected` alert. */
  count?: number;
  assetValue?: string;
  assetId?: string;
}

/**
 * EVENT → NOTIFICATION. Only these events notify; everything else in the
 * subscribed domains is consumed and acknowledged silently.
 */
const RULES: Partial<Record<EventName, NotificationRule[]>> = {
  // A scan finished and brought something back. Replaces the two
  // `createNotification` calls the statistic service used to make directly.
  'workflow.run.completed': [
    {
      type: NotificationType.ASSET_NEW_DETECT,
      scope: NotificationScope.GROUP,
      audience: 'workspace-members',
      metadata: (p) => ({
        hosts: String(p.hosts ?? 0),
        ports: String(p.ports ?? 0),
        services: String(p.services ?? 0),
        tech: String(p.techs ?? 0),
        targetValue: p.targetValue ?? '',
        targetId: p.targetId ?? '',
      }),
    },
    {
      // Only meaningful when the run did NOT complete its graph — a full run
      // already reported its new assets above, and "your scan stopped halfway"
      // after a clean finish is noise.
      type: NotificationType.SCAN_INCOMPLETE,
      scope: NotificationScope.GROUP,
      audience: 'workspace-members',
      metadata: (p) => ({
        targetValue: p.targetValue ?? '',
        targetId: p.targetId ?? '',
        details: p.incompleteDetails ?? '',
      }),
    },
  ],
  // New vulnerabilities crossed the alert threshold during ingest.
  'vulnerability.detected': [
    {
      type: NotificationType.NEW_VULNERABILITY_FOUND,
      scope: NotificationScope.GROUP,
      audience: 'workspace-members',
      metadata: (p) => ({
        count: String(p.count ?? 0),
        assetValue: p.assetValue ?? '',
        targetId: p.targetId ?? '',
        assetId: p.assetId ?? '',
      }),
    },
  ],
  // Addressed to the one user who requested the analysis — notifying the whole
  // workspace about one person's AI run would be wrong, not merely noisy.
  'vulnerability.analysis.completed': [
    {
      type: NotificationType.VULNERABILITY_ANALYSIS_COMPLETED,
      scope: NotificationScope.USER,
      audience: 'actor',
      metadata: (p) => ({
        id: p.vulnerabilityId ?? '',
        name: p.vulnerabilityName ?? '',
      }),
    },
  ],
};

/**
 * Consumer group `notifications`: turns domain events into in-app notification
 * rows and SSE pushes.
 *
 * Replaces the BullMQ `NOTIFICATION` queue. Two consequences worth stating:
 *  - producers no longer know who is notified, only WHAT happened — the
 *    recipient lookup moved here, into the sink;
 *  - idempotency is on the CloudEvents `id` via a Redis marker, because the
 *    `notifications` table has no event-id column and adding one would be a
 *    schema change this phase explicitly does not include.
 *
 * Only GROUP-audience events (workspace members) land here. Events addressed to
 * specific users — a workspace invitation goes to the inviter, not to the
 * membership — stay on the direct `NotificationsService` path: their recipient
 * set is not derivable from a domain event, and guessing "all members" would
 * leak invitations to people who were never involved.
 */
@Injectable()
export class NotificationsSinkService extends StreamConsumerService {
  constructor(
    redis: RedisService,
    lock: RedisLockService,
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(NotificationRecipient)
    private readonly recipientRepo: Repository<NotificationRecipient>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {
    // No `singleInstance`: each notification is an independent row, so two
    // replicas racing is harmless and horizontal scaling is free. Idempotency
    // is enforced per event by `claimEventOnce` instead.
    super(redis, lock, {
      group: EventBusGroup.Notifications,
      domains: SUBSCRIPTIONS.notifications,
    });
  }

  protected async onEntry(
    name: EventName,
    event: ConsumedEvent,
  ): Promise<void> {
    const rules = RULES[name];
    // Filter finer than the domain lives HERE, not in SUBSCRIPTIONS: only
    // `asset.discovered`-class events should notify, and the rest of the
    // subscribed domains are pure transport noise for this group.
    if (!rules) {
      return;
    }

    const payload = (event.payload ?? {}) as WorkflowRunPayload;

    for (const rule of rules) {
      // SCAN_INCOMPLETE is only emitted for a run that did NOT finish its
      // graph; the payload carries the details only in that case.
      if (
        rule.type === NotificationType.SCAN_INCOMPLETE &&
        !payload.incompleteDetails
      ) {
        continue;
      }

      const recipients = await this.resolveRecipients(rule, event);
      if (recipients.length === 0) {
        continue;
      }

      // At-least-once ⇒ a redelivery must not duplicate the row. The claim is
      // per (group, event, notification type) so one event legitimately
      // producing two different notifications still writes both.
      const first =
        await claimEventOnce(
          this.redis,
          this.options.group,
          `${event.eventId}:${rule.type}`,
        );
      if (!first) {
        continue;
      }

      await this.deliver(
        event.workspaceId,
        rule,
        recipients,
        rule.metadata(payload),
      );
    }
  }

  /**
   * Fans a notification out to its recipients and pushes it over SSE.
   *
   * Reused by the direct (non-event) path so both routes produce byte-identical
   * rows and pushes — the queue and the group must not drift into two subtly
   * different notification formats.
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

  /**
   * WORKSPACE MEMBERS, resolved here rather than by the producer.
   *
   * The producer knows what happened; it does not know who is subscribed to
   * this workspace. Moving the lookup to the sink is what lets a member who
   * joins tomorrow start receiving notifications without touching a producer.
   */
  private async resolveRecipients(
    rule: NotificationRule,
    event: ConsumedEvent,
  ): Promise<string[]> {
    if (rule.audience === 'actor') {
      const payload = (event.payload ?? {}) as WorkflowRunPayload;
      return payload.userId ? [payload.userId] : [];
    }
    // Group notifications go to the members of the affected workspace. The
    // owner/administrator is included: a workspace with no notified member
    // would leave a scan result invisible.
    const memberships = await this.userRepo
      .createQueryBuilder('user')
      .innerJoin('user.workspaceMembers', 'member')
      .innerJoin('member.workspace', 'workspace')
      .where('workspace.id = :workspaceId', { workspaceId: event.workspaceId })
      .getMany();
    return memberships.map((user) => user.id);
  }
}