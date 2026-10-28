import { NotificationStatus } from '@/common/enums/enum';
import { RedisService } from '@/services/redis/redis.service';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { NotificationRecipient } from './entities/notification-recipient.entity';
import { Notification } from './entities/notification.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsSink } from '../event-bridge/sinks/notifications/notifications.sink';
import { BadRequestException } from '@nestjs/common';
import {
  CURSOR_TS_SQL,
  decodeNotificationCursor,
  encodeNotificationCursor,
} from './notification-cursor';

const RECIPIENT_ID = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** `count` recipient rows, newest first, as getRawAndEntities returns them. */
function rows(count: number) {
  const entities = Array.from({ length: count }, (_, i) => ({
    id: RECIPIENT_ID(i),
    status: NotificationStatus.SENT,
    createdAt: new Date('2026-10-28T10:00:00.000Z'),
    notification: { type: 'ASSET_NEW_DETECT', metadata: {} },
  }));
  const raw = entities.map((e, i) => ({
    recipient_id: e.id,
    cursor_ts: `2026-10-28T10:00:00.${String(999999 - i).padStart(6, '0')}`,
  }));
  return { entities, raw };
}

function buildQueryBuilderMock(result = rows(0)) {
  const qb: Record<string, jest.Mock> = {
    getRawAndEntities: jest.fn().mockResolvedValue(result),
  };
  for (const method of [
    'leftJoinAndSelect',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
    'select',
    'addSelect',
    'limit',
  ]) {
    qb[method] = jest.fn().mockReturnValue(qb);
  }
  return qb;
}

describe('NotificationsService', () => {
  let service: NotificationsService;
  let notificationRecipientRepo: {
    createQueryBuilder: jest.Mock;
    count: jest.Mock;
    find: jest.Mock;
    delete: jest.Mock;
    update: jest.Mock;
  };

  const query = { limit: 10 };

  beforeEach(async () => {
    notificationRecipientRepo = {
      createQueryBuilder: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      find: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
      update: jest.fn().mockResolvedValue({ affected: 0 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: getRepositoryToken(NotificationRecipient),
          useValue: notificationRecipientRepo,
        },
        {
          provide: getRepositoryToken(Notification),
          useValue: {
            createQueryBuilder: jest.fn(),
            count: jest.fn(),
            find: jest.fn().mockResolvedValue([]),
            delete: jest.fn().mockResolvedValue({ affected: 0 }),
            update: jest.fn(),
          },
        },
        {
          provide: I18nService,
          useValue: { translate: jest.fn().mockReturnValue('msg') },
        },
        {
          provide: RedisService,
          useValue: {},
        },
        {
          provide: NotificationsSink,
          useValue: { deliver: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it('filters to system-wide notifications when no workspace is selected', async () => {
    const qb = buildQueryBuilderMock();
    notificationRecipientRepo.createQueryBuilder.mockReturnValue(qb);

    await service.getNotifications('user-1', undefined, query, 'en');

    expect(qb.andWhere).toHaveBeenCalledWith(
      'notification.workspaceId IS NULL',
      { workspaceId: undefined },
    );
    expect(qb.andWhere.mock.calls[0][0]).not.toContain('= :workspaceId');
  });

  it('filters to workspace or system-wide notifications when a workspace is selected', async () => {
    const qb = buildQueryBuilderMock();
    notificationRecipientRepo.createQueryBuilder.mockReturnValue(qb);

    await service.getNotifications('user-1', 'ws-1', query, 'en');

    expect(qb.andWhere).toHaveBeenCalledWith(
      '(notification.workspaceId = :workspaceId OR notification.workspaceId IS NULL)',
      { workspaceId: 'ws-1' },
    );
  });

  describe('keyset pagination', () => {
    it('reads one row past the page, newest first, with id breaking ties', async () => {
      const qb = buildQueryBuilderMock();
      notificationRecipientRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getNotifications('user-1', 'ws-1', query, 'en');

      expect(qb.limit).toHaveBeenCalledWith(11);
      expect(qb.orderBy).toHaveBeenCalledWith('recipient.createdAt', 'DESC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('recipient.id', 'DESC');
      expect(qb.addSelect).toHaveBeenCalledWith(CURSOR_TS_SQL, 'cursor_ts');
    });

    it('returns a cursor at the last row shown when more rows exist', async () => {
      const result = rows(11);
      const qb = buildQueryBuilderMock(result);
      notificationRecipientRepo.createQueryBuilder.mockReturnValue(qb);

      const page = await service.getNotifications('user-1', 'ws-1', query, 'en');

      expect(page.data).toHaveLength(10);
      // Built from the Postgres-rendered timestamp, not the entity's Date.
      expect(decodeNotificationCursor(page.nextCursor!)).toEqual({
        createdAt: result.raw[9].cursor_ts,
        id: RECIPIENT_ID(9),
      });
    });

    it('has no cursor on the last page', async () => {
      const qb = buildQueryBuilderMock(rows(10));
      notificationRecipientRepo.createQueryBuilder.mockReturnValue(qb);

      const page = await service.getNotifications('user-1', 'ws-1', query, 'en');

      expect(page.data).toHaveLength(10);
      expect(page.nextCursor).toBeNull();
    });

    it('continues strictly after the cursor row', async () => {
      const qb = buildQueryBuilderMock();
      notificationRecipientRepo.createQueryBuilder.mockReturnValue(qb);
      const cursor = encodeNotificationCursor({
        createdAt: '2026-10-28T10:00:00.123456',
        id: RECIPIENT_ID(1),
      });

      await service.getNotifications('user-1', 'ws-1', { ...query, cursor }, 'en');

      expect(qb.andWhere).toHaveBeenCalledWith(
        '(recipient.createdAt, recipient.id) < (CAST(:cursorTs AS timestamp), CAST(:cursorId AS uuid))',
        { cursorTs: '2026-10-28T10:00:00.123456', cursorId: RECIPIENT_ID(1) },
      );
    });

    it('rejects a malformed cursor before querying', async () => {
      const qb = buildQueryBuilderMock();
      notificationRecipientRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(
        service.getNotifications('user-1', 'ws-1', { ...query, cursor: 'nope!' }, 'en'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(qb.getRawAndEntities).not.toHaveBeenCalled();
    });
  });

  it('counts unread notifications per user', async () => {
    await service.getUnreadCount('user-1');

    expect(notificationRecipientRepo.count).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        status: NotificationStatus.SENT,
      },
    });
  });

  it('marks one notification unread without counting it as new again', async () => {
    await service.markAsUnread('rcpt-1', 'user-1');

    expect(notificationRecipientRepo.update).toHaveBeenCalledWith(
      { id: 'rcpt-1', userId: 'user-1' },
      { status: NotificationStatus.UNREAD },
    );
  });
});
