import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { StatisticService } from './statistic.service';
import { DataSource } from 'typeorm';
import { AssetsService } from '../assets/assets.service';
import { GeoIpService } from '@/services/geo-ip/geo-ip.service';
import { RedisService } from '@/services/redis/redis.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('StatisticService', () => {
  let service: StatisticService;

  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
    getRawOne: jest.fn(),
    getQuery: jest.fn(),
    setParameters: jest.fn().mockReturnThis(),
  };

  const mockRepository = {
    count: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    find: jest.fn(),
    save: jest.fn(),
  };

  const mockDataSource = {
    getRepository: jest.fn().mockReturnValue(mockRepository),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  };

  const mockAssetsService = {
    getIpAssets: jest.fn(),
  };

  const mockGeoIpService = {
    getGeoIp: jest.fn(),
  };

  const mockRedisService = {
    get: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
  };

  const mockWorkspacesService = {
    getMemberOfWorkspaceByJobId: jest.fn(),
  };

  const mockNotificationsService = {
    createNotification: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatisticService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: AssetsService, useValue: mockAssetsService },
        { provide: GeoIpService, useValue: mockGeoIpService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: WorkspacesService, useValue: mockWorkspacesService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    service = module.get<StatisticService>(StatisticService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
