import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { DefaultWorkflow, NotificationScope, NotificationType } from '@/common/enums/enum';
import type { Job } from '../jobs-registry/entities/job.entity';
import { StatisticService } from './statistic.service';
import { DataSource } from 'typeorm';
import { GeoIpService } from '@/services/geo-ip/geo-ip.service';
import { RedisService } from '@/services/redis/redis.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TechnologyForwarderService } from '../technology/technology-forwarder.service';

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

  const mockWorkspacesService = {
    getMemberOfWorkspaceByJobId: jest.fn(),
  };

  const mockNotificationsService = {
    createNotification: jest.fn(),
  };

  const mockTechnologyForwarderService = {
    enrichTechnologies: jest.fn(),
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
        {
          provide: TechnologyForwarderService,
          useValue: mockTechnologyForwarderService,
        },
      ],
    }).compile();

    service = module.get<StatisticService>(StatisticService);
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

  describe('handleWorkflowEnd', () => {
    interface SnapshotLike {
      hosts: number;
      ports: number;
      services: number;
      techs: number;
    }

    const targetJob = (steps: Record<string, unknown>): Job =>
      ({
        id: 'job-1',
        asset: { target: { id: 'target-1', value: 'cline.bot' } },
        jobHistory: {
          workflow: { filePath: DefaultWorkflow.DOMAIN_DISCOVERY },
          steps,
        },
      }) as unknown as Job;

    const snapshotSpy = () =>
      jest.spyOn(
        service as unknown as {
          takeSnapshotStatisticTarget: (id: string) => Promise<SnapshotLike>;
        },
        'takeSnapshotStatisticTarget',
      );

    beforeEach(() => {
      jest.clearAllMocks();
      mockRedisService.get.mockResolvedValue(null);
      mockRedisService.del.mockResolvedValue(undefined);
      mockWorkspacesService.getMemberOfWorkspaceByJobId.mockResolvedValue([
        { user: { id: 'user-1' }, workspace: { id: 'workspace-1' } },
      ]);
    });

    it('flags the discovery report as incomplete when a step failed', async () => {
      snapshotSpy().mockResolvedValue({
        hosts: 1,
        ports: 0,
        services: 3,
        techs: 0,
      });

      await service.handleWorkflowEnd(
        targetJob({
          scan_subdomain: { status: 'done' },
          port_scan: { status: 'failed' },
          http_probe: { status: 'skipped', reason: 'blocked-by-failure' },
        }),
      );

      expect(mockNotificationsService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.ASSET_NEW_DETECT,
          scope: NotificationScope.GROUP,
          metadata: expect.objectContaining({
            services: '3',
            incomplete: 'true',
          }),
        }),
      );
      expect(mockNotificationsService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.SCAN_INCOMPLETE,
          metadata: expect.objectContaining({
            targetValue: 'cline.bot',
            details: 'port_scan failed; http_probe skipped after a failure',
          }),
        }),
      );
    });

    it('reports a run that died without discovering anything', async () => {
      snapshotSpy().mockResolvedValue({
        hosts: 0,
        ports: 0,
        services: 0,
        techs: 0,
      });

      await service.handleWorkflowEnd(
        targetJob({ port_scan: { status: 'failed' } }),
      );

      const types = mockNotificationsService.createNotification.mock.calls.map(
        ([dto]) => (dto as { type: NotificationType }).type,
      );
      expect(types).toEqual([NotificationType.SCAN_INCOMPLETE]);
    });

    it('leaves a run that finished its whole graph unflagged', async () => {
      snapshotSpy().mockResolvedValue({
        hosts: 2,
        ports: 4,
        services: 4,
        techs: 1,
      });

      await service.handleWorkflowEnd(
        targetJob({
          scan_subdomain: { status: 'done' },
          port_scan: { status: 'done' },
          http_probe: { status: 'done' },
          take_screenshot: { status: 'done' },
        }),
      );

      expect(mockNotificationsService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.ASSET_NEW_DETECT,
          metadata: expect.objectContaining({ incomplete: '' }),
        }),
      );
      const types = mockNotificationsService.createNotification.mock.calls.map(
        ([dto]) => (dto as { type: NotificationType }).type,
      );
      expect(types).not.toContain(NotificationType.SCAN_INCOMPLETE);
    });
  });
});
