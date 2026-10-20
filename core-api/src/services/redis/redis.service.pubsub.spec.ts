import { EventEmitter } from 'events';
import type { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

describe('RedisService pub/sub', () => {
  let service: RedisService;
  let subscriber: EventEmitter & {
    subscribe: jest.Mock;
    unsubscribe: jest.Mock;
  };

  beforeEach(() => {
    subscriber = Object.assign(new EventEmitter(), {
      subscribe: jest.fn().mockResolvedValue(1),
      unsubscribe: jest.fn().mockResolvedValue(1),
    });
    const config = { get: jest.fn().mockReturnValue('redis://localhost:6379') };
    service = new RedisService(config as unknown as ConfigService);
    // The constructor builds real clients; replace the one pub/sub uses.
    service.subscriber.disconnect();
    Object.defineProperty(service, 'subscriber', { value: subscriber });
  });

  afterEach(() => {
    // The real ones would keep retrying the connection after the tests
    service.client.disconnect();
    service.cacheClient.disconnect();
    service.publisher.disconnect();
  });

  it('removes only the given listener while others still read the channel', async () => {
    const first = jest.fn();
    const second = jest.fn();
    await service.subscribe('chan', first);
    await service.subscribe('chan', second);

    await service.unsubscribe('chan', first);
    subscriber.emit('message', 'chan', 'hi');

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('chan', 'hi');
    expect(subscriber.unsubscribe).not.toHaveBeenCalled();
  });

  it('leaves the channel once its last listener is removed', async () => {
    const only = jest.fn();
    await service.subscribe('chan', only);

    await service.unsubscribe('chan', only);

    expect(subscriber.unsubscribe).toHaveBeenCalledWith('chan');
    expect(subscriber.listenerCount('message')).toBe(0);
  });

  it('removes every listener of the channel when none is given', async () => {
    await service.subscribe('chan', jest.fn());
    await service.subscribe('chan', jest.fn());

    await service.unsubscribe('chan');

    expect(subscriber.unsubscribe).toHaveBeenCalledWith('chan');
    expect(subscriber.listenerCount('message')).toBe(0);
  });
});
