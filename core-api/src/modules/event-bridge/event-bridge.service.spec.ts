import { ValidationError } from 'cloudevents';
import type { RedisService } from '@/services/redis/redis.service';
import { EVENT_CATALOG } from './event';import {
  EVENT_BRIDGE_SOURCE,
  EVENT_BRIDGE_STREAM,
  EventBridgeService,
} from './event-bridge.service';

/**
 * Arranged: a fake RedisService exposing only `xadd`, so the suite asserts the
 * exact field map the bridge writes rather than a live Redis round trip.
 */
describe('EventBridgeService', () => {
  const xadd = jest.fn<Promise<string>, [string, Record<string, string>]>();
  const redis = { xadd } as unknown as RedisService;
  let service: EventBridgeService;

  beforeEach(() => {
    xadd.mockReset();
    xadd.mockResolvedValue('1700000000000-0');
    service = new EventBridgeService(redis, EVENT_CATALOG);
  });

  /** Field map handed to the last XADD, in call order. */
  const lastFields = (): Record<string, string> => {
    const call = xadd.mock.calls.at(-1);
    if (!call) {
      throw new Error('xadd was never called');
    }
    return call[1];
  };

  describe('name extraction', () => {
    // The whole point of the dot-path call shape: the caller never passes a
    // name, and the bridge cannot write one the catalog does not declare.
    it('takes the name from the catalog leaf, not from the caller', async () => {
      await service.publish(EVENT_CATALOG.job.completed, { jobId: '8f3c' });
      expect(lastFields().type).toBe('job.completed');
    });

    it.each([
      ['a 2-segment path', EVENT_CATALOG.worker.joined, 'worker.joined'],
      [
        'a 3-segment path',
        EVENT_CATALOG.workspace.config.updated,
        'workspace.config.updated',
      ],
    ])('resolves %s', async (_label, leaf, expected) => {
      await service.publish(leaf, {});
      expect(lastFields().type).toBe(expected);
    });

    // Needed for the audit hook, where the action arrives as a typed string
    // from the decorator metadata rather than as a leaf.
    it('accepts a bare name', async () => {
      await service.publish('job.completed', {});
      expect(lastFields().type).toBe('job.completed');
    });

    it('refuses a name the catalog does not declare', async () => {
      const result = await service.publish('job.startd', {});
      expect(result).toBeNull();
      expect(xadd).not.toHaveBeenCalled();
    });

    it('refuses a forged leaf', async () => {
      const forged = { name: 'typo.event', summary: 'x' };
      const result = await service.publish(forged as never, {});
      expect(result).toBeNull();
      expect(xadd).not.toHaveBeenCalled();
    });
  });

  describe('CloudEvents envelope', () => {
    it('writes the four REQUIRED CloudEvents attributes', async () => {
      await service.publish(EVENT_CATALOG.job.completed, {});
      const fields = lastFields();
      // specversion is the CloudEvents spec version, NOT our payload version.
      expect(fields.specversion).toBe('1.0');
      expect(fields.type).toBe('job.completed');
      expect(fields.source).toBe(EVENT_BRIDGE_SOURCE);
      expect(fields.id).toBeTruthy();
    });

    it('stamps time as an RFC3339 string, not a Date', async () => {
      // The SDK's schema rejects a Date object here — `time` must be the
      // canonical string encoding.
      await service.publish(EVENT_CATALOG.job.completed, {});
      expect(lastFields().time).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    });

    it('gives every event a distinct id', async () => {
      await service.publish(EVENT_CATALOG.job.completed, {});
      await service.publish(EVENT_CATALOG.job.completed, {});
      const [first, second] = xadd.mock.calls.map((call) => call[1].id);
      expect(first).not.toBe(second);
    });

    it('serializes the payload into the data field', async () => {
      await service.publish(EVENT_CATALOG.job.completed, { jobId: '8f3c' });
      expect(JSON.parse(lastFields().data)).toEqual({ jobId: '8f3c' });
    });

    it('omits data when no payload is supplied', async () => {
      // `data` is OPTIONAL in CloudEvents; inventing `{}` would misreport an
      // event that carries nothing as one that carries an empty object.
      await service.publish(EVENT_CATALOG.worker.joined);
      expect('data' in lastFields()).toBe(false);
    });

    it('passes subject through when the caller knows the resource', async () => {
      await service.publish(EVENT_CATALOG.job.completed, {}, {
        subject: 'job:8f3c',
      });
      expect(lastFields().subject).toBe('job:8f3c');
    });
  });

  describe('stream shape', () => {
    it('writes to the configured stream', async () => {
      await service.publish(EVENT_CATALOG.job.completed, {});
      expect(xadd.mock.calls[0][0]).toBe(EVENT_BRIDGE_STREAM);
    });

    it('flattens every context attribute into its own field', async () => {
      // Redis Streams are a flat field map, which is the CloudEvents
      // "event format": a consumer reads `type`/`id` without parsing `data`.
      await service.publish(EVENT_CATALOG.job.completed, { jobId: '8f3c' });
      expect(Object.keys(lastFields()).sort()).toEqual([
        'data',
        'id',
        'source',
        'specversion',
        'time',
        'type',
      ]);
    });

    it('returns the stream id so a caller can trace the write', async () => {
      await expect(service.publish(EVENT_CATALOG.job.completed, {})).resolves.toBe(
        '1700000000000-0',
      );
    });
  });

  describe('failure handling', () => {
    it('propagates a Redis failure from publish', async () => {
      // publish() is the honest path: a caller inside a transaction must be
      // able to see that the event was not recorded.
      xadd.mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(service.publish(EVENT_CATALOG.job.completed, {})).rejects.toThrow(
        'ECONNREFUSED',
      );
    });

    it('never throws from publishSafely', async () => {
      // Mirrors AuditService.auditSafely: the request must not fail because
      // the bridge could not write.
      xadd.mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(
        service.publishSafely(EVENT_CATALOG.job.completed, {}),
      ).resolves.toBeNull();
    });

    it('never throws from publishSafely on an unknown name', async () => {
      await expect(service.publishSafely('nope.nope', {})).resolves.toBeNull();
      expect(xadd).not.toHaveBeenCalled();
    });
  });

  describe('SDK validation', () => {
    it('surfaces the SDK ValidationError type for a malformed override', async () => {
      // Guards that the SDK is actually validating, not merely decorating:
      // an empty `type` is a CloudEvents MUST violation.
      await expect(
        service.publish(EVENT_CATALOG.job.completed, {}, { type: '' }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });
});
