import { EventBusGroup } from '@/common/enums/enum';
import { Injectable } from '@nestjs/common';
import type { EventSink } from '../../consuming/event-sink';
import { SUBSCRIPTIONS } from '../../routing/subscriptions';

/**
 * Consumer group `projection`: read models.
 *
 * Its own group so a slow rebuild cannot delay the audit trail, and so the
 * rebuild can be replayed or paused independently of it. Not exclusive —
 * projections are last-writer-wins per key, so two replicas converging on the
 * same value is the desired behaviour, not a race to guard against.
 *
 * SCOPE, stated plainly: this lane is intentionally thin today. Every read
 * model in the app is still written inside the transaction that produced it
 * (statistics rows are saved by the rollup, asset counters are recomputed on
 * read), so there is no projection left to move out of a producer. What the
 * group provides is the PLACE for them: a subscribed domain set, a retry
 * horizon and a dead-letter queue, so the next read model that does have to be
 * derived asynchronously lands here instead of growing another direct call
 * chain.
 *
 * It is registered and consuming rather than omitted, because a group that is
 * declared but absent fails at the first event: XREADGROUP on a group that
 * does not exist is an error, not an empty read.
 */
@Injectable()
export class ProjectionSink implements EventSink {
  readonly group = EventBusGroup.Projection;
  readonly domains = SUBSCRIPTIONS[EventBusGroup.Projection];

  /**
   * No projection to apply yet. Rejecting every name lets the consumer ack
   * without decoding, which keeps the group's cursor advancing — that is also
   * what makes adding a handler later safe (it replays from the group start).
   */
  accepts(): boolean {
    return false;
  }

  async handle(): Promise<void> {
    // Unreachable while `accepts` is false; see above.
  }
}
