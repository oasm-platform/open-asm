import { EventBusGroup } from '@/modules/event-bridge/enums/event-bridge.enums';
import { RedisLockService } from '@/services/redis/distributed-lock.service';
import { RedisService } from '@/services/redis/redis.service';
import { Injectable, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { SUBSCRIPTIONS } from '../routing/subscriptions';
import { EventConsumersService } from './event-consumers.service';
import { EventLane } from './event-lane.decorator';
import type { EventSink } from './event-sink';

const laneOf = (group: EventBusGroup) => {
  @EventLane()
  @Injectable()
  class Lane implements EventSink {
    readonly group = group;
    readonly domains = SUBSCRIPTIONS[group];
    handle = jest.fn().mockResolvedValue(undefined);
  }
  return Lane;
};

/** Builds an app whose lanes live in another module, as the domain lanes do. */
async function boot(groups: EventBusGroup[]) {
  @Module({ providers: groups.map(laneOf) })
  class DomainModule {}

  const redis = {
    xgroup: jest.fn().mockResolvedValue('OK'),
    client: {},
  };
  const moduleRef = await Test.createTestingModule({
    imports: [DiscoveryModule, DomainModule],
    providers: [
      EventConsumersService,
      { provide: RedisService, useValue: redis },
      { provide: RedisLockService, useValue: {} },
    ],
  }).compile();
  const service = moduleRef.get(EventConsumersService);
  // The loops themselves are StreamConsumer's concern; only discovery is under test
  const started: EventBusGroup[] = [];
  jest
    .spyOn(service, 'startConsumers')
    .mockImplementation((sinks: EventSink[]) => {
      started.push(...sinks.map((sink) => sink.group));
      return Promise.resolve();
    });
  return { moduleRef, service, started };
}

describe('EventConsumersService', () => {
  const allGroups = Object.values(EventBusGroup);

  it('starts one consumer per @EventLane provider, wherever it is registered', async () => {
    const { service, started } = await boot(allGroups);

    await service.onApplicationBootstrap();

    expect(started.sort()).toEqual([...allGroups].sort());
  });

  it('refuses to boot when a declared lane has no sink', async () => {
    const { service } = await boot(allGroups.filter((g) => g !== EventBusGroup.Issues));

    await expect(service.onApplicationBootstrap()).rejects.toThrow(
      'No event lane registered for group(s): issues',
    );
  });

  it('refuses to boot when two sinks claim the same lane', async () => {
    const { service } = await boot([...allGroups, EventBusGroup.Projects]);

    await expect(service.onApplicationBootstrap()).rejects.toThrow(
      'More than one event lane registered for group(s): projects',
    );
  });
});
