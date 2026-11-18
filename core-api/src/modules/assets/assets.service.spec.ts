import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { DataSource } from 'typeorm';
import { GeoIpService } from '@/services/geo-ip/geo-ip.service';
import { WorkspaceEncryptionService } from '@/services/workspace-encryption/workspace-encryption.service';
import { Target } from '../targets/entities/target.entity';
import { StorageService } from '../storage/storage.service';
import { TechnologyForwarderService } from '../technology/technology-forwarder.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { AssetsService } from './assets.service';
import { freshRunSql } from './fresh-runs';
import { AssetService } from './entities/asset-services.entity';
import { Asset } from './entities/assets.entity';
import { DnsRecord } from './entities/dns-record.entity';
import { HttpResponseTechnology } from './entities/http-response-technology.entity';
import { HttpStatusCode } from './entities/http-status-code.entity';
import { IpObservation } from './entities/ip-observation.entity';
import { TlsCertificate } from './entities/tls-certificate.entity';
import { AgentConfig } from '../agents/entities/agent-config.entity';
import { AgentLLMConfig } from '../agents/entities/agent-llm-config.entity';
import type { GetAssetsQueryDto } from './dto/assets.dto';

describe('AssetsService', () => {
  let service: AssetsService;
  let mockAssetRepository: Partial<Repository<Asset>>;
  let mockAssetServiceRepository: Partial<Repository<AssetService>>;
  let mockTargetRepository: Partial<Repository<Target>>;
  let mockTechnologyForwarderService: Partial<TechnologyForwarderService>;
  let mockWorkspacesService: Partial<WorkspacesService>;
  let mockGeoIpService: Partial<GeoIpService>;
  let mockLlmConfigRepository: Partial<Repository<AgentLLMConfig>>;
  let mockWorkspaceEncryptionService: Partial<WorkspaceEncryptionService>;
  let mockStorageService: Partial<StorageService>;
  let mockDataSource: Partial<DataSource>;
  let mockTlsCertificateRepository: Partial<Repository<TlsCertificate>>;
  let mockHttpResponseTechnologyRepository: Partial<
    Repository<HttpResponseTechnology>
  >;
  let mockHttpStatusCodeRepository: Partial<Repository<HttpStatusCode>>;
  let mockIpObservationRepository: Partial<Repository<IpObservation>>;
  let mockDnsRecordRepository: Partial<Repository<DnsRecord>>;

  beforeEach(async () => {
    mockAssetRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };

    mockAssetServiceRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
      getOneOrFail: jest.fn(),
      getMany: jest.fn(),
      getManyAndCount: jest.fn(),
      getRawMany: jest.fn(),
      getRawOne: jest.fn(),
    } as any;

    mockTargetRepository = {
      findOne: jest.fn(),
      update: jest.fn(),
    };

    mockTechnologyForwarderService = {
      enrichTechnologies: jest.fn(),
    };

    mockWorkspacesService = {
      getWorkspaceIdByTargetId: jest.fn(),
      getWorkspaceConfigValue: jest.fn(),
    };

    mockGeoIpService = {
      lookup: jest.fn(),
    } as any;

    mockWorkspaceEncryptionService = {};

    mockStorageService = {
      signStoragePaths: jest.fn(),
      signStoragePath: jest.fn(),
    };

    mockLlmConfigRepository = {
      findOne: jest.fn(),
    };

    mockTlsCertificateRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnThis(),
    };

    mockHttpResponseTechnologyRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnThis(),
    };

    mockHttpStatusCodeRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnThis(),
    };

    mockIpObservationRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnThis(),
    };

    mockDnsRecordRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnThis(),
    };

    mockDataSource = {
      createQueryBuilder: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(),
      getRawMany: jest.fn(),
      delete: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetsService,
        {
          provide: getRepositoryToken(Asset),
          useValue: mockAssetRepository,
        },
        {
          provide: getRepositoryToken(AssetService),
          useValue: mockAssetServiceRepository,
        },
        {
          provide: getRepositoryToken(Target),
          useValue: mockTargetRepository,
        },
        {
          provide: getRepositoryToken(TlsCertificate),
          useValue: mockTlsCertificateRepository,
        },
        {
          provide: getRepositoryToken(HttpResponseTechnology),
          useValue: mockHttpResponseTechnologyRepository,
        },
        {
          provide: getRepositoryToken(HttpStatusCode),
          useValue: mockHttpStatusCodeRepository,
        },
        {
          provide: getRepositoryToken(IpObservation),
          useValue: mockIpObservationRepository,
        },
        {
          provide: getRepositoryToken(DnsRecord),
          useValue: mockDnsRecordRepository,
        },
        {
          provide: getRepositoryToken(AgentLLMConfig),
          useValue: mockLlmConfigRepository,
        },
        {
          provide: getRepositoryToken(AgentConfig),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: TechnologyForwarderService,
          useValue: mockTechnologyForwarderService,
        },
        {
          provide: WorkspacesService,
          useValue: mockWorkspacesService,
        },
        {
          provide: GeoIpService,
          useValue: mockGeoIpService,
        },
        {
          provide: WorkspaceEncryptionService,
          useValue: mockWorkspaceEncryptionService,
        },
        {
          provide: StorageService,
          useValue: mockStorageService,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<AssetsService>(AssetsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getManyAsssetServices', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      (mockAssetServiceRepository as any).metadata = { columns: [] };
      (mockAssetServiceRepository as any).getManyAndCount = jest
        .fn()
        .mockResolvedValue([[], 0]);
      (mockAssetServiceRepository as any).orderBy = jest
        .fn()
        .mockReturnThis();
      (mockAssetServiceRepository as any).addOrderBy = jest
        .fn()
        .mockReturnThis();
      (mockAssetServiceRepository as any).skip = jest.fn().mockReturnThis();
      (mockAssetServiceRepository as any).take = jest.fn().mockReturnThis();
    });

    it('isNew keeps only the services the latest finished scan found', async () => {
      await service.getManyAsssetServices(
        { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'ASC', isNew: true } as any,
        'workspace-uuid',
      );

      // `?isNew=true` becomes the filter-tree condition, judged on the service.
      expect((mockAssetServiceRepository as any).andWhere).toHaveBeenCalledWith(
        expect.stringContaining(
          `(${freshRunSql('asset_service."jobHistoryId"', 'asset."targetId"')}) = ('true' = ANY(:lf0))`,
        ),
        { lf0: ['true'] },
      );
    });

    it('matches value with an escaped contains pattern', async () => {
      await service.getManyAsssetServices(
        { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'ASC', value: '100%_up' } as any,
        'workspace-uuid',
      );

      expect((mockAssetServiceRepository as any).andWhere).toHaveBeenCalledWith(
        'asset_service.value ILIKE :value',
        { value: '%100\\%\\_up%' },
      );
    });

    it('applies no freshness predicate without isNew', async () => {
      await service.getManyAsssetServices(
        { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'ASC' } as any,
        'workspace-uuid',
      );

      const predicates = ((mockAssetServiceRepository as any).andWhere as jest.Mock)
        .mock.calls.map(([sql]) => String(sql));
      expect(predicates.some((sql) => sql.includes('job_histories run'))).toBe(false);
    });

    it('adds asset_service.id as ORDER BY tiebreaker so offset pagination stays stable when createdAt values tie', async () => {
      await service.getManyAsssetServices(
        {
          page: 1,
          limit: 10,
          sortBy: 'createdAt',
          sortOrder: 'ASC',
        } as any,
        'workspace-uuid',
      );

      expect(
        (mockAssetServiceRepository as any).orderBy,
      ).toHaveBeenCalledWith('asset_service.createdAt', 'ASC');
      // Without a unique tiebreaker, rows with equal createdAt are ordered
      // arbitrarily by Postgres, so page 2 can repeat rows from page 1.
      expect(
        (mockAssetServiceRepository as any).addOrderBy,
      ).toHaveBeenCalledWith('asset_service.id', 'ASC');
    });

    it('loads facets with one batched query per facet, not per row', async () => {
      const rows = [1, 2, 3].map((i) => ({
        id: `svc-${i}`,
        value: `s${i}.example.com`,
        asset: { id: `asset-${i}`, targetId: 't' },
        httpResponses: [{ id: `hr-${i}` }],
      }));
      (mockAssetServiceRepository as any).getManyAndCount = jest
        .fn()
        .mockResolvedValue([rows, 3]);
      (mockIpObservationRepository.find as jest.Mock).mockResolvedValue([
        { assetId: 'asset-1', ip: '192.0.2.1' },
      ]);
      (mockHttpResponseTechnologyRepository.find as jest.Mock).mockResolvedValue([
        { httpResponseId: 'hr-1', name: 'Nginx', version: '1.25' },
        { httpResponseId: 'hr-2', name: 'Nginx', version: '1.25' },
      ]);
      (mockTlsCertificateRepository.find as jest.Mock).mockResolvedValue([]);
      (mockTechnologyForwarderService.enrichTechnologies as jest.Mock).mockResolvedValue([
        { name: 'Nginx', description: 'web server', iconUrl: 'i', categoryNames: [] },
      ]);

      const res = await service.getManyAsssetServices(
        { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'DESC' } as any,
        'workspace-uuid',
      );

      expect(mockIpObservationRepository.find).toHaveBeenCalledTimes(1);
      expect(mockHttpResponseTechnologyRepository.find).toHaveBeenCalledTimes(1);
      expect(mockTlsCertificateRepository.find).toHaveBeenCalledTimes(1);
      // Distinct tech strings are enriched once for the whole page.
      expect(mockTechnologyForwarderService.enrichTechnologies).toHaveBeenCalledTimes(1);
      expect(mockTechnologyForwarderService.enrichTechnologies).toHaveBeenCalledWith([
        'Nginx:1.25',
      ]);
      expect(res.data.map((row) => row.ipAddresses)).toEqual([
        ['192.0.2.1'],
        [],
        [],
      ]);
      expect(res.data[1].httpResponses?.techList?.[0]?.name).toBe('Nginx');
      expect(res.data[2].httpResponses?.tech).toEqual([]);
    });

    it('emits a signed absolute screenshot URL per item via signStoragePaths batch', async () => {
      const signedUrl =
        'https://s3.example/screenshot/abc123.png?X-Amz-Signature=abc';
      (mockAssetServiceRepository as any).getManyAndCount = jest
        .fn()
        .mockResolvedValue([
          [
            {
              id: 'svc-1',
              value: 'https',
              screenshotPath: 'screenshot/abc123.png',
              createdAt: new Date(),
              asset: { targetId: 'target-1', ipAssets: [] },
            },
            {
              id: 'svc-2',
              value: 'http',
              screenshotPath: '',
              createdAt: new Date(),
              asset: { targetId: 'target-1', ipAssets: [] },
            },
          ],
          2,
        ]);
      (mockStorageService.signStoragePaths as jest.Mock).mockResolvedValue([
        signedUrl,
      ]);

      const result = await service.getManyAsssetServices(        {
          page: 1,
          limit: 10,
          sortBy: 'createdAt',
          sortOrder: 'DESC',
        } as any,
        'workspace-uuid',
      );

      expect(mockStorageService.signStoragePaths).toHaveBeenCalledWith([
        { bucket: 'screenshot', path: 'screenshot/abc123.png' },
      ]);
      expect(mockStorageService.signStoragePaths).toHaveBeenCalledTimes(1);
      expect(result.data[0].screenshotPath).toBe(signedUrl);
      expect(result.data[0].screenshotPath).toContain('X-Amz-Signature');
      expect(result.data[1].screenshotPath).toBe('');
    });

    it('signs multiple screenshots in one batch call preserving order', async () => {      const first =
        'https://s3.example/screenshot/aaa.png?X-Amz-Signature=aaa';
      const second =
        'https://s3.example/screenshot/bbb.png?X-Amz-Signature=bbb';
      (mockAssetServiceRepository as any).getManyAndCount = jest
        .fn()
        .mockResolvedValue([
          [
            {
              id: 'svc-1',
              value: 'https',
              screenshotPath: 'screenshot/aaa.png',
              createdAt: new Date(),
              asset: { targetId: 'target-1', ipAssets: [] },
            },
            {
              id: 'svc-2',
              value: 'http',
              screenshotPath: 'screenshot/bbb.png',
              createdAt: new Date(),
              asset: { targetId: 'target-1', ipAssets: [] },
            },
          ],
          2,
        ]);
      (mockStorageService.signStoragePaths as jest.Mock).mockResolvedValue([
        first,
        second,
      ]);

      const result = await service.getManyAsssetServices(
        {
          page: 1,
          limit: 10,
          sortBy: 'createdAt',
          sortOrder: 'DESC',
        } as any,
        'workspace-uuid',
      );

      expect(mockStorageService.signStoragePaths).toHaveBeenCalledTimes(1);
      expect(mockStorageService.signStoragePaths).toHaveBeenCalledWith([
        { bucket: 'screenshot', path: 'screenshot/aaa.png' },
        { bucket: 'screenshot', path: 'screenshot/bbb.png' },
      ]);
      expect(result.data[0].screenshotPath).toBe(first);
      expect(result.data[1].screenshotPath).toBe(second);
    });

    it('yields null for a malformed stored path instead of failing the list (F-5)', async () => {
      (mockAssetServiceRepository as any).getManyAndCount = jest
        .fn()
        .mockResolvedValue([
          [
            {
              id: 'svc-1',
              value: 'https',
              screenshotPath: 'screenshot/aaa.png',
              createdAt: new Date(),
              asset: { targetId: 'target-1', ipAssets: [] },
            },
            {
              id: 'svc-2',
              value: 'http',
              screenshotPath: 'noslash-legacy',
              createdAt: new Date(),
              asset: { targetId: 'target-1', ipAssets: [] },
            },
          ],
          2,
        ]);
      (mockStorageService.signStoragePaths as jest.Mock).mockResolvedValue([
        'https://s3.example/screenshot/aaa.png?X-Amz-Signature=aaa',
        null,
      ]);

      const result = await service.getManyAsssetServices(
        {
          page: 1,
          limit: 10,
          sortBy: 'createdAt',
          sortOrder: 'DESC',
        } as any,
        'workspace-uuid',
      );

      expect(result.data[0].screenshotPath).toContain('X-Amz-Signature');
      expect(result.data[1].screenshotPath).toBeNull();
    });

    it('filters IPs on the DNS-sourced inet column so the index applies', async () => {
      await service.getManyAsssetServices(
        {
          page: 1,
          limit: 10,
          sortBy: 'createdAt',
          sortOrder: 'DESC',
          ipAddresses: ['192.0.2.1'],
        } as any,
        'workspace-uuid',
      );
      const clause = (mockAssetServiceRepository.andWhere as jest.Mock).mock.calls
        .map((call) => String(call[0]))
        .find((c) => c.includes('ip_observations'));
      expect(clause).toContain(`io.source IN ('dns_a', 'dns_aaaa')`);
      expect(clause).toContain('io."ip" = ANY(CAST(:lf0 AS inet[]))');
      expect(clause).not.toContain('host(');
    });

    it('matches services by urls via EXISTS on discovered_urls only', async () => {
      await service.getManyAsssetServices(
        {
          page: 1,
          limit: 10,
          sortBy: 'createdAt',
          sortOrder: 'DESC',
          urls: ['https://a.com/probe'],
        } as any,
        'workspace-uuid',
      );

      const andWhere = mockAssetServiceRepository.andWhere as jest.Mock;
      const urlsClause = andWhere.mock.calls
        .map((call) => String(call[0]))
        .find((clause) => clause.includes('EXISTS'));
      expect(urlsClause).toBeDefined();
      // The URL list is sourced from `discovered_urls` only; http_responses
      // entries are httpx probe targets, not discovered urls.
      expect(urlsClause).toContain('discovered_urls du');
      expect(urlsClause).toContain('du.url = ANY(:lf0)');
      expect(urlsClause).not.toContain('http_responses');
      expect(andWhere).toHaveBeenCalledWith(urlsClause, {
        lf0: ['https://a.com/probe'],
      });
      // The join-based filter is gone: no discoveredUrls join may remain.
      expect(
        (mockAssetServiceRepository as any).leftJoin,
      ).not.toHaveBeenCalledWith(
        'asset_service.discoveredUrls',
        'discoveredUrls',
      );
    });
  });

  describe('getAssetById', () => {
    const signedUrl =
      'https://s3.example/screenshot/abc123.png?X-Amz-Signature=abc';

    beforeEach(() => {
      jest.clearAllMocks();
      (mockAssetServiceRepository as any).andWhere = jest
        .fn()
        .mockReturnThis();
      (mockAssetServiceRepository as any).getOneOrFail = jest.fn();
      (mockDataSource as any).getRawMany = jest.fn().mockResolvedValue([]);
      (mockIpObservationRepository.find as jest.Mock).mockResolvedValue([]);
      (mockHttpResponseTechnologyRepository.find as jest.Mock).mockResolvedValue([]);
      (mockTlsCertificateRepository.find as jest.Mock).mockResolvedValue([]);
      (mockTechnologyForwarderService.enrichTechnologies as jest.Mock).mockResolvedValue([]);
    });

    it('emits a signed absolute screenshot URL via signStoragePaths batch', async () => {
      (mockAssetServiceRepository as any).getOneOrFail.mockResolvedValue({
        id: 'svc-1',
        value: 'https',
        port: 443,
        screenshotPath: 'screenshot/abc123.png',
        createdAt: new Date(),
        asset: { id: 'asset-1', targetId: 'target-1' },
        httpResponses: [],
      });
      (mockStorageService.signStoragePaths as jest.Mock).mockResolvedValue([
        signedUrl,
      ]);

      const result = await service.getAssetById('svc-1', 'workspace-uuid');

      expect(mockStorageService.signStoragePaths).toHaveBeenCalledWith([
        { bucket: 'screenshot', path: 'screenshot/abc123.png' },
      ]);
      expect(result.screenshotPath).toBe(signedUrl);
      expect(result.screenshotPath).toContain('X-Amz-Signature');
    });

    it('yields null with no helper call when screenshotPath is falsy', async () => {
      (mockAssetServiceRepository as any).getOneOrFail.mockResolvedValue({
        id: 'svc-1',
        value: 'https',
        port: 443,
        screenshotPath: null,
        createdAt: new Date(),
        asset: { id: 'asset-1', targetId: 'target-1' },
        httpResponses: [],
      });

      const result = await service.getAssetById('svc-1', 'workspace-uuid');

      expect(result.screenshotPath).toBeNull();
      expect(mockStorageService.signStoragePaths).not.toHaveBeenCalled();
    });
  });

  describe('getPortAssets', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      const repo = mockAssetServiceRepository as any;
      for (const fn of ['groupBy', 'addGroupBy', 'addSelect', 'orderBy', 'addOrderBy', 'limit', 'offset']) {
        repo[fn] = jest.fn().mockReturnThis();
      }
      repo.getQuery = jest.fn().mockReturnValue('SELECT 1');
      repo.getParameters = jest.fn().mockReturnValue({});
      (mockDataSource as any).setParameters = jest.fn().mockReturnThis();
      (mockDataSource as any).getRawOne = jest
        .fn()
        .mockResolvedValue({ count: '3' });
    });

    it('badges a port fully new, or counts its new services', async () => {
      (mockAssetServiceRepository as any).getRawMany = jest
        .fn()
        // The page…
        .mockResolvedValueOnce([
          { port: 8443, assetCount: '2' },
          { port: 443, assetCount: '5' },
          { port: 22, assetCount: '1' },
        ])
        // …then where the page's services came from.
        .mockResolvedValueOnce([
          { port: 8443, jobHistoryId: 'run-2', targetId: 't-1', count: '2' },
          { port: 443, jobHistoryId: 'run-2', targetId: 't-1', count: '2' },
          { port: 443, jobHistoryId: null, targetId: 't-1', count: '3' },
          { port: 22, jobHistoryId: 'run-1', targetId: 't-1', count: '1' },
        ]);
      (mockDataSource as any).query = jest
        .fn()
        .mockResolvedValue([{ jobHistoryId: 'run-2', targetId: 't-1' }]);

      const result = await service.getPortAssets(
        { page: 1, limit: 10, sortBy: 'assetCount', sortOrder: 'DESC' } as any,
        'workspace-uuid',
      );

      expect(
        result.data.map((row) => [row.port, row.isNew, row.newCount]),
      ).toEqual([
        [8443, true, 2],
        [443, false, 2],
        [22, false, 0],
      ]);
      expect((mockAssetServiceRepository as any).andWhere).toHaveBeenCalledWith(
        'asset_service.port IN (:...pagePorts)',
        { pagePorts: [8443, 443, 22] },
      );
    });
  });

  describe('aggregate tab sorting (port, status code, technology, ip)', () => {
    // Read lazily: the outer beforeEach creates these mocks.
    let repo: any;
    let ds: any;
    const query = (sortBy: string): GetAssetsQueryDto =>
      ({ page: 1, limit: 10, sortBy, sortOrder: 'ASC' }) as GetAssetsQueryDto;

    beforeEach(() => {
      jest.clearAllMocks();
      repo = mockAssetServiceRepository as any;
      ds = mockDataSource as any;
      for (const fn of [
        'select', 'addSelect', 'innerJoin', 'andWhere', 'groupBy', 'addGroupBy',
        'orderBy', 'addOrderBy', 'limit', 'offset',
      ]) {
        repo[fn] = jest.fn().mockReturnThis();
      }
      repo.getQuery = jest.fn().mockReturnValue('SELECT 1');
      repo.getParameters = jest.fn().mockReturnValue({});
      repo.getRawMany = jest.fn().mockResolvedValue([]);
      for (const fn of ['select', 'from', 'setParameters', 'orderBy', 'addOrderBy', 'limit', 'offset']) {
        ds[fn] = jest.fn().mockReturnThis();
      }
      ds.getRawOne = jest.fn().mockResolvedValue({ count: '0' });
      ds.getRawMany = jest.fn().mockResolvedValue([]);
    });

    it.each([
      ['getPortAssets', 'port', 'asset_service.port'],
      ['getStatusCodeAssets', 'statusCode', 'hsc."statusCode"'],
      ['getTechnologyAssets', 'technology', '"technology"'],
    ] as const)('%s sorts by its own column when sortBy=%s', async (method, sortBy, column) => {
      await service[method](query(sortBy), 'workspace-uuid');
      expect(repo.orderBy).toHaveBeenCalledWith(column, 'ASC');
    });

    it.each(['getPortAssets', 'getStatusCodeAssets', 'getTechnologyAssets'] as const)(
      '%s falls back to assetCount and adds a unique tiebreaker',
      async (method) => {
        await service[method](query('bogus'), 'workspace-uuid');
        expect(repo.orderBy).toHaveBeenCalledWith('"assetCount"', 'ASC');
        expect(repo.addOrderBy).toHaveBeenCalled();
      },
    );

    it('getIpAssets sorts addresses as inet, not text', async () => {
      await service.getIpAssets(query('ip'), 'workspace-uuid');
      expect(ds.orderBy).toHaveBeenCalledWith('t.ip::inet', 'ASC');
    });

    it('getIpAssets falls back to assetCount for unknown sortBy values', async () => {
      await service.getIpAssets(query('bogus'), 'workspace-uuid');
      expect(ds.orderBy).toHaveBeenCalledWith('t."assetCount"', 'ASC');
      expect(ds.addOrderBy).toHaveBeenCalledWith('t.ip::inet', 'ASC');
    });
  });

  describe('getHostAssets', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      (mockAssetServiceRepository as any).groupBy = jest
        .fn()
        .mockReturnThis();
      (mockAssetServiceRepository as any).orderBy = jest
        .fn()
        .mockReturnThis();
      (mockAssetServiceRepository as any).limit = jest.fn().mockReturnThis();
      (mockAssetServiceRepository as any).offset = jest.fn().mockReturnThis();
      (mockAssetServiceRepository as any).getQuery = jest
        .fn()
        .mockReturnValue('SELECT 1');
      (mockAssetServiceRepository as any).getParameters = jest
        .fn()
        .mockReturnValue({});
      (mockAssetServiceRepository as any).getRawMany = jest
        .fn()
        .mockResolvedValue([]);
      (mockDataSource as any).setParameters = jest.fn().mockReturnThis();
      (mockDataSource as any).getRawOne = jest
        .fn()
        .mockResolvedValue({ count: '0' });
    });

    it('isNew keeps hosts the latest finished scan found, not old hosts with a new port', async () => {
      await service.getHostAssets(
        { page: 1, limit: 10, sortBy: 'host', sortOrder: 'ASC', isNew: true } as any,
        'workspace-uuid',
      );

      const predicates = ((mockAssetServiceRepository as any).andWhere as jest.Mock)
        .mock.calls.map(([sql]) => String(sql));
      expect(
        predicates.some((sql) =>
          sql.includes(freshRunSql('asset."jobHistoryId"', 'asset."targetId"')),
        ),
      ).toBe(true);
      expect(predicates.some((sql) => sql.includes('asset_service."jobHistoryId"'))).toBe(false);
    });

    it('maps sortBy=createdAt to asset.createdAt so hosts sort by discovery time', async () => {
      await service.getHostAssets(
        {
          page: 1,
          limit: 10,
          sortBy: 'createdAt',
          sortOrder: 'DESC',
        } as any,
        'workspace-uuid',
      );

      expect(
        (mockAssetServiceRepository as any).orderBy,
      ).toHaveBeenCalledWith('asset.createdAt', 'DESC');
      expect((mockAssetServiceRepository as any).select).toHaveBeenCalledWith(
        expect.arrayContaining(['asset.createdAt']),
      );
    });

    it('falls back to assetCount ordering for unknown sortBy values', async () => {
      await service.getHostAssets(
        {
          page: 1,
          limit: 10,
          sortBy: 'bogus',
          sortOrder: 'ASC',
        } as any,
        'workspace-uuid',
      );

      expect(
        (mockAssetServiceRepository as any).orderBy,
      ).toHaveBeenCalledWith('"assetCount"', 'ASC');
    });

    it('maps createdAt from the raw row into the response DTO', async () => {
      (mockAssetServiceRepository as any).getRawMany.mockResolvedValue([
        {
          asset_id: 'asset-uuid',
          asset_value: 'api.x.com',
          asset_targetId: 'target-uuid',
          asset_isEnabled: true,
          asset_createdAt: '2026-08-01T00:00:00.000Z',
          assetCount: '4',
        },
      ]);

      const result = await service.getHostAssets(
        {
          page: 1,
          limit: 10,
          sortBy: 'assetCount',
          sortOrder: 'DESC',
        } as any,
        'workspace-uuid',
      );

      expect(result.data[0]).toMatchObject({
        host: 'api.x.com',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
      });
    });
  });

  describe('getUrlAssets', () => {
    /** SQL handed to `dataSource.createQueryBuilder().from(...)`. */
    const fromSql = (): string =>
      String(((mockDataSource as any).from as jest.Mock).mock.calls[0][0]);

    beforeEach(() => {
      jest.clearAllMocks();
      (mockAssetServiceRepository as any).select = jest
        .fn()
        .mockReturnThis();
      (mockAssetServiceRepository as any).where = jest.fn().mockReturnThis();
      (mockAssetServiceRepository as any).getQuery = jest
        .fn()
        .mockReturnValue(
          'SELECT asset_service.id FROM asset_services asset_service',
        );
      (mockAssetServiceRepository as any).getParameters = jest
        .fn()
        .mockReturnValue({ workspaceId: 'workspace-uuid' });
      (mockDataSource as any).addSelect = jest.fn().mockReturnThis();
      (mockDataSource as any).orderBy = jest.fn().mockReturnThis();
      (mockDataSource as any).addOrderBy = jest.fn().mockReturnThis();
      (mockDataSource as any).limit = jest.fn().mockReturnThis();
      (mockDataSource as any).offset = jest.fn().mockReturnThis();
      (mockDataSource as any).setParameters = jest.fn().mockReturnThis();
      (mockDataSource as any).distinct = jest.fn().mockReturnThis();
      (mockDataSource as any).innerJoin = jest.fn().mockReturnThis();
      (mockDataSource as any).query = jest.fn().mockResolvedValue([]);
      (mockDataSource as any).getRawOne = jest
        .fn()
        .mockResolvedValue({ count: '0' });
      (mockDataSource as any).getRawMany = jest.fn().mockResolvedValue([]);
    });

    it('marks a URL new when the latest finished URL discovery found it', async () => {
      (mockDataSource as any).getRawOne = jest
        .fn()
        .mockResolvedValue({ count: '2' });
      (mockDataSource as any).getRawMany = jest
        .fn()
        // The page…
        .mockResolvedValueOnce([
          { url: 'https://a.com/admin', assetCount: '1' },
          { url: 'https://a.com/old', assetCount: '1' },
        ])
        // …then where each of its URLs came from.
        .mockResolvedValueOnce([
          { url: 'https://a.com/admin', jobHistoryId: 'run-2', targetId: 't-1' },
          { url: 'https://a.com/old', jobHistoryId: 'run-1', targetId: 't-1' },
        ]);
      (mockDataSource as any).query = jest
        .fn()
        .mockResolvedValue([{ jobHistoryId: 'run-2', targetId: 't-1' }]);

      const result = await service.getUrlAssets(
        { page: 1, limit: 10, sortBy: 'url', sortOrder: 'ASC' } as any,
        'workspace-uuid',
      );

      expect(result.data.map((row) => [row.url, row.isNew])).toEqual([
        ['https://a.com/admin', true],
        ['https://a.com/old', false],
      ]);
      // The provenance lookup is bounded by the page, not the whole list.
      expect((mockDataSource as any).setParameters).toHaveBeenCalledWith(
        expect.objectContaining({
          pageUrls: ['https://a.com/admin', 'https://a.com/old'],
        }),
      );
    });

    it('isNew keeps URLs the latest URL discovery found, whatever their service age', async () => {
      await service.getUrlAssets(
        { page: 1, limit: 10, sortBy: 'url', sortOrder: 'ASC', isNew: true } as any,
        'workspace-uuid',
      );

      // The service scope is correlated with the URL row, and the condition
      // judges the URL's own run — not its service's.
      expect(fromSql()).toContain('EXISTS (');
      const predicates = ((mockAssetServiceRepository as any).andWhere as jest.Mock)
        .mock.calls.map(([s]) => String(s));
      expect(predicates).toContain('asset_service.id = du."assetServiceId"');
      expect(
        predicates.some((s) =>
          s.includes(freshRunSql('du."jobHistoryId"', 'asset."targetId"')),
        ),
      ).toBe(true);
      expect(predicates.some((s) => s.includes('asset_service."jobHistoryId"'))).toBe(false);
    });

    it('aggregates discovered_urls only, scoped to the filtered services', async () => {
      (mockDataSource as any).getRawMany = jest.fn().mockResolvedValue([
        { url: 'https://a.com/admin', assetCount: '3' },
        { url: 'https://a.com/login', assetCount: '1' },
      ]);
      (mockDataSource as any).getRawOne = jest
        .fn()
        .mockResolvedValue({ count: '2' });

      const result = await service.getUrlAssets(
        {
          page: 1,
          limit: 10,
          sortBy: 'assetCount',
          sortOrder: 'DESC',
        } as any,
        'workspace-uuid',
      );

      expect(result.total).toBe(2);
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toMatchObject({
        url: 'https://a.com/admin',
        assetCount: '3',
      });

      // The single url source is `discovered_urls`; http_responses rows are
      // httpx probe targets and must never widen the URL list.
      const sql = fromSql();
      expect(sql).toContain('discovered_urls');
      expect(sql).not.toContain('http_responses');
      expect(sql).not.toContain('UNION');
      expect(sql).toContain('COUNT(DISTINCT du."assetServiceId")');
      expect(sql).toContain('GROUP BY du.url');
      // Every base filter still applies through the filtered service scope.
      expect(sql).toContain(
        'SELECT asset_service.id FROM asset_services asset_service',
      );
      // The now-unused discoveredUrls join must be gone (it only caused row
      // multiplication for the paginated /api/assets query).
      expect(
        (mockAssetServiceRepository as any).leftJoin,
      ).not.toHaveBeenCalledWith(
        'asset_service.discoveredUrls',
        'discoveredUrls',
      );
    });

    it('returns total 0 when discovered_urls has no urls', async () => {
      const result = await service.getUrlAssets(
        {
          page: 1,
          limit: 10,
          sortBy: 'assetCount',
          sortOrder: 'DESC',
        } as any,
        'workspace-uuid',
      );

      expect(result.total).toBe(0);
      expect(result.data).toEqual([]);
    });

    it('applies the value filter case-insensitively on the discovered url', async () => {
      await service.getUrlAssets(
        {
          page: 1,
          limit: 10,
          sortBy: 'assetCount',
          sortOrder: 'DESC',
          value: 'admin',
        } as any,
        'workspace-uuid',
      );

      expect(fromSql()).toContain('du.url ILIKE :urlValue');
      const parameterCalls = (mockDataSource as any).setParameters.mock
        .calls as unknown[][];
      expect(
        parameterCalls.some(
          (call) =>
            (call[0] as Record<string, unknown>).urlValue === '%admin%',
        ),
      ).toBe(true);
    });

    it('falls back to assetCount ordering for unknown sortBy values', async () => {
      await service.getUrlAssets(
        {
          page: 1,
          limit: 10,
          sortBy: 'bogus',
          sortOrder: 'ASC',
        } as any,
        'workspace-uuid',
      );

      expect((mockDataSource as any).orderBy).toHaveBeenCalledWith(
        't."assetCount"',
        'ASC',
      );
    });

    it('sorts by the union url column when sortBy=url', async () => {
      await service.getUrlAssets(
        {
          page: 1,
          limit: 10,
          sortBy: 'url',
          sortOrder: 'ASC',
        } as any,
        'workspace-uuid',
      );

      expect((mockDataSource as any).orderBy).toHaveBeenCalledWith('t.url', 'ASC');
    });

    it('adds t.url as a unique ORDER BY tiebreaker when sorting by assetCount', async () => {
      await service.getUrlAssets(
        {
          page: 2,
          limit: 10,
          sortBy: 'assetCount',
          sortOrder: 'ASC',
        } as any,
        'workspace-uuid',
      );

      expect((mockDataSource as any).orderBy).toHaveBeenCalledWith(
        't."assetCount"',
        'ASC',
      );
      // Without a unique tiebreaker, rows with equal assetCount (nearly every
      // url has a count of 1) are ordered arbitrarily by Postgres, so page 2
      // can repeat rows from page 1 and skip others.
      expect((mockDataSource as any).addOrderBy).toHaveBeenCalledWith(
        't.url',
        'ASC',
      );
    });

    it('adds t.url as the tiebreaker when sorting by url', async () => {
      await service.getUrlAssets(
        {
          page: 1,
          limit: 10,
          sortBy: 'url',
          sortOrder: 'DESC',
        } as any,
        'workspace-uuid',
      );

      expect((mockDataSource as any).addOrderBy).toHaveBeenCalledWith(
        't.url',
        'DESC',
      );
    });

  });

  describe('getManyTls', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      (mockAssetServiceRepository as any).select = jest
        .fn()
        .mockReturnThis();
      (mockAssetServiceRepository as any).groupBy = jest
        .fn()
        .mockReturnThis();
      (mockAssetServiceRepository as any).addGroupBy = jest
        .fn()
        .mockReturnThis();
      (mockAssetServiceRepository as any).orderBy = jest
        .fn()
        .mockReturnThis();
      (mockAssetServiceRepository as any).limit = jest.fn().mockReturnThis();
      (mockAssetServiceRepository as any).offset = jest.fn().mockReturnThis();
      (mockAssetServiceRepository as any).getQuery = jest
        .fn()
        .mockReturnValue('SELECT 1');
      (mockAssetServiceRepository as any).getParameters = jest
        .fn()
        .mockReturnValue({});
      (mockAssetServiceRepository as any).getRawMany = jest
        .fn()
        .mockResolvedValue([]);
      (mockDataSource as any).from = jest.fn().mockReturnThis();
      (mockDataSource as any).orderBy = jest.fn().mockReturnThis();
      (mockDataSource as any).limit = jest.fn().mockReturnThis();
      (mockDataSource as any).offset = jest.fn().mockReturnThis();
      (mockDataSource as any).setParameters = jest.fn().mockReturnThis();
      (mockDataSource as any).getRawOne = jest
        .fn()
        .mockResolvedValue({ count: '0' });
      (mockDataSource as any).getRawMany = jest.fn().mockResolvedValue([]);
    });

    it('applies the date range to the certificate notAfter column, never to asset_service.createdAt', async () => {
      await service.getManyTls(
        {
          page: 1,
          limit: 10,
          sortBy: 'not_after',
          sortOrder: 'ASC',
          startDate: '2026-08-06',
          endDate: '2026-08-06',
        } as any,
        'workspace-uuid',
      );

      // The cert subquery filters the raw tls_certificates."notAfter" column
      // (DTO contract); the asset-service view is gone.
      const certSql = String(
        ((mockDataSource as any).from as jest.Mock).mock.calls[0][0],
      );
      expect(certSql).toContain('tc."notAfter" >= :tlsStartDate');
      expect(certSql).toContain('tc."notAfter" <= :tlsEndDate');
      expect(certSql).not.toContain('"tlsAssets"."not_after"::timestamp');
      // ...and must not leak onto when the asset service row was created.
      expect(certSql).not.toContain('asset_service."createdAt"');

      const setParamsCalls = (mockDataSource as any).setParameters.mock
        .calls as Array<[Record<string, unknown>]>;
      expect(
        setParamsCalls.some((call) => call[0].tlsStartDate === '2026-08-06'),
      ).toBe(true);
      expect(
        setParamsCalls.some(
          (call) => call[0].tlsEndDate === '2026-08-06 23:59:59.999',
        ),
      ).toBe(true);
    });
  });

  describe('hasPrimaryAsset', () => {
    it('looks for the primary asset of the target', async () => {
      mockAssetRepository.exists = jest.fn().mockResolvedValue(true);

      await expect(service.hasPrimaryAsset('target-uuid')).resolves.toBe(true);
      expect(mockAssetRepository.exists).toHaveBeenCalledWith({
        where: { target: { id: 'target-uuid' }, isPrimary: true },
      });
    });
  });

  describe('buildBaseQuery filter tree', () => {
    it('ANDs legacy params and the filter tree after the workspace scope', () => {
      const qb = mockAssetServiceRepository as unknown as {
        where: jest.Mock;
        andWhere: jest.Mock;
      };
      qb.where.mockClear();
      qb.andWhere.mockClear();
      (
        service as unknown as {
          buildBaseQuery: (q: unknown, ws: string) => unknown;
        }
      ).buildBaseQuery(
        {
          hosts: ['a.com'],
          filter: {
            logic: 'or',
            items: [
              { field: 'port', op: 'eq', value: '80' },
              { field: 'tag', op: 'eq', value: 'prod' },
            ],
          },
        },
        'ws-1',
      );
      expect(qb.where).toHaveBeenCalledWith(
        'targets.workspaceId = :workspaceId',
        { workspaceId: 'ws-1' },
      );
      expect(qb.andWhere).toHaveBeenCalledWith('((asset.value = ANY(:lf0)))', {
        lf0: ['a.com'],
      });
      const [orSql, orParams] = qb.andWhere.mock.calls.at(-1) as [
        string,
        Record<string, unknown>,
      ];
      expect(orSql).toMatch(/^\(.* OR .*\)$/); // whole OR wrapped, so it cannot escape the workspace AND
      expect(orParams).toEqual({ af0: ['80'], af1: ['prod'] });
    });
  });
});
