import { RedisLockService } from '@/services/redis/distributed-lock.service';
import { RedisService } from '@/services/redis/redis.service';
import {
  Inject,
  Injectable,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { EVENT_SINKS, type EventSink } from './event-sink';
import { StreamConsumer } from './stream-consumer';

/**
 * Starts one {@link StreamConsumer} per registered {@link EventSink} at boot
 * and stops them on shutdown.
 *
 * The consumer groups are separate loops, not one worker with several
 * handlers, because a consumer group is Redis-side state with its OWN read
 * position: each lane must advance independently or the slowest one holds back
 * the audit trail. What they share is the loop implementation, so they cannot
 * drift in their retry or dead-letter behaviour.
 */
@Injectable()
export class EventConsumersService
  implements OnModuleInit, OnApplicationShutdown
{
  readonly consumers: readonly StreamConsumer[];

  constructor(
    redis: RedisService,
    lock: RedisLockService,
    @Inject(EVENT_SINKS) sinks: EventSink[],
  ) {
    this.consumers = sinks.map((sink) => new StreamConsumer(redis, lock, sink));
  }

  async onModuleInit(): Promise<void> {
    await Promise.all(this.consumers.map((consumer) => consumer.init()));
  }

  onApplicationShutdown(): void {
    for (const consumer of this.consumers) {
      consumer.stop();
    }
  }
}
