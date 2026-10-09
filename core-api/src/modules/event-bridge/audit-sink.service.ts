import {
  EVENT_BUS_AUDIT_LOCK_KEY,
  EVENT_BUS_AUDIT_LOCK_TTL_MS,
} from '@/common/constants/app.constants';
import {
  AuditActorType,
  AuditOutcome,
  EventBusGroup,
} from '@/common/enums/enum';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { QueryDeepPartialEntity, Repository } from 'typeorm';
import { RedisLockService } from '@/services/redis/distributed-lock.service';
import { RedisService } from '@/services/redis/redis.service';

import { SUBSCRIPTIONS, isPersisted } from './event-policy';
import type { EventName } from '../connectors/event';
import {
  StreamConsumerService,
  parseData,
  type ConsumedEvent,
} from './stream-consumer.service';
import { AuditEvent } from '../audit/entities/audit-event.entity';
import { redactSecrets } from './redact-secrets';

/**
 * Materializes the stream into `audit_events` — the consumer group that makes
 * the audit trail a VIEW of the event bus rather than a producer-side write.
 *
 * Idempotent on `eventId`: the envelope's CloudEvents `id` becomes the row's
 * `eventId`, and the insert is `orIgnore`. That is what makes at-least-once
 * delivery safe — a replay, a redelivery after a crash between the write and
 * the XACK, and the first delivery are indistinguishable. Dedupe lives in the
 * DATABASE (a UNIQUE column), not in a Redis marker, so it survives a Redis
 * flush — the audit trail cannot afford to lose rows.
 *
 * Exactly ONE instance runs this loop, held by a Redis lock: `audit_events` is
 * ordered by `occurredAt`, and two consumers writing the same view from the
 * same pending list would interleave rows. The other groups are
 * order-independent and run on every replica.
 */
@Injectable()
export class AuditSinkService extends StreamConsumerService {
  constructor(
    redis: RedisService,
    lock: RedisLockService,
    @InjectRepository(AuditEvent)
    private readonly auditEventRepo: Repository<AuditEvent>,
  ) {
    super(redis, lock, {
      group: EventBusGroup.Audit,
      domains: SUBSCRIPTIONS.audit,
      singleInstance: true,
      lock: {
        key: EVENT_BUS_AUDIT_LOCK_KEY,
        ttlMs: EVENT_BUS_AUDIT_LOCK_TTL_MS,
      },
    });
  }

  protected async onEntry(
    name: EventName,
    event: ConsumedEvent,
  ): Promise<void> {
    // `persist: false` is a policy decision, not a transient failure: acking is
    // what stops it from cycling through retries. Reached only when the
    // transport filter let it through (audit subscribes to '*').
    if (!isPersisted(name)) {
      return;
    }
    await this.persist(name, event);
  }

  private async persist(name: EventName, event: ConsumedEvent): Promise<void> {
    const changes = event.changes ?? {};
    const metadata = event.metadata ?? {};

    await this.auditEventRepo
      .createQueryBuilder()
      .insert()
      .into(AuditEvent)
      .values({
        eventId: event.eventId,
        workspaceId: event.workspaceId,
        // occurredAt is what orders the view, not the insert time. A malformed
        // timestamp falls back to now() rather than dropping the row: losing
        // audit is worse than a row stamped with when we noticed it.
        occurredAt: parseTime(event.occurredAt),
        actorId: event.actor?.id,
        actorType: (event.actor?.type ?? AuditActorType.System),
        actorName: event.actor?.name,
        actorEmail: event.actor?.email,
        action: name,
        resourceType: event.resourceType ?? name.split('.')[0],
        resourceId: event.resourceId,
        outcome: event.outcome as AuditOutcome,
        sourceIp: event.sourceIp,
        userAgent: event.userAgent,
        requestId: event.requestId,
        correlationId: event.correlationId,
        changes: redactSecrets(changes) as QueryDeepPartialEntity<typeof changes>,
        metadata: redactSecrets(metadata) as QueryDeepPartialEntity<typeof metadata>,
      })
      .orIgnore()
      .execute();
  }
}

function parseTime(raw: string | undefined): Date {
  const parsed = raw ? new Date(raw) : undefined;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
}


export { parseData };
