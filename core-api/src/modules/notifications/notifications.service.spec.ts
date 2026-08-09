import { BullMQName, NotificationStatus } from '@/common/enums/enum';
import { RedisService } from '@/services/redis/redis.service';
import { getQueueToken } from '@nestjs/bullmq';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { NotificationRecipient } from './entities/notification-recipient.entity';
import { Notification } from './entities/notification.entity';
import { NotificationsService } from './notifications.service';

function buildQueryBuilderMock() {
  const qb: Record<string, jest.Mock> = {
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };
  for (const method of [
    'leftJoinAndSelect',
    'where',
    'andWhere',
    'orderBy',
    'select',
    'skip',
    'take',
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

  const query = { page: 1, limit: 10 };

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
          provide: getQueueToken(BullMQName.NOTIFICATION),
          useValue: { add: jest.fn() },
        },
        {
          provide: I18nService,
          useValue: { translate: jest.fn().mockReturnValue('msg') },
        },
        {
          provide: RedisService,
          useValue: {},
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

  it('counts unread notifications per user', async () => {
    await service.getUnreadCount('user-1');

    expect(notificationRecipientRepo.count).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        status: NotificationStatus.SENT,
      },
    });
  });
});
