import {
  EVENT_BUS_MAX_ATTEMPTS,
  EVENT_BUS_STREAM,
  eventBusDlqKey,
} from '@/common/constants/app.constants';
import { AuditOutcome, EventBusGroup } from '@/common/enums/enum';
import type { RedisService, StreamEntry } from '@/services/redis/redis.service';
import { AuditSinkService } from './audit-sink.service';

/**
 * The sink is the load-bearing half of "audit is a view of the stream": once
 * producers stop writing rows, a bug here silently loses audit history. The
 * cases below are the ones that actually cost rows in production — a redelivery
 * after a crash between write and XACK, an entry the catalog no longer knows, a
 * handler that keeps throwing, and an envelope the sink cannot attribute.
 *
 * Each test drives one `runOnce()` rather than the background loop, so the
 * assertions are deterministic: "given this batch of entries, exactly these
 * Redis calls happen".
 *
 * Run: task api:test:one SPEC=src/modules/event-bridge/audit-sink.service.spec.ts
 */
describe('AuditSinkService', () => {
  const WORKSPACE = '11111111-1111-4111-8111-111111111111';
  const EVENT_ID = '22222222-2222-4222-8222-222222222222';

  let xreadgroup: jest.Mock;
  let xautoclaim: jest.Mock;
  let xack: jest.Mock;
  let xadd: jest.Mock;
  let xpendingCount: jest.Mock;
  let orIgnore: jest.Mock;
  let values: jest.Mock;
  let execute: jest.Mock;
  let withLock: jest.Mock;

  let service: AuditSinkService;

  /** A well-formed `persist: true` stream entry, as XREADGROUP returns it. */
  const entry = (
    overrides: { type?: string; data?: unknown; id?: string } = {},
  ): StreamEntry => ({
    id: overrides.id ?? '1759564000000-0',
    fields: {
      specversion: '1.0',
      type: overrides.type ?? 'target.created',
      source: 'oasm://core-api',
      id: EVENT_ID,
      time: '2026-10-09T10:00:00.000Z',
      subject: `workspace:${WORKSPACE}/target:t-1`,
      data: JSON.stringify(
        overrides.data ?? {
          workspaceId: WORKSPACE,
          outcome: AuditOutcome.Success,
          resourceType: 'target',
          resourceId: 't-1',
          actor: { id: 'u-1', type: 'user' },
        },
      ),
    },
  });

  beforeEach(() => {
    xreadgroup = jest.fn().mockResolvedValue([]);
    xautoclaim = jest.fn().mockResolvedValue([]);
    xack = jest.fn().mockResolvedValue(1);
    xadd = jest.fn().mockResolvedValue('dlq-1');
    xpendingCount = jest.fn().mockResolvedValue(1);

    execute = jest.fn().mockResolvedValue({ raw: [] });
    orIgnore = jest.fn().mockReturnValue({ execute });
    values = jest.fn().mockReturnValue({ orIgnore });
    jest.fn().mockReturnValue({ into: jest.fn().mockReturnValue({ values }) });

    withLock = jest
      .fn()
      .mockImplementation((_key: string, _ttl: number, action: () => unknown) =>
        action(),
      );

    const redis = {
      xreadgroup,
      xautoclaim,
      xack,
      xadd,
      xpendingCount,
      xgroupCreate: jest.fn().mockResolvedValue(undefined),
    } as unknown as RedisService;

    const repo = {
      createQueryBuilder: () => ({
        insert: () => ({
          into: () => ({ values }),
        }),
      }),
    };

    service = new AuditSinkService(
      redis,
      { withLock } as never,
      repo as never,
    );
  });

  describe('persisting', () => {
    it('writes the CloudEvents id as event_id so a redelivery can dedupe', async () => {
      xreadgroup.mockResolvedValue([entry()]);
      await service.runOnce();

      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({ eventId: EVENT_ID, workspaceId: WORKSPACE }),
      );
    });

    it('acks the entry only after the row is written', async () => {
      xreadgroup.mockResolvedValue([entry()]);
      await service.runOnce();

      expect(execute).toHaveBeenCalledTimes(1);
      expect(xack).toHaveBeenCalledWith(
        EVENT_BUS_STREAM,
        EventBusGroup.Audit,
        expect.any(String),
      );
    });

    it('upserts with orIgnore — the at-least-once contract', async () => {
      xreadgroup.mockResolvedValue([entry()]);
      await service.runOnce();
      expect(orIgnore).toHaveBeenCalled();
    });

    it('sorts the view by the envelope time, not the insert time', async () => {
      xreadgroup.mockResolvedValue([entry()]);
      await service.runOnce();

      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({
          occurredAt: new Date('2026-10-09T10:00:00.000Z'),
        }),
      );
    });
  });

  describe('skipping without failing', () => {
    // Each of these is a permanent condition, not a transient one: acking is
    // what stops the entry from being reclaimed on every cycle forever.
    it('acks an entry whose type the catalog no longer declares', async () => {
      xreadgroup.mockResolvedValue([entry({ type: 'job.startd' })]);
      await service.runOnce();

      expect(values).not.toHaveBeenCalled();
      expect(xack).toHaveBeenCalled();
    });

    it('acks a persist:false event without writing a row', async () => {
      xreadgroup.mockResolvedValue([entry({ type: 'asset.discovered' })]);
      await service.runOnce();

      expect(values).not.toHaveBeenCalled();
      expect(xack).toHaveBeenCalled();
    });

    it('acks an envelope with no workspaceId instead of a partial row', async () => {
      xreadgroup.mockResolvedValue([
        entry({ data: { outcome: AuditOutcome.Success } }),
      ]);
      await service.runOnce();

      expect(values).not.toHaveBeenCalled();
      expect(xack).toHaveBeenCalled();
    });

    it('acks an envelope with no outcome', async () => {
      xreadgroup.mockResolvedValue([
        entry({ data: { workspaceId: WORKSPACE } }),
      ]);
      await service.runOnce();

      expect(values).not.toHaveBeenCalled();
      expect(xack).toHaveBeenCalled();
    });
  });

  describe('retry and dead letter', () => {
    it('leaves a failing entry unacked so a later cycle reclaims it', async () => {
      execute.mockRejectedValue(new Error('DB down'));
      xreadgroup.mockResolvedValue([entry()]);
      await service.runOnce();

      expect(xack).not.toHaveBeenCalled();
      expect(xadd).not.toHaveBeenCalled();
    });

    it('parks the envelope in the per-workspace DLQ after the last attempt', async () => {
      execute.mockRejectedValue(new Error('DB down'));
      xpendingCount.mockResolvedValue(EVENT_BUS_MAX_ATTEMPTS);
      xreadgroup.mockResolvedValue([entry()]);
      await service.runOnce();

      expect(xadd).toHaveBeenCalledWith(
        eventBusDlqKey(WORKSPACE),
        expect.objectContaining({ type: 'target.created', id: EVENT_ID }),
      );
    });

    it('acks a dead-lettered entry so the loop keeps moving', async () => {
      execute.mockRejectedValue(new Error('DB down'));
      xpendingCount.mockResolvedValue(EVENT_BUS_MAX_ATTEMPTS);
      xreadgroup.mockResolvedValue([entry()]);
      await service.runOnce();

      expect(xack).toHaveBeenCalled();
    });
  });

  describe('secret redaction', () => {
    it('strips a credential from metadata before it reaches the table', async () => {
      xreadgroup.mockResolvedValue([
        entry({
          data: {
            workspaceId: WORKSPACE,
            outcome: AuditOutcome.Success,
            metadata: { apiToken: 'ghp_abcdef123456', count: 3 },
          },
        }),
      ]);
      await service.runOnce();

      const written = values.mock.calls[0][0] as {
        metadata: Record<string, unknown>;
      };
      expect(written.metadata).toEqual({ count: 3 });
    });
  });

  describe('single instance', () => {
    it('wraps the cycle in the distributed lock', async () => {
      await service.runOnce();
      expect(withLock).toHaveBeenCalledTimes(1);
    });

    it('does not read when another instance holds the lock', async () => {
      withLock.mockResolvedValue(null);
      await service.runOnce();
      expect(xreadgroup).not.toHaveBeenCalled();
    });
  });

  describe('retry ordering', () => {
    it('reclaims stalled entries before reading new ones', async () => {
      // A stream that keeps producing must not starve an entry whose handler
      // is still failing.
      const order: string[] = [];
      xautoclaim.mockImplementation(() => {
        order.push('autoclaim');
        return Promise.resolve([]);
      });
      xreadgroup.mockImplementation(() => {
        order.push('read');
        return Promise.resolve([]);
      });

      await service.runOnce();

      expect(order).toEqual(['autoclaim', 'read']);
    });
  });
});