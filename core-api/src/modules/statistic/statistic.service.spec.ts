import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { Severity } from '@/common/enums/enum';
import type { Statistic } from './entities/statistic.entity';
import { ReportStatisticsService } from './report-statistics.service';
import { StatisticService } from './statistic.service';
import { DataSource } from 'typeorm';
import { GeoIpService } from '@/services/geo-ip/geo-ip.service';
import { RedisService } from '@/services/redis/redis.service';
import { TechnologyForwarderService } from '../technology/technology-forwarder.service';

describe('StatisticService', () => {
  let service: StatisticService;
  let reports: ReportStatisticsService;

  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
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

  const mockTechnologyForwarderService = {
    enrichTechnologies: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatisticService,
        ReportStatisticsService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: GeoIpService, useValue: mockGeoIpService },
        { provide: RedisService, useValue: mockRedisService },
        {
          provide: TechnologyForwarderService,
          useValue: mockTechnologyForwarderService,
        },
      ],
    }).compile();

    service = module.get<StatisticService>(StatisticService);
    reports = module.get(ReportStatisticsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getTopTechnologies', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockQueryBuilder.getRawMany.mockResolvedValue([
        { name: 'nginx:1.18', count: '15' },
        { name: 'react', count: '3' },
      ]);
      mockTechnologyForwarderService.enrichTechnologies.mockResolvedValue([
        { name: 'nginx', iconUrl: 'https://storage/cached-static/abc.svg' },
      ]);
    });

    it('attaches iconUrl from the technology forwarder to each top technology', async () => {
      const result = await service.getTopTechnologies('workspace-uuid');

      expect(mockTechnologyForwarderService.enrichTechnologies).toHaveBeenCalledWith(
        ['nginx', 'react'],
      );
      expect(result.technologies).toEqual([
        {
          name: 'nginx:1.18',
          count: 15,
          iconUrl: 'https://storage/cached-static/abc.svg',
        },
        { name: 'react', count: 3 },
      ]);
    });

    it('leaves iconUrl unset when enrichment has no match', async () => {
      mockTechnologyForwarderService.enrichTechnologies.mockResolvedValue([]);

      const result = await service.getTopTechnologies('workspace-uuid');

      expect(result.technologies[0]).toEqual({ name: 'nginx:1.18', count: 15 });
    });
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
      expect(sql).toMatch(/DISTINCT ON\s*\(\s*tc\."host"/);
      expect(sql).toContain('tc."sni"');
      expect(sql).toContain('tc."subjectAn"');
      expect(sql).toContain('FROM "tls_certificates" tc');
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

  describe('calculateSecurityScore', () => {
    const score = (counts: Partial<Record<Severity, number>>) =>
      StatisticService.calculateSecurityScore({
        [Severity.CRITICAL]: 0,
        [Severity.HIGH]: 0,
        [Severity.MEDIUM]: 0,
        [Severity.LOW]: 0,
        [Severity.INFO]: 0,
        ...counts,
      });

    it('is 100 without open findings, however many Info findings there are', () => {
      expect(score({})).toBe(100);
      expect(score({ [Severity.INFO]: 500 })).toBe(100);
    });

    it('moves off 100 for a single low finding', () => {
      expect(score({ [Severity.LOW]: 1 })).toBe(99);
    });

    it('caps a workspace with an open high below the A band', () => {
      expect(score({ [Severity.HIGH]: 1 })).toBe(89);
    });

    it('caps a workspace with an open critical at the D band', () => {
      expect(score({ [Severity.CRITICAL]: 1 })).toBe(69);
      expect(score({ [Severity.CRITICAL]: 3 })).toBe(65);
    });

    it('bottoms out at what the severity caps leave', () => {
      expect(
        score({
          [Severity.CRITICAL]: 1000,
          [Severity.HIGH]: 1000,
          [Severity.MEDIUM]: 1000,
          [Severity.LOW]: 1000,
        }),
      ).toBe(15);
    });
  });

  describe('toDailySeries', () => {
    const day = (offset: number) => {
      const date = new Date();
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCDate(date.getUTCDate() + offset);
      return date;
    };
    const stat = (createdAt: Date, counts: Partial<Statistic> = {}) =>
      ({
        criticalVuls: 0,
        highVuls: 0,
        mediumVuls: 0,
        lowVuls: 0,
        infoVuls: 0,
        vuls: 0,
        createdAt,
        ...counts,
      }) as Statistic;
    const hoursInto = (date: Date, hours: number) =>
      new Date(date.getTime() + hours * 3_600_000);

    it('carries each snapshot forward one point per day and ends with the live numbers', () => {
      const series = StatisticService.toDailySeries(
        [
          stat(hoursInto(day(-5), 1), { criticalVuls: 1 }),
          stat(hoursInto(day(-3), 2), { criticalVuls: 2 }),
        ],
        day(-7),
        stat(new Date(), { criticalVuls: 3 }),
      );

      // Days -7 and -6 precede the first snapshot and are left out.
      expect(series.map((point) => point.criticalVuls)).toEqual([
        1, 1, 2, 2, 2, 3,
      ]);
      expect(series.slice(0, -1).map((point) => point.createdAt)).toEqual([
        day(-5),
        day(-4),
        day(-3),
        day(-2),
        day(-1),
      ]);
    });

    it('counts open vulnerabilities from the severity columns, without Info', () => {
      const [live] = StatisticService.toDailySeries(
        [],
        day(-1),
        stat(new Date(), { criticalVuls: 1, highVuls: 2, infoVuls: 9, vuls: 12 }),
      );

      expect(live.vuls).toBe(3);
    });
  });

  describe('ReportStatisticsService.getCountForWorkspace', () => {
    it('sums open vulnerabilities across severities, leaving Info out', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValueOnce([
        { workspaceId: 'workspace-1', severity: 'critical', count: '2' },
        { workspaceId: 'workspace-1', severity: 'info', count: '40' },
        { workspaceId: 'workspace-1', severity: 'low', count: '3' },
      ]);

      await expect(
        reports.getCountForWorkspace('vulnerabilities', 'workspace-1'),
      ).resolves.toBe(5);
    });
  });

  describe('getStatistics', () => {
    it('serves the live numbers from the cache without recomputing them', async () => {
      mockRedisService.get.mockResolvedValueOnce(
        JSON.stringify({ assets: 7, vuls: 2, score: 89 }),
      );
      const calculate = jest.spyOn(service, 'calculateStatistics');

      const result = await service.getStatistics('workspace-1');

      expect(result).toMatchObject({ assets: 7, vuls: 2, score: 89 });
      expect(calculate).not.toHaveBeenCalled();
    });
  });
});
