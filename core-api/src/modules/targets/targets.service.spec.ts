import type { UserContextPayload } from '@/common/interfaces/app.interface';
import { AuditOutcome, IntegrationType } from '@/common/enums/enum';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import type { EntityManager, Repository } from 'typeorm';
import { AssetsService } from '../assets/assets.service';
import type { Asset } from '../assets/entities/assets.entity';
import type { AuditContext } from '../audit/audit.service';
import { AuditService } from '../audit/audit.service';
import { Integration } from '../integrations/entities/integration.entity';
import { WorkspacesService } from '../workspaces/workspaces.service';
import {
  Target,
  TargetSource,
  TargetType,
} from './entities/target.entity';
import { TargetsService } from './targets.service';

describe('TargetsService', () => {
  let service: TargetsService;
  let mockTargetRepository: Partial<Repository<Target>>;
  let mockWorkspacesService: Partial<WorkspacesService>;
  let mockAssetsService: Partial<AssetsService>;
  let mockEventEmitter: Partial<EventEmitter2>;
  let mockQueue: Partial<Queue>;
  let mockAuditService: { auditSafely: jest.Mock };
  let mockIntegrationRepository: { find: jest.Mock };

  beforeEach(async () => {
    mockTargetRepository = {
      findOneBy: jest.fn(),
      upsert: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(),
      getRawMany: jest.fn(),
      getCount: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findOne: jest.fn(),
      findByIds: jest.fn(),
      query: jest.fn().mockResolvedValue([]),
      manager: {
        transaction: jest.fn(),
        getRepository: jest.fn(),
      } as unknown as EntityManager,
    } as any;

    mockWorkspacesService = {
      getWorkspaceByIdAndOwner: jest.fn(),
      getWorkspaceConfigValue: jest.fn(),
    };

    mockAssetsService = {
      createPrimaryAsset: jest.fn(),
    };

    mockEventEmitter = {
      emit: jest.fn(),
    };

    mockQueue = {
      add: jest.fn(),
      removeJobScheduler: jest.fn(),
    } as any;

    mockAuditService = {
      auditSafely: jest.fn().mockResolvedValue(undefined),
    };

    mockIntegrationRepository = { find: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TargetsService,
        {
          provide: getRepositoryToken(Target),
          useValue: mockTargetRepository,
        },
        {
          provide: getRepositoryToken(Integration),
          useValue: mockIntegrationRepository,
        },
        {
          provide: WorkspacesService,
          useValue: mockWorkspacesService,
        },
        {
          provide: AssetsService,
          useValue: mockAssetsService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
        {
          provide: 'BullQueue_assets-discovery-schedule', // Queue name for BullMQ
          useValue: mockQueue,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
      ],
    }).compile();

    service = module.get<TargetsService>(TargetsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createMultipleTargets', () => {
    const workspaceId = randomUUID();
    const userContext = {
      userId: randomUUID(),
      email: 'test@example.com',
      expiresAt: new Date(),
      token: 'token',
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'Test User',
      image: null,
      role: 'USER',
      lastLoginAt: new Date(),
      isActive: true,
      version: 1,
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
      id: randomUUID(),
      emailVerified: new Date(),
    } as unknown as UserContextPayload;

    // Helper to create mock EntityManager
    const createMockEntityManager = (options: {
      existingTargets?: string[];
      insertResult?: { identifiers: Array<{ id: string }> };
      createdTargets?: Target[];
    }) => {
      const {
        existingTargets = [],
        insertResult,
        createdTargets = [],
      } = options;

      // Mock query builder for duplicate check on Target
      const duplicateCheckQB = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(
          existingTargets.map((value) => ({ value, internalNetworkId: null })),
        ),
      };

      const mockTargetRepo: Record<string, jest.Mock> = {
        createQueryBuilder: jest.fn(() => duplicateCheckQB),
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(
          insertResult || {
            identifiers: createdTargets.map((t) => ({ id: t.id })),
          },
        ),
        findByIds: jest.fn().mockResolvedValue(createdTargets),
      };

      const mockAssetRepo = {
        createQueryBuilder: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orIgnore: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      };

      // Create a mock query builder for direct EntityManager usage
      const mockQueryBuilder = {
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orIgnore: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({
          identifiers: createdTargets.map((t) => ({ id: t.id })),
        }),
      };

      return {
        getRepository: jest.fn((entity: { name: string }) => {
          if (entity.name === 'Target')
            return mockTargetRepo as unknown as Repository<Target>;
          if (entity.name === 'Asset')
            return mockAssetRepo as unknown as Repository<Asset>;
          return {} as Repository<never>;
        }),
        createQueryBuilder: jest.fn(() => mockQueryBuilder),
      } as unknown as EntityManager;
    };

    beforeEach(() => {
      mockWorkspacesService.getWorkspaceByIdAndOwner = jest
        .fn()
        .mockResolvedValue({ id: workspaceId });
      mockEventEmitter.emit = jest.fn();
      // Mock updateTarget to avoid BullMQ issues
      jest
        .spyOn(service, 'updateTarget')
        .mockResolvedValue({ affected: 1 } as any);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should create multiple targets successfully', async () => {
      // Arrange
      const targetValues = ['target1.com', 'target2.com', 'target3.com'];
      const dto = { targets: targetValues.map((value) => ({ value })) };
      const createdTargets = targetValues.map((value) => ({
        id: randomUUID(),
        value,
        type: TargetType.DOMAIN,
        scanSchedule: 'DISABLED',
      })) as unknown as Target[];

      const mockManager = createMockEntityManager({
        existingTargets: [],
        createdTargets,
      });

      (mockTargetRepository.manager as EntityManager).transaction = jest
        .fn()
        .mockImplementation(
          (callback: (manager: EntityManager) => Promise<unknown>) =>
            callback(mockManager),
        );

      // Act
      const result = await service.createMultipleTargets(
        dto,
        workspaceId,
        userContext,
      );

      // Assert
      expect(result.created).toHaveLength(3);
      expect(result.totalCreated).toBe(3);
      expect(result.totalSkipped).toBe(0);
      expect(result.skipped).toEqual([]);
      expect(result.totalRequested).toBe(3);
      expect(
        mockWorkspacesService.getWorkspaceByIdAndOwner,
      ).toHaveBeenCalledWith(workspaceId, userContext);
      expect(mockEventEmitter.emit).toHaveBeenCalledTimes(3);
    });

    it('should default source to MANUAL on inserted rows when no source param is passed', async () => {
      // Arrange
      const dto = { targets: [{ value: 'manual-source.com' }] };
      const createdTargets = [
        {
          id: randomUUID(),
          value: 'manual-source.com',
          type: TargetType.DOMAIN,
          scanSchedule: 'DISABLED',
        },
      ] as unknown as Target[];

      const mockManager = createMockEntityManager({
        existingTargets: [],
        createdTargets,
      });

      (mockTargetRepository.manager as EntityManager).transaction = jest
        .fn()
        .mockImplementation(
          (callback: (manager: EntityManager) => Promise<unknown>) =>
            callback(mockManager),
        );

      // Act
      await service.createMultipleTargets(dto, workspaceId, userContext);

      // Assert: inserted target rows carry source MANUAL
      const insertedRows = (mockManager as any).createQueryBuilder().values.mock
        .calls[0][0] as Array<Record<string, unknown>>;
      expect(insertedRows).toHaveLength(1);
      expect(insertedRows[0]).toMatchObject({
        value: 'manual-source.com',
        source: 'MANUAL',
      });
    });

    it('should set source on inserted rows when passed as 5th arg', async () => {
      // Arrange
      const dto = { targets: [{ value: 'cloudflare-source.com' }] };
      const createdTargets = [
        {
          id: randomUUID(),
          value: 'cloudflare-source.com',
          type: TargetType.DOMAIN,
          scanSchedule: 'DISABLED',
        },
      ] as unknown as Target[];

      const mockManager = createMockEntityManager({
        existingTargets: [],
        createdTargets,
      });

      (mockTargetRepository.manager as EntityManager).transaction = jest
        .fn()
        .mockImplementation(
          (callback: (manager: EntityManager) => Promise<unknown>) =>
            callback(mockManager),
        );

      // Act — explicit source passed as 5th param (internalNetworkId omitted)
      await service.createMultipleTargets(
        dto,
        workspaceId,
        userContext,
        undefined,
        TargetSource.CLOUDFLARE,
      );

      // Assert: inserted target rows carry the raw enum value 'cloudflare'
      const insertedRows = (mockManager as any).createQueryBuilder().values.mock
        .calls[0][0] as Array<Record<string, unknown>>;
      expect(insertedRows).toHaveLength(1);
      expect(insertedRows[0]).toMatchObject({
        value: 'cloudflare-source.com',
        source: 'cloudflare',
      });
    });

    it('should throw BadRequestException when duplicate targets exist', async () => {
      // Arrange
      const targetValues = [
        'existing.com',
        'new1.com',
        'existing2.com',
        'new2.com',
      ];
      const dto = { targets: targetValues.map((value) => ({ value })) };

      const mockManager = createMockEntityManager({
        existingTargets: ['existing.com', 'existing2.com'],
        createdTargets: [],
      });

      (mockTargetRepository.manager as EntityManager).transaction = jest
        .fn()
        .mockImplementation(
          (callback: (manager: EntityManager) => Promise<unknown>) =>
            callback(mockManager),
        );

      // Act & Assert
      await expect(
        service.createMultipleTargets(dto, workspaceId, userContext),
      ).rejects.toThrow('Target already exists: existing.com, existing2.com');
    });

    it('should throw BadRequestException when all targets are duplicates', async () => {
      // Arrange
      const targetValues = ['dup1.com', 'dup2.com'];
      const dto = { targets: targetValues.map((value) => ({ value })) };

      const mockManager = createMockEntityManager({
        existingTargets: ['dup1.com', 'dup2.com'],
        createdTargets: [],
      });

      (mockTargetRepository.manager as EntityManager).transaction = jest
        .fn()
        .mockImplementation(
          (callback: (manager: EntityManager) => Promise<unknown>) =>
            callback(mockManager),
        );

      // Act & Assert
      await expect(
        service.createMultipleTargets(dto, workspaceId, userContext),
      ).rejects.toThrow('Target already exists: dup1.com, dup2.com');
    });

    it('should handle empty targets array', async () => {
      // Arrange
      const dto = { targets: [] };

      const mockManager = createMockEntityManager({
        existingTargets: [],
        createdTargets: [],
      });

      (mockTargetRepository.manager as EntityManager).transaction = jest
        .fn()
        .mockImplementation(
          (callback: (manager: EntityManager) => Promise<unknown>) =>
            callback(mockManager),
        );

      // Act
      const result = await service.createMultipleTargets(
        dto,
        workspaceId,
        userContext,
      );

      // Assert
      expect(result.created).toHaveLength(0);
      expect(result.totalCreated).toBe(0);
      expect(result.totalSkipped).toBe(0);
      expect(result.totalRequested).toBe(0);
    });

    it('should emit events for each created target', async () => {
      // Arrange
      const targetValues = ['event1.com', 'event2.com'];
      const dto = { targets: targetValues.map((value) => ({ value })) };
      const createdTargets = targetValues.map((value) => ({
        id: randomUUID(),
        value,
        type: TargetType.DOMAIN,
        scanSchedule: 'DISABLED',
      })) as unknown as Target[];

      const mockManager = createMockEntityManager({
        existingTargets: [],
        createdTargets,
      });

      (mockTargetRepository.manager as EntityManager).transaction = jest
        .fn()
        .mockImplementation(
          (callback: (manager: EntityManager) => Promise<unknown>) =>
            callback(mockManager),
        );

      // Act
      await service.createMultipleTargets(dto, workspaceId, userContext);

      // Assert
      expect(mockEventEmitter.emit).toHaveBeenCalledTimes(2);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'target.domain.create',
        expect.any(Object),
      );
    });

    it('should throw BadRequestException for IP address as domain', async () => {
      // Arrange
      const dto = {
        targets: [{ value: '192.168.1.1', type: TargetType.DOMAIN }],
      };

      // Act & Assert
      await expect(
        service.createMultipleTargets(dto, workspaceId, userContext),
      ).rejects.toThrow(
        'Invalid domain: "192.168.1.1" is an IP address. Use type IP for single IP addresses or CIDR for IP ranges.',
      );
    });

    it('should throw BadRequestException for invalid domain format', async () => {
      // Arrange
      const dto = {
        targets: [{ value: 'invalid-domain', type: TargetType.DOMAIN }],
      };

      // Act & Assert
      await expect(
        service.createMultipleTargets(dto, workspaceId, userContext),
      ).rejects.toThrow(
        'Invalid domain: "invalid-domain" is not a valid root domain.',
      );
    });

    it('should throw BadRequestException for CIDR with invalid prefix', async () => {
      // Arrange
      const dto = {
        targets: [{ value: '192.168.1.0/16', type: TargetType.CIDR }],
      };

      // Act & Assert
      await expect(
        service.createMultipleTargets(dto, workspaceId, userContext),
      ).rejects.toThrow(
        'Invalid CIDR: "192.168.1.0/16" must use /24 prefix. Only /24 CIDR ranges are supported.',
      );
    });

    it('should throw BadRequestException for invalid CIDR format', async () => {
      // Arrange
      const dto = {
        targets: [{ value: '192.168.1.0/24/32', type: TargetType.CIDR }],
      };

      // Act & Assert
      await expect(
        service.createMultipleTargets(dto, workspaceId, userContext),
      ).rejects.toThrow(
        'Invalid CIDR: "192.168.1.0/24/32" is not a valid CIDR notation. Expected format: x.x.x.x/y',
      );
    });

    it('should throw BadRequestException for CIDR with invalid octet', async () => {
      // Arrange
      const dto = {
        targets: [{ value: '256.168.1.0/24', type: TargetType.CIDR }],
      };

      // Act & Assert
      await expect(
        service.createMultipleTargets(dto, workspaceId, userContext),
      ).rejects.toThrow(
        'Invalid CIDR: "256.168.1.0/24" contains invalid IP octet. Each octet must be 0-255.',
      );
    });

    it('should throw BadRequestException for localhost CIDR (127.0.0.0/24)', async () => {
      // Arrange
      const dto = {
        targets: [{ value: '127.0.0.0/24', type: TargetType.CIDR }],
      };

      // Act & Assert
      await expect(
        service.createMultipleTargets(dto, workspaceId, userContext),
      ).rejects.toThrow(
        'Invalid CIDR: "127.0.0.0/24" is a private/reserved IP range. Only public IP ranges are allowed.',
      );
    });

    it('should throw BadRequestException for private IP CIDR (10.0.0.0/24)', async () => {
      // Arrange
      const dto = {
        targets: [{ value: '10.0.0.0/24', type: TargetType.CIDR }],
      };

      // Act & Assert
      await expect(
        service.createMultipleTargets(dto, workspaceId, userContext),
      ).rejects.toThrow(
        'Invalid CIDR: "10.0.0.0/24" is a private/reserved IP range. Only public IP ranges are allowed.',
      );
    });

    it('should throw BadRequestException for private IP CIDR (172.16.0.0/24)', async () => {
      // Arrange
      const dto = {
        targets: [{ value: '172.16.0.0/24', type: TargetType.CIDR }],
      };

      // Act & Assert
      await expect(
        service.createMultipleTargets(dto, workspaceId, userContext),
      ).rejects.toThrow(
        'Invalid CIDR: "172.16.0.0/24" is a private/reserved IP range. Only public IP ranges are allowed.',
      );
    });

    it('should throw BadRequestException for private IP CIDR (192.168.0.0/24)', async () => {
      // Arrange
      const dto = {
        targets: [{ value: '192.168.0.0/24', type: TargetType.CIDR }],
      };

      // Act & Assert
      await expect(
        service.createMultipleTargets(dto, workspaceId, userContext),
      ).rejects.toThrow(
        'Invalid CIDR: "192.168.0.0/24" is a private/reserved IP range. Only public IP ranges are allowed.',
      );
    });

    it('should throw BadRequestException for link-local CIDR (169.254.0.0/24)', async () => {
      // Arrange
      const dto = {
        targets: [{ value: '169.254.0.0/24', type: TargetType.CIDR }],
      };

      // Act & Assert
      await expect(
        service.createMultipleTargets(dto, workspaceId, userContext),
      ).rejects.toThrow(
        'Invalid CIDR: "169.254.0.0/24" is a private/reserved IP range. Only public IP ranges are allowed.',
      );
    });

    it('should throw BadRequestException for multicast CIDR (224.0.0.0/24)', async () => {
      // Arrange
      const dto = {
        targets: [{ value: '224.0.0.0/24', type: TargetType.CIDR }],
      };

      // Act & Assert
      await expect(
        service.createMultipleTargets(dto, workspaceId, userContext),
      ).rejects.toThrow(
        'Invalid CIDR: "224.0.0.0/24" is a private/reserved IP range. Only public IP ranges are allowed.',
      );
    });

    it('should throw BadRequestException for reserved CIDR (240.0.0.0/24)', async () => {
      // Arrange
      const dto = {
        targets: [{ value: '240.0.0.0/24', type: TargetType.CIDR }],
      };

      // Act & Assert
      await expect(
        service.createMultipleTargets(dto, workspaceId, userContext),
      ).rejects.toThrow(
        'Invalid CIDR: "240.0.0.0/24" is a private/reserved IP range. Only public IP ranges are allowed.',
      );
    });

    it('should validate all targets before processing', async () => {
      // Arrange
      const dto = {
        targets: [
          { value: 'valid.com', type: TargetType.DOMAIN },
          { value: '8.8.8.0/24', type: TargetType.CIDR },
          { value: '192.168.1.1', type: TargetType.DOMAIN }, // Invalid - IP as domain
        ],
      };

      // Act & Assert
      await expect(
        service.createMultipleTargets(dto, workspaceId, userContext),
      ).rejects.toThrow(
        'Invalid domain: "192.168.1.1" is an IP address. Use type IP for single IP addresses or CIDR for IP ranges.',
      );
    });

    it('should create valid domain and CIDR targets', async () => {
      // Arrange
      const dto = {
        targets: [
          { value: 'example.com', type: TargetType.DOMAIN },
          { value: '8.8.8.0/24', type: TargetType.CIDR }, // Google DNS - public IP
        ],
      };
      const createdTargets = [
        {
          id: randomUUID(),
          value: 'example.com',
          type: TargetType.DOMAIN,
          scanSchedule: 'DISABLED',
        },
        {
          id: randomUUID(),
          value: '8.8.8.0/24',
          type: TargetType.CIDR,
          scanSchedule: 'DISABLED',
        },
      ] as unknown as Target[];

      const mockManager = createMockEntityManager({
        existingTargets: [],
        createdTargets,
      });

      (mockTargetRepository.manager as EntityManager).transaction = jest
        .fn()
        .mockImplementation(
          (callback: (manager: EntityManager) => Promise<unknown>) =>
            callback(mockManager),
        );

      // Act
      const result = await service.createMultipleTargets(
        dto,
        workspaceId,
        userContext,
      );

      // Assert
      expect(result.created).toHaveLength(2);
      expect(result.totalCreated).toBe(2);
      expect(result.totalSkipped).toBe(0);
      expect(mockEventEmitter.emit).toHaveBeenCalledTimes(2);
    });

    it('should create 256 assets for CIDR target', async () => {
      // Arrange
      const dto = {
        targets: [{ value: '8.8.8.0/24', type: TargetType.CIDR }],
      };
      const createdTargets = [
        {
          id: randomUUID(),
          value: '8.8.8.0/24',
          type: TargetType.CIDR,
          scanSchedule: 'DISABLED',
        },
      ] as unknown as Target[];

      const mockManager = createMockEntityManager({
        existingTargets: [],
        createdTargets,
      });

      (mockTargetRepository.manager as EntityManager).transaction = jest
        .fn()
        .mockImplementation(
          (callback: (manager: EntityManager) => Promise<unknown>) =>
            callback(mockManager),
        );

      // Act
      const result = await service.createMultipleTargets(
        dto,
        workspaceId,
        userContext,
      );

      // Assert
      expect(result.created).toHaveLength(1);
      expect(result.totalCreated).toBe(1);
    });

    it('should expand CIDR to 256 IPs correctly', () => {
      // Arrange
      const cidr = '8.8.8.0/24';

      // Act
      const ips = (service as any).expandCIDRToIPs(cidr);

      // Assert
      expect(ips).toHaveLength(256);
      expect(ips[0]).toBe('8.8.8.0');
      expect(ips[1]).toBe('8.8.8.1');
      expect(ips[255]).toBe('8.8.8.255');
    });

    it('should accept a private non-/24 CIDR from AWS source and create 2^16 assets', async () => {
      // Arrange
      const dto = {
        targets: [{ value: '10.0.0.0/16', type: TargetType.CIDR }],
      };
      const createdTargets = [
        {
          id: randomUUID(),
          value: '10.0.0.0/16',
          type: TargetType.CIDR,
          scanSchedule: 'DISABLED',
        },
      ] as unknown as Target[];

      const mockManager = createMockEntityManager({
        existingTargets: [],
        createdTargets,
      });

      (mockTargetRepository.manager as EntityManager).transaction = jest
        .fn()
        .mockImplementation(
          (callback: (manager: EntityManager) => Promise<unknown>) =>
            callback(mockManager),
        );

      // Act
      const result = await service.createMultipleTargets(
        dto,
        workspaceId,
        userContext,
        undefined,
        TargetSource.AWS,
      );

      // Assert: target created with source 'aws'
      expect(result.created).toHaveLength(1);
      const targetRows = (mockManager as any).createQueryBuilder().values.mock
        .calls[0][0] as Array<Record<string, unknown>>;
      expect(targetRows[0]).toMatchObject({
        value: '10.0.0.0/16',
        type: TargetType.CIDR,
        source: 'aws',
      });

      // Assert: 65536 assets flushed in chunks (first value() call is the target insert)
      const assetValueCalls = (
        mockManager as any
      ).createQueryBuilder().values.mock.calls
        .slice(1)
        .map((call: unknown[]) => call[0] as Array<Record<string, unknown>>);
      const assetRows = assetValueCalls.flat();
      expect(assetRows).toHaveLength(65536);
      expect(assetValueCalls.length).toBe(66); // ceil(65536 / 1000)
      expect(assetRows[0]).toMatchObject({
        value: '10.0.0.0',
        isPrimary: true,
      });
      expect(assetRows[1]).toMatchObject({
        value: '10.0.0.1',
        isPrimary: false,
      });
    });

    it('should still reject a private non-/24 CIDR when the source is NOT AWS', async () => {
      // Arrange
      const dto = {
        targets: [{ value: '10.0.0.0/16', type: TargetType.CIDR }],
      };

      // Act & Assert
      await expect(
        service.createMultipleTargets(dto, workspaceId, userContext),
      ).rejects.toThrow(
        'Invalid CIDR: "10.0.0.0/16" must use /24 prefix. Only /24 CIDR ranges are supported.',
      );
    });

    it('should reject an AWS CIDR with a prefix outside 1..32', async () => {
      // Arrange
      const dto = {
        targets: [{ value: '10.0.0.0/33', type: TargetType.CIDR }],
      };

      // Act & Assert
      await expect(
        service.createMultipleTargets(
          dto,
          workspaceId,
          userContext,
          undefined,
          TargetSource.AWS,
        ),
      ).rejects.toThrow(
        'Invalid CIDR: "10.0.0.0/33" contains an invalid prefix. Prefix must be 1-32.',
      );
    });

    it('should expand any CIDR prefix, not just /24', () => {
      const slash24 = (service as any).expandCIDRToIPs('8.8.8.0/24');
      expect(slash24).toHaveLength(256);
      expect(slash24[0]).toBe('8.8.8.0');
      expect(slash24[255]).toBe('8.8.8.255');

      const slash30 = (service as any).expandCIDRToIPs('10.0.0.0/30');
      expect(slash30).toEqual([
        '10.0.0.0',
        '10.0.0.1',
        '10.0.0.2',
        '10.0.0.3',
      ]);

      expect((service as any).expandCIDRToIPs('10.0.0.0/16')).toHaveLength(
        65536,
      );
    });

    it('should default to DOMAIN type when type is not specified', async () => {
      // Arrange
      const dto = { targets: [{ value: 'example.com' }] };
      const createdTargets = [
        {
          id: randomUUID(),
          value: 'example.com',
          type: TargetType.DOMAIN,
          scanSchedule: 'DISABLED',
        },
      ] as unknown as Target[];

      const mockManager = createMockEntityManager({
        existingTargets: [],
        createdTargets,
      });

      (mockTargetRepository.manager as EntityManager).transaction = jest
        .fn()
        .mockImplementation(
          (callback: (manager: EntityManager) => Promise<unknown>) =>
            callback(mockManager),
        );

      // Act
      const result = await service.createMultipleTargets(
        dto,
        workspaceId,
        userContext,
      );

      // Assert
      expect(result.created).toHaveLength(1);
      expect(result.totalCreated).toBe(1);
    });

    it('should create valid IP target', async () => {
      // Arrange
      const dto = {
        targets: [{ value: '8.8.8.8', type: TargetType.IP }],
      };
      const createdTargets = [
        {
          id: randomUUID(),
          value: '8.8.8.8',
          type: TargetType.IP,
          scanSchedule: 'DISABLED',
        },
      ] as unknown as Target[];

      const mockManager = createMockEntityManager({
        existingTargets: [],
        createdTargets,
      });

      (mockTargetRepository.manager as EntityManager).transaction = jest
        .fn()
        .mockImplementation(
          (callback: (manager: EntityManager) => Promise<unknown>) =>
            callback(mockManager),
        );

      // Act
      const result = await service.createMultipleTargets(
        dto,
        workspaceId,
        userContext,
      );

      // Assert
      expect(result.created).toHaveLength(1);
      expect(result.totalCreated).toBe(1);
      expect(mockEventEmitter.emit).toHaveBeenCalledTimes(1);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'target.ip.create',
        expect.any(Object),
      );
    });

    it('should throw BadRequestException for invalid IP format', async () => {
      // Arrange
      const dto = { targets: [{ value: 'invalid-ip', type: TargetType.IP }] };

      // Act & Assert
      await expect(
        service.createMultipleTargets(dto, workspaceId, userContext),
      ).rejects.toThrow(
        'Invalid IP: "invalid-ip" is not a valid IPv4 address. Expected format: x.x.x.x',
      );
    });

    it('should throw BadRequestException for IP with invalid octet', async () => {
      // Arrange
      const dto = { targets: [{ value: '256.1.1.1', type: TargetType.IP }] };

      // Act & Assert
      await expect(
        service.createMultipleTargets(dto, workspaceId, userContext),
      ).rejects.toThrow(
        'Invalid IP: "256.1.1.1" contains invalid IP octet. Each octet must be 0-255.',
      );
    });

    it('should throw BadRequestException for private IP address', async () => {
      // Arrange
      const dto = { targets: [{ value: '192.168.1.1', type: TargetType.IP }] };

      // Act & Assert
      await expect(
        service.createMultipleTargets(dto, workspaceId, userContext),
      ).rejects.toThrow(
        'Invalid IP: "192.168.1.1" is a private/reserved IP address. Only public IP addresses are allowed.',
      );
    });

    it('should throw BadRequestException for localhost IP address', async () => {
      // Arrange
      const dto = { targets: [{ value: '127.0.0.1', type: TargetType.IP }] };

      // Act & Assert
      await expect(
        service.createMultipleTargets(dto, workspaceId, userContext),
      ).rejects.toThrow(
        'Invalid IP: "127.0.0.1" is a private/reserved IP address. Only public IP addresses are allowed.',
      );
    });
  });

  describe('createMultipleTargets — GIT_ORG', () => {
    const workspaceId = randomUUID();
    const userContext = { id: randomUUID() } as unknown as UserContextPayload;
    const integrationId = randomUUID();

    const githubIntegration = (overrides: Record<string, unknown> = {}) => ({
      id: integrationId,
      name: 'GitHub',
      appType: 'github',
      category: IntegrationType.SOURCE_CODE,
      capabilities: [IntegrationType.SOURCE_CODE],
      config: { apiToken: 'encrypted' },
      workspaceId,
      ...overrides,
    });

    let insertedRows: Array<Record<string, unknown>>;
    let assetInsert: jest.Mock;

    const arrangeTransaction = (created: Target[]) => {
      insertedRows = [];
      assetInsert = jest.fn();
      const insertQB: Record<string, jest.Mock> = {
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn((rows: Array<Record<string, unknown>>): unknown => {
          insertedRows = rows;
          return insertQB;
        }),
        orIgnore: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({
          identifiers: created.map((t) => ({ id: t.id })),
        }),
      };
      const manager = {
        getRepository: jest.fn((entity: { name: string }): unknown =>
          entity.name === 'Target'
            ? {
                createQueryBuilder: jest.fn(() => ({
                  where: jest.fn().mockReturnThis(),
                  andWhere: jest.fn().mockReturnThis(),
                  select: jest.fn().mockReturnThis(),
                  getRawMany: jest.fn().mockResolvedValue([]),
                })),
                findByIds: jest.fn().mockResolvedValue(created),
              }
            : {},
        ),
        createQueryBuilder: jest.fn((): unknown => {
          // Second call onward = asset inserts.
          return manager.createQueryBuilder.mock.calls.length > 1
            ? { ...insertQB, execute: assetInsert }
            : insertQB;
        }),
      } as unknown as EntityManager & { createQueryBuilder: jest.Mock };
      (mockTargetRepository.manager as EntityManager).transaction = jest
        .fn()
        .mockImplementation(
          (callback: (m: EntityManager) => Promise<unknown>) => callback(manager),
        );
    };

    beforeEach(() => {
      mockWorkspacesService.getWorkspaceByIdAndOwner = jest
        .fn()
        .mockResolvedValue({ id: workspaceId });
      mockEventEmitter.emit = jest.fn();
    });

    it('stores the integration, settings and provider source, creates no host asset and emits git_org.create', async () => {
      mockIntegrationRepository.find.mockResolvedValue([githubIntegration()]);
      const created = [
        { id: randomUUID(), value: 'github.com/acme', type: TargetType.GIT_ORG },
      ] as unknown as Target[];
      arrangeTransaction(created);

      await service.createMultipleTargets(
        {
          targets: [
            {
              value: 'GitHub.com/Acme/',
              type: TargetType.GIT_ORG,
              integrationId,
              settings: { includeForks: true },
            },
          ],
        },
        workspaceId,
        userContext,
      );

      expect(mockIntegrationRepository.find).toHaveBeenCalledWith({
        where: { id: expect.anything(), workspaceId },
      });
      expect(insertedRows[0]).toMatchObject({
        value: 'github.com/acme',
        type: TargetType.GIT_ORG,
        source: TargetSource.GITHUB,
        integrationId,
        settings: { includeArchived: false, includeForks: true },
      });
      expect(assetInsert).not.toHaveBeenCalled();
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'target.git_org.create',
        created[0],
      );
    });

    it('requires an integration', async () => {
      await expect(
        service.createMultipleTargets(
          { targets: [{ value: 'github.com/acme', type: TargetType.GIT_ORG }] },
          workspaceId,
          userContext,
        ),
      ).rejects.toThrow(/needs a source-code integration/);
    });

    it('rejects an integration from another workspace', async () => {
      mockIntegrationRepository.find.mockResolvedValue([]);

      await expect(
        service.createMultipleTargets(
          {
            targets: [
              { value: 'github.com/acme', type: TargetType.GIT_ORG, integrationId },
            ],
          },
          workspaceId,
          userContext,
        ),
      ).rejects.toThrow(/not found in this workspace/);
    });

    it('rejects an integration without the SOURCE_CODE capability', async () => {
      mockIntegrationRepository.find.mockResolvedValue([
        githubIntegration({
          category: IntegrationType.TICKETING,
          capabilities: [IntegrationType.TICKETING],
        }),
      ]);

      await expect(
        service.createMultipleTargets(
          {
            targets: [
              { value: 'github.com/acme', type: TargetType.GIT_ORG, integrationId },
            ],
          },
          workspaceId,
          userContext,
        ),
      ).rejects.toThrow(/SOURCE_CODE capability/);
    });

    it('rejects an organization on another host than the integration', async () => {
      mockIntegrationRepository.find.mockResolvedValue([githubIntegration()]);

      await expect(
        service.createMultipleTargets(
          {
            targets: [
              { value: 'gitlab.com/acme', type: TargetType.GIT_ORG, integrationId },
            ],
          },
          workspaceId,
          userContext,
        ),
      ).rejects.toThrow(/is not on github.com/);
    });

    it('rejects a malformed organization value', async () => {
      await expect(
        service.createMultipleTargets(
          {
            targets: [
              { value: 'not a path', type: TargetType.GIT_ORG, integrationId },
            ],
          },
          workspaceId,
          userContext,
        ),
      ).rejects.toThrow(/Invalid Git organization/);
    });

    it('rejects an integration on a host target', async () => {
      await expect(
        service.createMultipleTargets(
          { targets: [{ value: 'example.com', integrationId }] },
          workspaceId,
          userContext,
        ),
      ).rejects.toThrow(/only applies to GIT_ORG/);
    });
  });

  describe('source field in target queries', () => {
    const baseBuilder = () => ({
      innerJoin: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      having: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
      getRawMany: jest.fn().mockResolvedValue([]),
    });

    it('getTargetsInWorkspace select should include targets.source', async () => {
      // Arrange
      const builder = baseBuilder();
      (mockTargetRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        builder,
      );

      // Act
      await service.getTargetsInWorkspace(
        { page: 1, limit: 10, sortBy: 'value', sortOrder: 'ASC' },
        'ws-1',
      );

      // Assert
      expect(builder.select).toHaveBeenCalledWith(
        expect.arrayContaining(['targets.source as "source"']),
      );
      expect(builder.groupBy).toHaveBeenCalledWith('targets.id');
    });

    it('getTargetsInWorkspace maps a MANUAL raw source to {source: "Manual", icon: ""}', async () => {
      // Arrange
      const builder = baseBuilder();
      builder.getCount.mockResolvedValue(1);
      builder.getRawMany.mockResolvedValue([
        {
          id: 'target-1',
          value: 'manual.com',
          source: 'MANUAL',
          type: 'DOMAIN',
        },
      ]);
      (mockTargetRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        builder,
      );

      // Act
      const result = await service.getTargetsInWorkspace(
        { page: 1, limit: 10, sortBy: 'value', sortOrder: 'ASC' },
        'ws-1',
      );

      // Assert: response row source is the mapped label/icon object
      expect(result.data[0].source).toEqual({
        source: 'Manual',
        icon: '',
      });
    });

    it('getTargetsInWorkspace maps a cloudflare raw source to the schema-driven label and icon', async () => {
      // Arrange
      const builder = baseBuilder();
      builder.getCount.mockResolvedValue(1);
      builder.getRawMany.mockResolvedValue([
        {
          id: 'target-2',
          value: 'cloudflare-synced.com',
          source: 'cloudflare',
          type: 'DOMAIN',
        },
      ]);
      (mockTargetRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        builder,
      );

      // Act
      const result = await service.getTargetsInWorkspace(
        { page: 1, limit: 10, sortBy: 'value', sortOrder: 'ASC' },
        'ws-1',
      );

      // Assert: raw 'cloudflare' (schema $id) resolves to schema title + icon
      expect(result.data[0].source).toEqual({
        source: 'Cloudflare',
        icon: '/static/images/integrations/cloudflare.svg',
      });
    });

    it('getTargetsInWorkspace maps an unknown raw source gracefully without throwing', async () => {
      // Arrange
      const builder = baseBuilder();
      builder.getCount.mockResolvedValue(1);
      builder.getRawMany.mockResolvedValue([
        {
          id: 'target-3',
          value: 'legacy.com',
          source: 'LEGACY',
          type: 'DOMAIN',
        },
      ]);
      (mockTargetRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        builder,
      );

      // Act
      const result = await service.getTargetsInWorkspace(
        { page: 1, limit: 10, sortBy: 'value', sortOrder: 'ASC' },
        'ws-1',
      );

      // Assert: unknown raw source passes through as label with no icon
      expect(result.data[0].source).toEqual({
        source: 'LEGACY',
        icon: '',
      });
    });

    it('getTargetsInWorkspace returns a logo per target: favicon for hosts, avatar for GitHub orgs', async () => {
      const builder = baseBuilder();
      builder.getCount.mockResolvedValue(3);
      builder.getRawMany.mockResolvedValue([
        { id: 'domain-1', value: 'example.com', source: 'MANUAL', type: 'DOMAIN' },
        { id: 'ip-1', value: '10.0.0.1', source: 'MANUAL', type: 'IP' },
        { id: 'org-1', value: 'github.com/acme', source: 'github', type: 'GIT_ORG' },
      ]);
      (mockTargetRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        builder,
      );
      (mockTargetRepository.query as jest.Mock).mockResolvedValue([
        { targetId: 'domain-1', faviconUrl: 'https://example.com/favicon.ico' },
      ]);

      const result = await service.getTargetsInWorkspace(
        { page: 1, limit: 10, sortBy: 'value', sortOrder: 'ASC' },
        'ws-1',
      );

      // Only host targets are looked up, in a single query.
      expect(mockTargetRepository.query).toHaveBeenCalledTimes(1);
      expect(mockTargetRepository.query).toHaveBeenCalledWith(
        expect.any(String),
        [['domain-1', 'ip-1']],
      );
      expect(result.data.map((t) => t.logo)).toEqual([
        'https://example.com/favicon.ico',
        null,
        'https://github.com/acme.png',
      ]);
    });

    it('getTargetsInWorkspace skips the favicon query when the page has only Git orgs', async () => {
      const builder = baseBuilder();
      builder.getRawMany.mockResolvedValue([
        { id: 'org-1', value: 'gitlab.com/acme', source: 'gitlab', type: 'GIT_ORG' },
      ]);
      (mockTargetRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        builder,
      );

      const result = await service.getTargetsInWorkspace(
        { page: 1, limit: 10, sortBy: 'value', sortOrder: 'ASC' },
        'ws-1',
      );

      expect(mockTargetRepository.query).not.toHaveBeenCalled();
      expect(result.data[0].logo).toBeNull();
    });

    it('getTargetById select and groupBy should include targets.source', async () => {
      // Arrange
      const builder = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue(null),
      };
      (mockTargetRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        builder,
      );

      // Act
      await service.getTargetById('target-1', 'ws-1');

      // Assert
      expect(builder.select).toHaveBeenCalledWith(
        expect.arrayContaining(['targets.source as source']),
      );
      expect(builder.groupBy).toHaveBeenCalledWith(
        expect.stringContaining('targets.source'),
      );
    });

    it('getTargetById returns the favicon logo of a host target', async () => {
      const builder = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          id: 'target-1',
          value: 'example.com',
          type: 'DOMAIN',
          source: 'MANUAL',
        }),
      };
      (mockTargetRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        builder,
      );
      (mockTargetRepository.query as jest.Mock).mockResolvedValue([
        { targetId: 'target-1', faviconUrl: 'https://example.com/favicon.ico' },
      ]);

      const result = await service.getTargetById('target-1', 'ws-1');

      expect(mockTargetRepository.query).toHaveBeenCalledWith(
        expect.any(String),
        [['target-1']],
      );
      expect(result.logo).toBe('https://example.com/favicon.ico');
    });
  });

  describe('findByWorkspaceAndValues', () => {
    it('should return targets filtered by workspace and values', async () => {
      const builder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { id: 'target-1', value: 'example.com' },
          { id: 'target-2', value: 'example.net' },
        ]),
      };
      (mockTargetRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        builder,
      );

      const result = await service.findByWorkspaceAndValues('ws-1', [
        'example.com',
        'example.net',
      ]);

      expect(builder.where).toHaveBeenCalledWith(
        'target.workspaceId = :workspaceId',
        { workspaceId: 'ws-1' },
      );
      expect(builder.andWhere).toHaveBeenCalledWith(
        'target.value IN (:...values)',
        { values: ['example.com', 'example.net'] },
      );
      expect(builder.select).toHaveBeenCalledWith(['target.id', 'target.value']);
      expect(result).toEqual([
        { id: 'target-1', value: 'example.com' },
        { id: 'target-2', value: 'example.net' },
      ]);
    });

    it('should return an empty array when no values are provided', async () => {
      const result = await service.findByWorkspaceAndValues('ws-1', []);

      expect(result).toEqual([]);
      expect(mockTargetRepository.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('deleteTarget', () => {
    const workspaceId = randomUUID();
    const id = randomUUID();
    const userContext = {
      id: randomUUID(),
      name: 'Test User',
      email: 'test@example.com',
    } as unknown as UserContextPayload;
    const auditContext: AuditContext = {
      actorId: randomUUID(),
      actorName: 'Test User',
      actorEmail: 'test@example.com',
      sourceIp: '127.0.0.1',
      userAgent: 'jest',
      requestId: randomUUID(),
    };

    beforeEach(() => {
      jest.clearAllMocks();
      (mockWorkspacesService.getWorkspaceByIdAndOwner as jest.Mock).mockResolvedValue(
        undefined,
      );
      (mockTargetRepository.delete as jest.Mock).mockResolvedValue({ affected: 1 });
    });

    it('writes a target.deleted audit event with the deleted target as before-changes', async () => {
      (mockTargetRepository.findOneBy as jest.Mock).mockResolvedValue({
        id,
        value: 'example.com',
        type: TargetType.DOMAIN,
        scanSchedule: null,
      });

      await service.deleteTarget(id, workspaceId, userContext, auditContext);

      expect(mockAuditService.auditSafely).toHaveBeenCalledWith({
        workspaceId,
        ...auditContext,
        action: 'target.deleted',
        resourceType: 'target',
        resourceId: id,
        changes: {
          value: { before: 'example.com' },
          type: { before: TargetType.DOMAIN },
        },
        outcome: AuditOutcome.Success,
      });
    });

    it('skips the audit write when no audit context is provided', async () => {
      (mockTargetRepository.findOneBy as jest.Mock).mockResolvedValue({
        id,
        value: 'example.com',
        type: TargetType.DOMAIN,
        scanSchedule: null,
      });

      await service.deleteTarget(id, workspaceId, userContext);

      expect(mockAuditService.auditSafely).not.toHaveBeenCalled();
    });

    it('does not write an audit event when the target does not exist', async () => {
      (mockTargetRepository.findOneBy as jest.Mock).mockResolvedValue(null);

      await expect(
        service.deleteTarget(id, workspaceId, userContext, auditContext),
      ).rejects.toThrow('Target not found in workspace');

      expect(mockTargetRepository.delete).not.toHaveBeenCalled();
      expect(mockAuditService.auditSafely).not.toHaveBeenCalled();
    });
  });
});
