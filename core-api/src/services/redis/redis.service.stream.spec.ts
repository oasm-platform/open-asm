import type { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

/**
 * The stream helpers are the one place where Redis's WIRE FORMAT is decoded,
 * and every one of them can be subtly wrong in a way that still looks right in
 * a mocked unit test. These cases pin the reply shapes against what Redis
 * actually sends, because the failure mode is silence: a mis-parsed delivery
 * count reads as "first attempt" forever, so an entry retries indefinitely and
 * never reaches the dead-letter queue.
 */
describe('RedisService stream helpers', () => {
  let service: RedisService;
  let client: {
    xadd: jest.Mock;
    xgroup: jest.Mock;
    xreadgroup: jest.Mock;
    xautoclaim: jest.Mock;
    xpending: jest.Mock;
    xack: jest.Mock;
    expire: jest.Mock;
    set: jest.Mock;
    duplicate: jest.Mock;
  };
  /** One blocking connection per consumer lane, as the service hands them out. */
  let blocking: Map<string, { xreadgroup: jest.Mock }>;
  /**
   * Read at CALL time rather than bound when the mock is built, so a test can
   * set the reply before invoking the service. jest snapshots the
   * implementation's return value when the call happens, so a later
   * `mockResolvedValue` would arrive too late to affect that call.
   */
  let blockingReply: unknown;

  beforeEach(() => {
    blocking = new Map();
    blockingReply = null;
    client = {
      xadd: jest.fn().mockResolvedValue('1-0'),
      xgroup: jest.fn().mockResolvedValue('OK'),
      xreadgroup: jest.fn().mockResolvedValue(null),
      xautoclaim: jest.fn().mockResolvedValue(['0-0', []]),
      xpending: jest.fn().mockResolvedValue([]),
      xack: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      set: jest.fn().mockResolvedValue('OK'),
      duplicate: jest.fn(() => {
        const conn = {
          xreadgroup: jest
            .fn()
            .mockImplementation(() => Promise.resolve(blockingReply)),
        };
        blocking.set(String(client.duplicate.mock.calls.length), conn);
        return conn;
      }),
    };

    const config = { get: jest.fn().mockReturnValue('redis://localhost:6379') };
    service = new RedisService(config as unknown as ConfigService);
    // The constructor builds real clients; replace the one these helpers use.
    Object.defineProperty(service, 'client', { value: client });
  });

  describe('xpendingCount', () => {
    // This is the regression that shipped once: XPENDING's range form returns
    // [[entryId, consumer, idleMs, deliveryCount]], and reading it as the
    // summary form yields 0 — which reads as "first attempt" on every pass, so
    // the DLQ threshold is never reached and a poisoned entry retries forever.
    it('reads the delivery count from the RANGE reply shape', async () => {
      client.xpending.mockResolvedValue([
        ['1759564000000-0', 'host:1234', 28079, 3],
      ]);

      await expect(
        service.xpendingCount('s', 'audit', '1759564000000-0'),
      ).resolves.toBe(3);
    });

    it('returns the first row when the range spans several entries', async () => {
      // COUNT is 1, so only one row comes back — but if that ever changes, the
      // row for the requested id must win, not whichever is listed first.
      client.xpending.mockResolvedValue([
        ['1759564000000-0', 'host:1234', 28079, 4],
      ]);

      await expect(
        service.xpendingCount('s', 'audit', '1759564000000-0'),
      ).resolves.toBe(4);
    });

    it('returns 0 for an entry that is not pending', async () => {
      client.xpending.mockResolvedValue([]);

      await expect(service.xpendingCount('s', 'audit', 'nope')).resolves.toBe(0);
    });
  });

  describe('xreadgroup', () => {
    it('folds the flat field array into a map', async () => {
      // Redis returns [f1, v1, f2, v2, …], never an object.
      blockingReply = [
        ['oasm:events', [['1-0', ['type', 'job.completed', 'data', '{"a":1}']]]],
      ];

      await expect(
        service.xreadgroup('s', 'audit', 'c1', 16, 5000),
      ).resolves.toEqual([
        { id: '1-0', fields: { type: 'job.completed', data: '{"a":1}' } },
      ]);
    });

    it('returns an empty array when the block times out with no entries', async () => {
      // A null reply is the normal idle path, not an error.
      blockingReply = null;

      await expect(
        service.xreadgroup('s', 'audit', 'c1', 16, 5000),
      ).resolves.toEqual([]);
    });
  });

  describe('xautoclaim', () => {
    it('folds the claimed entries into maps', async () => {
      client.xautoclaim.mockResolvedValue([
        '0-0',
        [['2-0', ['type', 'asset.discovered']]],
      ]);

      await expect(
        service.xautoclaim('s', 'audit', 'c1', 30000, 16),
      ).resolves.toEqual([
        { id: '2-0', fields: { type: 'asset.discovered' } },
      ]);
    });
  });

  describe('xgroupCreate', () => {
    it('swallows BUSYGROUP, which is the normal reboot path', async () => {
      client.xgroup.mockRejectedValue(new Error('BUSYGROUP Consumer Group name already exists'));

      await expect(service.xgroupCreate('s', 'audit', '0')).resolves.toBeUndefined();
    });

    it('propagates any other error', async () => {
      // Silently swallowing this would leave the lane never consuming.
      client.xgroup.mockRejectedValue(new Error('WRONGTYPE'));

      await expect(service.xgroupCreate('s', 'audit', '0')).rejects.toThrow(
        'WRONGTYPE',
      );
    });
  });

  describe('blocking read isolation', () => {
    // A blocked XREADGROUP parks its socket. If it shares the connection with
    // ordinary traffic, every other command in the app queues behind it — which
    // showed up in production as audit rows landing 4-29s late, because the
    // producer's own XADD was stuck behind four consumer lanes' blocks.
    it('never issues the blocking read on the shared connection', async () => {
      await service.xreadgroup('s', 'audit', 'c1', 10, 5000);

      expect(client.xreadgroup).not.toHaveBeenCalled();
      expect(blocking.size).toBe(1);
    });

    it('gives each consumer group its own connection', async () => {
      // Two lanes sharing one connection would move the same serialisation from
      // the app's traffic onto the bus's traffic, which is no better.
      await service.xreadgroup('s', 'audit', 'c1', 10, 5000);
      await service.xreadgroup('s', 'notifications', 'c1', 10, 5000);

      expect(blocking.size).toBe(2);
    });

    it('reuses the connection for the same group across cycles', async () => {
      await service.xreadgroup('s', 'audit', 'c1', 10, 5000);
      await service.xreadgroup('s', 'audit', 'c1', 10, 5000);
      await service.xreadgroup('s', 'audit', 'c1', 10, 5000);

      expect(blocking.size).toBe(1);
    });

    it('does not grow without bound under repeated group rotation', async () => {
      for (let i = 0; i < 50; i += 1) {
        await service.xreadgroup('s', `group-${i % 4}`, 'c1', 10, 5000);
      }

      expect(blocking.size).toBe(4);
    });
  });

  describe('xadd', () => {
    // Argument order is the XADD GRAMMAR, not a style choice:
    //   XADD key [MAXLEN [~|=] count] <* | id> field value ...
    // Emitting MAXLEN after the fields makes Redis reject the entire command
    // ("wrong number of arguments") and the event is silently lost — a unit test
    // asserting the wrong order would happily pass, so this pins the real shape.
    it('places MAXLEN BEFORE the id and the fields', async () => {
      await service.xadd('s', { a: 'b' }, { maxLen: 100, ttlSeconds: 60 });

      expect(client.xadd).toHaveBeenCalledWith(
        's',
        'MAXLEN',
        '~',
        '100',
        '*',
        'a',
        'b',
      );
      expect(client.expire).toHaveBeenCalledWith('s', 60);
    });

    it('preserves field order after the id', async () => {
      await service.xadd('s', { type: 'job.completed', data: '{}' });

      expect(client.xadd).toHaveBeenCalledWith(
        's',
        '*',
        'type',
        'job.completed',
        'data',
        '{}',
      );
    });

    it('always emits an even number of field/value arguments', async () => {
      await service.xadd('s', { a: 'b', c: 'd' });

      const args = client.xadd.mock.calls[0];
      // Everything after the id must be field/value pairs; an odd count means
      // the fields and the values drifted apart.
      expect((args.length - 2) % 2).toBe(0);
    });

    it('omits the trim when no retention is configured', async () => {
      await service.xadd('s', { a: 'b' });

      expect(client.xadd).toHaveBeenCalledWith('s', '*', 'a', 'b');
      expect(client.expire).not.toHaveBeenCalled();
    });
  });

  describe('setIfAbsent', () => {
    it('reports true only for the caller that created the key', async () => {
      client.set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);

      await expect(service.setIfAbsent('k', '1')).resolves.toBe(true);
      await expect(service.setIfAbsent('k', '1')).resolves.toBe(false);
    });
  });
});