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
import { AssetQueryService } from './asset-query.service';
import { AssetsService } from './assets.service';
import { AssetService } from './entities/asset-services.entity';
import { Asset } from './entities/assets.entity';
import { DnsRecord } from './entities/dns-record.entity';
import { HttpResponseTechnology } from './entities/http-response-technology.entity';
import { HttpStatusCode } from './entities/http-status-code.entity';
import { IpObservation } from './entities/ip-observation.entity';
import { TlsCertificate } from './entities/tls-certificate.entity';
import { AgentConfig } from '../agents/entities/agent-config.entity';
import { AgentLLMConfig } from '../agents/entities/agent-llm-config.entity';

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
        // Real: buildBaseQuery scopes the TLS and export queries
        AssetQueryService,
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

});
