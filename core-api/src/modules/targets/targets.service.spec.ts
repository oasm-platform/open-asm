import type { UserContextPayload } from '@/common/interfaces/app.interface';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import type { EntityManager, Repository } from 'typeorm';
import { AssetsService } from '../assets/assets.service';
import type { Asset } from '../assets/entities/assets.entity';
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
      findOne: jest.fn(),
      findByIds: jest.fn(),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TargetsService,
        {
          provide: getRepositoryToken(Target),
          useValue: mockTargetRepository,
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
});
