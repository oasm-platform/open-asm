import { NotificationScope, NotificationType } from '@/common/enums/enum';
import type { RedisService } from '@/services/redis/redis.service';
import type { Repository } from 'typeorm';
import type { Notification } from '../notifications/entities/notification.entity';
import type { NotificationRecipient } from '../notifications/entities/notification-recipient.entity';
import type { User } from '../auth/entities/user.entity';
import { EventBusGroup } from '@/common/enums/enum';
import type { StreamEntry } from '@/services/redis/redis.service';
import { NotificationsSinkService } from './notifications.sink.service';

/**
 * The notifications lane replaces the BullMQ queue, so what matters here is
 * that the BEHAVIOUR survived the move. These cases are the ones that were
 * previously asserted against `NotificationsConsumer.process`, restated as
 * "given this event, these rows and pushes happen".
 *
 * Each test drives one `runOnce()` against a mocked Redis + TypeORM, so the
 * assertions are about the call sequence, not about a running Redis.
 *
 * Run: task api:test:one SPEC=src/modules/event-bridge/notifications.sink.service.spec.ts
 */
describe('NotificationsSinkService', () => {
  const WORKSPACE = '11111111-1111-4111-8111-111111111111';
  const EVENT_ID = '22222222-2222-4222-8222-222222222222';
  const MEMBER_1 = 'aaaaaaaa-1111-4111-8111-111111111111';
  const MEMBER_2 = 'bbbbbbbb-2222-4222-8222-222222222222';

  let xreadgroup: jest.Mock;
  let xack: jest.Mock;
  let setIfAbsent: jest.Mock;
  let setex: jest.Mock;
  let notificationSave: jest.Mock;
  let recipientSave: jest.Mock;
  let findBy: jest.Mock;
  let publish: jest.Mock;

  let service: NotificationsSinkService;

  const entry = (type: string, payload: unknown): StreamEntry => ({
    id: '1759564000000-0',
    fields: {
      specversion: '1.0',
      type,
      source: 'oasm://core-api',
      id: EVENT_ID,
      time: '2026-10-09T10:00:00.000Z',
      data: JSON.stringify({
        workspaceId: WORKSPACE,
        outcome: 'success',
        payload,
      }),
    },
  });

  const MEMBERS = [{ id: MEMBER_1 }, { id: MEMBER_2 }];

  beforeEach(() => {
    xreadgroup = jest.fn().mockResolvedValue([]);
    xack = jest.fn().mockResolvedValue(1);
    setIfAbsent = jest.fn().mockResolvedValue(true);
    setex = jest.fn().mockResolvedValue('OK');
    publish = jest.fn().mockResolvedValue(1);

    notificationSave = jest.fn().mockResolvedValue({ id: 'notif-1' });
    recipientSave = jest.fn().mockResolvedValue([]);
    // Respects the `In(recipients)` filter, like TypeORM does. Honouring it is
    // what makes "addressed to one user only" a real assertion rather than a
    // mock that always hands back the whole workspace.
findBy = jest.fn().mockImplementation((where: { id?: { _value: string[] } }) => {
      const wanted = where.id?._value ?? MEMBERS.map((m) => m.id);
      return Promise.resolve(
        wanted.map(
          (userId) => MEMBERS.find((m) => m.id === userId) ?? { id: userId },
        ),
      );
    });

    const redis = {
      xreadgroup,
      xack,
      setIfAbsent,
      setex,
      // The loop reclaims stalled entries before reading new ones; empty here
      // so each test sees exactly the entries it staged.
      xautoclaim: jest.fn().mockResolvedValue([]),
      xpendingCount: jest.fn().mockResolvedValue(1),
      publisher: { publish },
    } as unknown as RedisService;

    const notificationRepo = { save: notificationSave };
    const recipientRepo = { save: recipientSave };
    const userRepo = {
      findBy,
      createQueryBuilder: () => ({
        innerJoin: jest.fn().mockReturnThis(),
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(MEMBERS),
      }),
    };

    service = new NotificationsSinkService(
      redis,
      {} as never,
      notificationRepo as unknown as Repository<Notification>,
      recipientRepo as unknown as Repository<NotificationRecipient>,
      userRepo as unknown as Repository<User>,
    );
  });

  afterEach(() => service.stop());

  describe('workflow.run.completed', () => {
    it('writes one notification for the new assets', async () => {
      xreadgroup.mockResolvedValue([
        entry('workflow.run.completed', {
          targetValue: 'example.com',
          targetId: 't-1',
          hosts: 3,
          ports: 2,
          services: 1,
          techs: 0,
          hasNewAssets: true,
        }),
      ]);
      await service.runOnce();

      expect(notificationSave).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.ASSET_NEW_DETECT,
          scope: NotificationScope.GROUP,
          workspaceId: WORKSPACE,
        }),
      );
    });

    it('carries the scan deltas into the i18n arguments', async () => {
      xreadgroup.mockResolvedValue([
        entry('workflow.run.completed', {
          targetValue: 'example.com',
          targetId: 't-1',
          hosts: 3,
          ports: 2,
          services: 1,
          techs: 0,
          hasNewAssets: true,
        }),
      ]);
      await service.runOnce();

      expect(notificationSave).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            hosts: '3',
            ports: '2',
            targetValue: 'example.com',
          }),
        }),
      );
    });

    it('sends the incomplete-run notice only when the run did NOT finish', async () => {
      // A clean run already reported its new assets; "your scan stopped
      // halfway" after a clean finish is noise.
      xreadgroup.mockResolvedValue([
        entry('workflow.run.completed', {
          targetValue: 'example.com',
          targetId: 't-1',
          hosts: 3,
          hasNewAssets: true,
        }),
      ]);
      await service.runOnce();

      expect(notificationSave).not.toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.SCAN_INCOMPLETE,
        }),
      );
    });

    it('adds the incomplete-run notice when the run stopped halfway', async () => {
      xreadgroup.mockResolvedValue([
        entry('workflow.run.completed', {
          targetValue: 'example.com',
          targetId: 't-1',
          hasNewAssets: true,
          incompleteDetails: 'step-2 failed',
        }),
      ]);
      await service.runOnce();

      expect(notificationSave).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.SCAN_INCOMPLETE,
          metadata: expect.objectContaining({ details: 'step-2 failed' }),
        }),
      );
    });
  });

  describe('audience', () => {
    it('resolves recipients from workspace membership, not from the producer', async () => {
      xreadgroup.mockResolvedValue([
        entry('vulnerability.detected', { count: 2, assetValue: 'a.example' }),
      ]);
      await service.runOnce();

      // The producer only reported a finding; who hears about it is the sink's
      // decision, which is what lets a member who joins tomorrow start
      // receiving notifications with no producer change.
      expect(recipientSave).toHaveBeenCalledWith([
        expect.objectContaining({ userId: MEMBER_1 }),
        expect.objectContaining({ userId: MEMBER_2 }),
      ]);
    });

    it('addresses a single-user analysis to that user only', async () => {
      xreadgroup.mockResolvedValue([
        entry('vulnerability.analysis.completed', {
          userId: MEMBER_1,
          vulnerabilityId: 'v-1',
          vulnerabilityName: 'CVE-2026-1',
        }),
      ]);
      await service.runOnce();

      expect(recipientSave).toHaveBeenCalledWith([
        expect.objectContaining({ userId: MEMBER_1 }),
      ]);
      expect(notificationSave).toHaveBeenCalledWith(
        expect.objectContaining({ scope: NotificationScope.USER }),
      );
    });

    it('skips an actor-addressed event that names no user', async () => {
      xreadgroup.mockResolvedValue([
        entry('vulnerability.analysis.completed', { vulnerabilityId: 'v-1' }),
      ]);
      await service.runOnce();

      expect(notificationSave).not.toHaveBeenCalled();
    });
  });

  describe('idempotency', () => {
    it('does not duplicate a redelivered event', async () => {
      setIfAbsent.mockResolvedValue(false);
      xreadgroup.mockResolvedValue([
        entry('workflow.run.completed', {
          hasNewAssets: true,
          targetValue: 'example.com',
        }),
      ]);
      await service.runOnce();

      expect(notificationSave).not.toHaveBeenCalled();
      // Still acked: the event was handled, it just must not act twice.
      expect(xack).toHaveBeenCalled();
    });

    it('writes both notifications one event legitimately produces', async () => {
      // The dedupe key includes the notification type, so the two messages a
      // partial run emits are not collapsed into one.
      xreadgroup.mockResolvedValue([
        entry('workflow.run.completed', {
          hasNewAssets: true,
          targetValue: 'example.com',
          incompleteDetails: 'step-2 failed',
        }),
      ]);
      await service.runOnce();

      expect(notificationSave).toHaveBeenCalledTimes(2);
    });
  });

  describe('non-notifying events', () => {
    it.each([
      ['asset.updated', {}],
      ['job.started', {}],
      ['workflow.run.started', {}],
    ])('consumes %s without writing a row', async (type, payload) => {
      xreadgroup.mockResolvedValue([entry(type, payload)]);
      await service.runOnce();

      expect(notificationSave).not.toHaveBeenCalled();
      expect(xack).toHaveBeenCalled();
    });

    it('ignores the notification domain to avoid a self-feeding loop', async () => {
      xreadgroup.mockResolvedValue([entry('notification.sent', {})]);
      await service.runOnce();

      expect(notificationSave).not.toHaveBeenCalled();
      expect(xack).toHaveBeenCalled();
    });
  });

  describe('group identity', () => {
    it('runs on the notifications group', async () => {
      await service.runOnce();
      expect(xreadgroup).toHaveBeenCalledWith(
        expect.any(String),
        EventBusGroup.Notifications,
        expect.any(String),
        expect.any(Number),
        expect.any(Number),
      );
    });
  });
});