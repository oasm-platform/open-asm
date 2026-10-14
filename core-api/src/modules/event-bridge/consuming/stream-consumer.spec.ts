import {
  EVENT_BUS_MAX_ATTEMPTS,
  EVENT_BUS_STREAM,
  eventBusDlqKey,
} from '@/common/constants/app.constants';
import { EventBusGroup } from '@/common/enums/enum';
import type { RedisService, StreamEntry } from '@/services/redis/redis.service';
import type { EventSink } from './event-sink';
import { StreamConsumer } from './stream-consumer';

/**
 * The transport alone, driven with a stub sink: routing order, ack semantics
 * and the retry → DLQ path that every lane shares.
 *
 * Run: task api:test:one SPEC=src/modules/event-bridge/consuming/stream-consumer.spec.ts
 */
describe('StreamConsumer', () => {
  const WORKSPACE = '11111111-1111-4111-8111-111111111111';

  let xreadgroup: jest.Mock;
  let xack: jest.Mock;
  let xadd: jest.Mock;
  let xpendingCount: jest.Mock;
  let handle: jest.Mock;
  let accepts: jest.Mock;
  let withLock: jest.Mock;
  let redis: RedisService;

  const entry = (type: string, data?: unknown): StreamEntry => ({
    id: '1759564000000-0',
    fields: {
      type,
      id: 'evt-1',
      time: '2026-10-09T10:00:00.000Z',
      ...(data === undefined ? {} : { data: JSON.stringify(data) }),
    },
  });

  const consumer = (sink: Partial<EventSink> = {}) =>
    new StreamConsumer(redis, { withLock } as never, {
      group: EventBusGroup.Notifications,
      domains: ['vulnerability'],
      accepts,
      handle,
      ...sink,
    } as EventSink);

  beforeEach(() => {
    xreadgroup = jest.fn().mockResolvedValue([]);
    xack = jest.fn().mockResolvedValue(1);
    xadd = jest.fn().mockResolvedValue('dlq-1');
    xpendingCount = jest.fn().mockResolvedValue(1);
    handle = jest.fn().mockResolvedValue(undefined);
    accepts = jest.fn().mockReturnValue(true);
    withLock = jest.fn((_k: string, _t: number, fn: () => unknown) => fn());
    redis = {
      xreadgroup,
      xack,
      xadd,
      xpendingCount,
      xautoclaim: jest.fn().mockResolvedValue([]),
      xgroupCreate: jest.fn().mockResolvedValue(undefined),
    } as unknown as RedisService;
  });

  const valid = { workspaceId: WORKSPACE, outcome: 'success', payload: { a: 1 } };

  it('hands an accepted event to the sink, then acks it', async () => {
    xreadgroup.mockResolvedValue([entry('vulnerability.detected', valid)]);
    await consumer().runOnce();

    expect(handle).toHaveBeenCalledWith(
      'vulnerability.detected',
      expect.objectContaining({
        eventId: 'evt-1',
        workspaceId: WORKSPACE,
        occurredAt: '2026-10-09T10:00:00.000Z',
        payload: { a: 1 },
      }),
    );
    expect(xack).toHaveBeenCalledWith(
      EVENT_BUS_STREAM,
      EventBusGroup.Notifications,
      '1759564000000-0',
    );
  });

  it('acks an unknown event type without calling the sink', async () => {
    xreadgroup.mockResolvedValue([entry('nope.unknown', valid)]);
    await consumer().runOnce();

    expect(handle).not.toHaveBeenCalled();
    expect(xack).toHaveBeenCalled();
  });

  it('acks an event outside the subscribed domains without asking the sink', async () => {
    xreadgroup.mockResolvedValue([entry('job.started', valid)]);
    await consumer().runOnce();

    expect(accepts).not.toHaveBeenCalled();
    expect(handle).not.toHaveBeenCalled();
    expect(xack).toHaveBeenCalled();
  });

  it('acks a rejected event before decoding its data', async () => {
    accepts.mockReturnValue(false);
    // Malformed data would be logged as unattributable if it were decoded.
    xreadgroup.mockResolvedValue([
      { ...entry('vulnerability.detected'), fields: { type: 'vulnerability.detected', id: 'e', data: '{bad' } },
    ]);
    await consumer().runOnce();

    expect(accepts).toHaveBeenCalledWith('vulnerability.detected');
    expect(handle).not.toHaveBeenCalled();
    expect(xack).toHaveBeenCalled();
  });

  it('acks an unattributable envelope instead of retrying it forever', async () => {
    xreadgroup.mockResolvedValue([
      entry('vulnerability.detected', { outcome: 'success' }),
    ]);
    await consumer().runOnce();

    expect(handle).not.toHaveBeenCalled();
    expect(xack).toHaveBeenCalled();
  });

  it('leaves a failing event pending while attempts remain', async () => {
    handle.mockRejectedValue(new Error('db down'));
    xreadgroup.mockResolvedValue([entry('vulnerability.detected', valid)]);
    await consumer().runOnce();

    expect(xack).not.toHaveBeenCalled();
    expect(xadd).not.toHaveBeenCalled();
  });

  it('parks the event in the workspace DLQ once attempts are exhausted', async () => {
    handle.mockRejectedValue(new Error('db down'));
    xpendingCount.mockResolvedValue(EVENT_BUS_MAX_ATTEMPTS);
    xreadgroup.mockResolvedValue([entry('vulnerability.detected', valid)]);
    await consumer().runOnce();

    expect(xadd).toHaveBeenCalledWith(
      eventBusDlqKey(WORKSPACE),
      expect.objectContaining({
        group: EventBusGroup.Notifications,
        error: 'db down',
      }),
    );
    expect(xack).toHaveBeenCalled();
  });

  it('runs an exclusive sink under its lane lock', async () => {
    await consumer({
      exclusive: { lockKey: 'lane-lock', lockTtlMs: 1000 },
    }).runOnce();

    expect(withLock).toHaveBeenCalledWith('lane-lock', 1000, expect.any(Function));
  });

  it('does not lock a non-exclusive sink', async () => {
    await consumer().runOnce();
    expect(withLock).not.toHaveBeenCalled();
  });
});
