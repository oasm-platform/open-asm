import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { StatisticService } from './statistic.service';
import { DataSource } from 'typeorm';
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
    from: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
    getRawOne: jest.fn(),
    getQuery: jest.fn(),
    getParameters: jest.fn().mockReturnValue({}),
    setParameter: jest.fn().mockReturnThis(),
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

  describe('getTlsStatistics', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockQueryBuilder.getRawOne.mockResolvedValue({
        alreadyExpired: '3',
        expireInAMonth: '2',
        expireIn3Months: '1',
        wontExpireAnytimeSoon: '0',
        newCertificatesDiscovered: '4',
      });
    });

    it('deduplicates by full certificate columns so counts match the TLS tab totals', async () => {
      await service.getTlsStatistics('workspace-uuid');

      const fromCall = mockQueryBuilder.from.mock.calls[0];
      // Normalize whitespace so multi-line template SQL still matches.
      const sql = String(fromCall[0]).replace(/\s+/g, ' ');
      // Same grouping as getManyTls: one row per distinct certificate, not
      // per (host, assetServiceId) — otherwise a cert served on several ports
      // of the same host is counted once per service and the dashboard card
      // no longer matches the TLS tab total after clicking through.
      expect(sql).toMatch(/DISTINCT ON\s*\(\s*hr\.tls->>'host'/);
      expect(sql).toContain("hr.tls->>'sni'");
      expect(sql).toContain("hr.tls->>'subject_an'");
      expect(sql).not.toContain('assetServiceId)');
    });

    it('returns numeric buckets from the raw row', async () => {
      const result = await service.getTlsStatistics('workspace-uuid');

      expect(result).toEqual({
        alreadyExpired: 3,
        expireInAMonth: 2,
        expireIn3Months: 1,
        wontExpireAnytimeSoon: 0,
        newCertificatesDiscovered: 4,
      });
    });
  });
});
