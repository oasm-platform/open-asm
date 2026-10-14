import {
  EVENT_BUS_AUDIT_LOCK_KEY,
  EVENT_BUS_AUDIT_LOCK_TTL_MS,
} from '@/common/constants/app.constants';
import {
  AuditActorType,
  AuditOutcome,
  EventBusGroup,
} from '@/common/enums/enum';
import { AuditEvent } from '@/modules/audit/entities/audit-event.entity';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { QueryDeepPartialEntity, Repository } from 'typeorm';
import type { EventSink } from '../../consuming/event-sink';
import type { EventName } from '../../contracts/event-catalog';
import type { ConsumedEvent } from '../../contracts/event-envelope';
import { redactSecrets } from '../../publishing/redact-secrets';
import { isPersisted } from '../../routing/event-policy';
import { SUBSCRIPTIONS } from '../../routing/subscriptions';

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
 * Exclusive (one instance, held by a Redis lock): `audit_events` is ordered by
 * `occurredAt`, and two consumers writing the same view from the same pending
 * list would interleave rows. The other lanes are order-independent and run on
 * every replica.
 */
@Injectable()
export class AuditSink implements EventSink {
  readonly group = EventBusGroup.Audit;
  readonly domains = SUBSCRIPTIONS[EventBusGroup.Audit];
  readonly exclusive = {
    lockKey: EVENT_BUS_AUDIT_LOCK_KEY,
    lockTtlMs: EVENT_BUS_AUDIT_LOCK_TTL_MS,
  };

  constructor(
    @InjectRepository(AuditEvent)
    private readonly auditEventRepo: Repository<AuditEvent>,
  ) {}

  /**
   * `persist: false` is a policy decision, not a transient failure: the
   * consumer acks it without decoding. Audit subscribes to '*', so this is the
   * lane's real filter.
   */
  accepts(name: EventName): boolean {
    return isPersisted(name);
  }

  async handle(name: EventName, event: ConsumedEvent): Promise<void> {
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
        actorType: event.actor?.type ?? AuditActorType.System,
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
        // Defence in depth: the producer already redacted, but an entry can
        // also arrive from something other than this code.
        changes: redactSecrets(changes) as QueryDeepPartialEntity<
          typeof changes
        >,
        metadata: redactSecrets(metadata) as QueryDeepPartialEntity<
          typeof metadata
        >,
      })
      .orIgnore()
      .execute();
  }
}

function parseTime(raw: string | undefined): Date {
  const parsed = raw ? new Date(raw) : undefined;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
}
