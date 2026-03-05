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
import { Target } from './entities/target.entity';
import { WorkspaceTarget } from './entities/workspace-target.entity';
import { TargetsService } from './targets.service';

describe('TargetsService', () => {
  let service: TargetsService;
  let mockTargetRepository: Partial<Repository<Target>>;
  let mockWorkspaceTargetRepository: Partial<Repository<WorkspaceTarget>>;
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

    mockWorkspaceTargetRepository = {
      findOneBy: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(),
      save: jest.fn(),
    } as any;

    mockWorkspacesService = {
      getWorkspaceByIdAndOwner: jest.fn(),
      getWorkspaceConfigValue: jest.fn(),
    } as any;

    mockAssetsService = {
      createPrimaryAsset: jest.fn(),
    } as any;

    mockEventEmitter = {
      emit: jest.fn(),
    } as any;

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
          provide: getRepositoryToken(WorkspaceTarget),
          useValue: mockWorkspaceTargetRepository,
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

      const mockWorkspaceTargetRepo = {
        createQueryBuilder: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValue(existingTargets.map((value) => ({ value }))),
        save: jest.fn().mockResolvedValue(undefined),
      };

      const mockTargetRepo: Record<string, jest.Mock> = {
        createQueryBuilder: jest.fn(),
        insert: jest.fn(),
        into: jest.fn(),
        values: jest.fn(),
        execute: jest.fn().mockResolvedValue(
          insertResult || {
            identifiers: createdTargets.map((t) => ({ id: t.id })),
          },
        ),
        findByIds: jest.fn().mockResolvedValue(createdTargets),
      };

      // Setup chaining
      mockTargetRepo.createQueryBuilder.mockReturnValue(mockTargetRepo);
      mockTargetRepo.insert.mockReturnValue(mockTargetRepo);
      mockTargetRepo.into.mockReturnValue(mockTargetRepo);
      mockTargetRepo.values.mockReturnValue(mockTargetRepo);

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
          if (entity.name === 'WorkspaceTarget')
            return mockWorkspaceTargetRepo as unknown as Repository<WorkspaceTarget>;
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

    it('should skip duplicate targets and create new ones', async () => {
      // Arrange
      const targetValues = [
        'existing.com',
        'new1.com',
        'existing2.com',
        'new2.com',
      ];
      const dto = { targets: targetValues.map((value) => ({ value })) };
      const newTargets = [
        { id: randomUUID(), value: 'new1.com', scanSchedule: 'DISABLED' },
        { id: randomUUID(), value: 'new2.com', scanSchedule: 'DISABLED' },
      ] as unknown as Target[];

      const mockManager = createMockEntityManager({
        existingTargets: ['existing.com', 'existing2.com'],
        createdTargets: newTargets,
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
      expect(result.totalSkipped).toBe(2);
      expect(result.skipped).toContain('existing.com');
      expect(result.skipped).toContain('existing2.com');
      expect(result.totalRequested).toBe(4);
    });

    it('should skip all targets when all are duplicates', async () => {
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

      // Act
      const result = await service.createMultipleTargets(
        dto,
        workspaceId,
        userContext,
      );

      // Assert
      expect(result.created).toHaveLength(0);
      expect(result.totalCreated).toBe(0);
      expect(result.totalSkipped).toBe(2);
      expect(result.skipped).toEqual(['dup1.com', 'dup2.com']);
      expect(result.totalRequested).toBe(2);
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
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
        'target.create',
        expect.any(Object),
      );
    });
  });
});
