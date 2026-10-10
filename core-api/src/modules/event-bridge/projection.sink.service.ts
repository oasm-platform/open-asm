import { EventBusGroup } from '@/common/enums/enum';
import { RedisLockService } from '@/services/redis/distributed-lock.service';
import { RedisService } from '@/services/redis/redis.service';
import { Injectable } from '@nestjs/common';
import type { EventName } from '../connectors/event';
import { SUBSCRIPTIONS } from './event-policy';
import type { ConsumedEvent } from './stream-consumer.service';
import { StreamConsumerService } from './stream-consumer.service';

/**
 * Consumer group `projection`: read models.
 *
 * Its own group so a slow rebuild cannot delay the audit trail, and so the
 * rebuild can be replayed or paused independently of it. Not single-instance —
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
export class ProjectionSinkService extends StreamConsumerService {
  constructor(redis: RedisService, lock: RedisLockService) {
    super(redis, lock, {
      group: EventBusGroup.Projection,
      domains: SUBSCRIPTIONS.projection,
    });
  }

  protected async onEntry(
    _name: EventName,
    _event: ConsumedEvent,
  ): Promise<void> {
    // No projection to apply yet — see the class comment. Entries are consumed
    // and acknowledged so the group's cursor advances; that is also what makes
    // enabling a handler later safe (it replays from the group start).
  }
}