import { RedisLockService } from '@/services/redis/distributed-lock.service';
import { RedisService } from '@/services/redis/redis.service';
import {
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { EventBusGroup } from '../enums/event-bridge.enums';
import { EVENT_LANE_METADATA } from './event-lane.decorator';
import type { EventSink } from './event-sink';
import { StreamConsumer } from './stream-consumer';

/**
 * Starts one {@link StreamConsumer} per `@EventLane()` provider at boot and
 * stops them on shutdown.
 *
 * Lanes are discovered, not listed: the audit, projection and notifications
 * lanes live in this module, while the integrations, projects and issues
 * lanes live in the modules that own the work. Boot fails unless every
 * `EventBusGroup` has exactly one lane, so a lane that would silently never
 * consume cannot ship.
 *
 * The consumer groups are separate loops, not one worker with several
 * handlers, because a consumer group is Redis-side state with its OWN read
 * position: each lane must advance independently or the slowest one holds back
 * the audit trail. What they share is the loop implementation, so they cannot
 * drift in their retry or dead-letter behaviour.
 */
@Injectable()
export class EventConsumersService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private consumers: StreamConsumer[] = [];

  constructor(
    private readonly redis: RedisService,
    private readonly lock: RedisLockService,
    private readonly discovery: DiscoveryService,
    private readonly reflector: Reflector,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.startConsumers(this.discoverLanes());
  }

  /** The `@EventLane()` providers of the whole app, checked one per group. */
  discoverLanes(): EventSink[] {
    const sinks = this.discovery
      .getProviders()
      .filter(
        (wrapper) =>
          wrapper.metatype &&
          wrapper.instance &&
          this.reflector.get<boolean>(EVENT_LANE_METADATA, wrapper.metatype),
      )
      .map((wrapper) => wrapper.instance as EventSink);

    const groups = sinks.map((sink) => sink.group);
    const missing = Object.values(EventBusGroup).filter(
      (group) => !groups.includes(group),
    );
    if (missing.length > 0) {
      throw new Error(`No event lane registered for group(s): ${missing.join(', ')}`);
    }
    const duplicated = [
      ...new Set(groups.filter((group, i) => groups.indexOf(group) !== i)),
    ];
    if (duplicated.length > 0) {
      throw new Error(
        `More than one event lane registered for group(s): ${duplicated.join(', ')}`,
      );
    }
    return sinks;
  }

  async startConsumers(sinks: EventSink[]): Promise<void> {
    this.consumers = sinks.map(
      (sink) => new StreamConsumer(this.redis, this.lock, sink),
    );
    await Promise.all(this.consumers.map((consumer) => consumer.init()));
  }

  onApplicationShutdown(): void {
    for (const consumer of this.consumers) {
      consumer.stop();
    }
  }
}
