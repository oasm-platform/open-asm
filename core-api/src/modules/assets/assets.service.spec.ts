import { EventEmitter2 } from '@nestjs/event-emitter';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { DataSource } from 'typeorm';
import { GeoIpService } from '@/services/geo-ip/geo-ip.service';
import { WorkspaceEncryptionService } from '@/services/workspace-encryption/workspace-encryption.service';
import { Target } from '../targets/entities/target.entity';
import { TechnologyForwarderService } from '../technology/technology-forwarder.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { AssetsService } from './assets.service';
import { AssetService } from './entities/asset-services.entity';
import { Asset } from './entities/assets.entity';
import { TlsAssetsView } from './entities/tls-assets.entity';
import { AgentLLMConfig } from '../agents/entities/agent-llm-config.entity';

describe('AssetsService', () => {
  let service: AssetsService;
  let mockAssetRepository: Partial<Repository<Asset>>;
  let mockAssetServiceRepository: Partial<Repository<AssetService>>;
  let mockTargetRepository: Partial<Repository<Target>>;
  let mockEventEmitter: Partial<EventEmitter2>;
  let mockTechnologyForwarderService: Partial<TechnologyForwarderService>;
  let mockWorkspacesService: Partial<WorkspacesService>;
  let mockGeoIpService: Partial<GeoIpService>;
  let mockLlmConfigRepository: Partial<Repository<AgentLLMConfig>>;
  let mockWorkspaceEncryptionService: Partial<WorkspaceEncryptionService>;
  let mockDataSource: Partial<DataSource>;

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

    mockEventEmitter = {
      emit: jest.fn(),
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

    mockLlmConfigRepository = {
      findOne: jest.fn(),
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
          provide: getRepositoryToken(TlsAssetsView),
          useValue: {},
        },
        {
          provide: getRepositoryToken(AgentLLMConfig),
          useValue: mockLlmConfigRepository,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
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
  });
  describe('getManyTls', () => {
    beforeEach(() => {
      jest.clearAllMocks();
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
      (mockDataSource as any).setParameters = jest.fn().mockReturnThis();
      (mockDataSource as any).getRawOne = jest
        .fn()
        .mockResolvedValue({ count: '0' });
    });

    it('applies the date range to tls not_after only, never to asset_service.createdAt', async () => {
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

      const andWhere = mockAssetServiceRepository.andWhere as jest.Mock;
      // Range filters land on the cert expiry column (DTO contract).
      expect(andWhere).toHaveBeenCalledWith(
        '"tlsAssets"."not_after"::timestamp >= :startDate',
        { startDate: '2026-08-06' },
      );
      expect(andWhere).toHaveBeenCalledWith(
        '"tlsAssets"."not_after"::timestamp <= :endDate',
        { endDate: '2026-08-06 23:59:59.999' },
      );
      // ...and must not leak onto when the asset service row was created.
      for (const call of andWhere.mock.calls) {
        expect(String(call[0])).not.toContain('asset_service."createdAt"');
      }
    });
  });

  describe('reScan', () => {
    const targetId = 'target-uuid';

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should not throw BadRequestException when isAssetsDiscovery is false (gate removed)', async () => {
      const mockAsset = { id: 'asset-uuid', isPrimary: true };
      const mockTarget = {
        id: targetId,
        reScanCount: 0,
        type: 'domain',
        value: 'example.com',
      };

      mockAssetRepository.findOne = jest.fn().mockResolvedValue(mockAsset);
      mockTargetRepository.findOne = jest.fn().mockResolvedValue(mockTarget);
      mockTargetRepository.update = jest.fn().mockResolvedValue({});
      mockWorkspacesService.getWorkspaceIdByTargetId = jest
        .fn()
        .mockResolvedValue('workspace-uuid');
      mockEventEmitter.emit = jest.fn();

      const result = await service.reScan(targetId);

      // Should succeed (not throw), even though isAssetsDiscovery would be falsy if checked
      expect(result).toEqual({ message: 'Scan started' });
      expect(mockTargetRepository.update).toHaveBeenCalledWith(targetId, {
        reScanCount: 1,
        lastDiscoveredAt: expect.any(Date),
      });
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'target.domain.re-scan',
        mockTarget,
      );
    });
  });
});
