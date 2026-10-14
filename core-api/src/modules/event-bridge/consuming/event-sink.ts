import type { EventBusGroup } from '@/common/enums/enum';
import type { EventName } from '../contracts/event-catalog';
import type { ConsumedEvent } from '../contracts/event-envelope';
import type { DomainSubscription } from '../routing/subscriptions';

/**
 * What a consumer group does with the events it reads — and nothing else.
 *
 * A sink never touches Redis Streams: reading, acking, retrying, dead-lettering
 * and the single-instance lock all belong to {@link StreamConsumer}, which runs
 * one loop per sink. That split is what keeps the four lanes from drifting in
 * their retry behaviour and keeps each sink testable as a plain function of
 * (event name, envelope).
 */
export interface EventSink {
  /** Consumer group name — the lane this sink owns. */
  readonly group: EventBusGroup;
  /**
   * Domains this lane consumes (`SUBSCRIPTIONS[group]`). Filtering on the name
   * keeps a lane from decoding payloads it does not care about.
   */
  readonly domains: DomainSubscription;
  /**
   * Hold a Redis lock so only ONE instance runs this lane. Required for a
   * strictly-ordered view (audit); leave unset for order-independent lanes,
   * which then run on every replica.
   */
  readonly exclusive?: { lockKey: string; lockTtlMs: number };

  /**
   * Finer filter than {@link domains}, checked BEFORE the envelope is decoded:
   * an event this returns false for is acknowledged without parsing `data`.
   * Defaults to accepting everything the domain filter let through.
   */
  accepts?(name: EventName): boolean;

  /**
   * Handles one event. Throwing triggers the retry/DLQ path, so a permanently
   * unprocessable event must return normally instead.
   */
  handle(name: EventName, event: ConsumedEvent): Promise<void>;
}

/** DI token for the list of sinks the consumer runtime starts. */
export const EVENT_SINKS = Symbol('EVENT_SINKS');
