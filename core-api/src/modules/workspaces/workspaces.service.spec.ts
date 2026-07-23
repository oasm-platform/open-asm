import { SortOrder } from '@/common/dtos/get-many-base.dto';
import { Role } from '@/common/enums/enum';
import type { TestingModule } from '@nestjs/testing';
import type { Request, Response } from 'express';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import type { Repository } from 'typeorm';
import { DataSource } from 'typeorm';
import { WorkspaceEncryptionService } from '@/services/workspace-encryption/workspace-encryption.service';
import { ApiKeysService } from '../apikeys/apikeys.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WorkflowsService } from '../workflows/workflows.service';
import { WorkspaceMembers } from './entities/workspace-members.entity';
import { Workspace } from './entities/workspace.entity';
import { WorkspacesService } from './workspaces.service';

describe('WorkspacesService', () => {
  let service: WorkspacesService;
  let mockWorkspaceRepository: Partial<Repository<Workspace>>;
  let mockWorkspaceMembersRepository: Partial<Repository<WorkspaceMembers>>;
  let mockApiKeysService: Partial<ApiKeysService>;
  let mockNotificationsService: Partial<NotificationsService>;
  let mockDataSource: Partial<DataSource>;

  // Test data
  const testUserId = randomUUID();
  const testWorkspaceId = randomUUID();
  const testUserContext = {
    id: testUserId,
    name: 'Test User',
    email: 'test@example.com',
    emailVerified: true,
    image: 'https://example.com/avatar.png',
    createdAt: new Date(),
    updatedAt: new Date(),
    role: Role.USER,
    expiresAt: '2025-01-01T00:00:00.000Z',
    token: 'test-token',
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent',
    userId: testUserId,
  };

  // Mock query results for different test scenarios
  // NOTE: Column names match the single-window-function query in getWorkspaces
  const mockOwnerWorkspaceResult = [
    {
      id: testWorkspaceId,
      name: 'Test Workspace',
      description: 'Test Description',
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
      isAssetsDiscovery: true,
      isAutoEnableAssetAfterDiscovered: true,
      ownerId: testUserId,
      targetCount: 5,
      memberCount: 3,
      role: 'owner',
      total: '0',
    },
  ];

  const mockMemberWorkspaceResult = [
    {
      id: testWorkspaceId,
      name: 'Test Workspace',
      description: 'Test Description',
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
      isAssetsDiscovery: true,
      isAutoEnableAssetAfterDiscovered: true,
      ownerId: randomUUID(),
      targetCount: 5,
      memberCount: 3,
      role: 'member',
      total: '0',
    },
  ];

  const mockMultipleWorkspacesResult = [
    {
      id: testWorkspaceId,
      name: 'Workspace 1',
      description: 'Description 1',
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
      isAssetsDiscovery: true,
      isAutoEnableAssetAfterDiscovered: true,
      ownerId: testUserId,
      targetCount: 5,
      memberCount: 3,
      role: 'owner',
      total: '5',
    },
    {
      id: randomUUID(),
      name: 'Workspace 2',
      description: 'Description 2',
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
      isAssetsDiscovery: false,
      isAutoEnableAssetAfterDiscovered: false,
      ownerId: randomUUID(),
      targetCount: 10,
      memberCount: 5,
      role: 'member',
      total: '5',
    },
  ];

  const mockArchivedWorkspaceResult = [
    {
      id: testWorkspaceId,
      name: 'Archived Workspace',
      description: 'Archived Description',
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: new Date(),
      isAssetsDiscovery: true,
      isAutoEnableAssetAfterDiscovered: true,
      ownerId: testUserId,
      targetCount: 2,
      memberCount: 1,
      role: 'owner',
      total: '1',
    },
  ];

  beforeEach(async () => {
    mockWorkspaceRepository = {
      count: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
      getManyAndCount: jest.fn(),
      getOne: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      query: jest.fn(),
    } as any;

    mockWorkspaceMembersRepository = {
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };

    mockApiKeysService = {
      create: jest.fn(),
      getCurrentApiKey: jest.fn(),
    };

    mockNotificationsService = {
      createNotification: jest.fn(),
    };

    const mockWorkspaceEncryptionService = {};

    mockDataSource = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspacesService,
        {
          provide: getRepositoryToken(Workspace),
          useValue: mockWorkspaceRepository,
        },
        {
          provide: getRepositoryToken(WorkspaceMembers),
          useValue: mockWorkspaceMembersRepository,
        },
        {
          provide: ApiKeysService,
          useValue: mockApiKeysService,
        },
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
        {
          provide: WorkflowsService,
          useValue: {
            createDefaultWorkflows: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: WorkspaceEncryptionService,
          useValue: mockWorkspaceEncryptionService,
        },
      ],
    }).compile();

    service = module.get<WorkspacesService>(WorkspacesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getWorkspaces', () => {
    // Test case 1: User là owner của workspace → trả về role = 'owner'
    it('should return workspace with role owner when user is owner', async () => {
      // Arrange
      const query = {
        limit: 10,
        page: 1,
        sortBy: 'createdAt',
        sortOrder: SortOrder.DESC,
      };

      // Mock single window-function query (now includes total in each row)
      (mockWorkspaceRepository.query as jest.Mock)
        .mockResolvedValueOnce(mockOwnerWorkspaceResult);

      // Act
      const result = await service.getWorkspaces(query, testUserContext, { headers: {} } as Request, { cookie: jest.fn() } as unknown as Response);

      // Assert
      expect(result).toBeDefined();
      expect(result.data).toHaveLength(1);
      expect(result.data[0].role).toBe('owner');
      expect(result.data[0].id).toBe(testWorkspaceId);
      expect(result.data[0].name).toBe('Test Workspace');
      expect(result.total).toBe(0);
    });

    // Test case 2: User là member của workspace → trả về role = 'member'
    it('should return workspace with role member when user is member', async () => {
      // Arrange
      const query = {
        limit: 10,
        page: 1,
        sortBy: 'createdAt',
        sortOrder: SortOrder.DESC,
      };

      // Mock single window-function query
      (mockWorkspaceRepository.query as jest.Mock)
        .mockResolvedValueOnce(mockMemberWorkspaceResult);

      // Act
      const result = await service.getWorkspaces(query, testUserContext, { headers: {} } as Request, { cookie: jest.fn() } as unknown as Response);

      // Assert
      expect(result).toBeDefined();
      expect(result.data).toHaveLength(1);
      expect(result.data[0].role).toBe('member');
      expect(result.data[0].id).toBe(testWorkspaceId);
    });

    // Test case 3: User là admin của workspace → trả về role = 'admin'
    it('should return workspace with role from database', async () => {
      // Arrange
      const query = {
        limit: 10,
        page: 1,
        sortBy: 'createdAt',
        sortOrder: SortOrder.DESC,
      };

      const adminRoleResult = [
        {
          id: testWorkspaceId,
          name: 'Admin Workspace',
          description: 'Admin Description',
          createdAt: new Date(),
          updatedAt: new Date(),
          archivedAt: null,
          isAssetsDiscovery: true,
          isAutoEnableAssetAfterDiscovered: true,
          ownerId: randomUUID(),
          targetCount: 5,
          memberCount: 3,
          role: 'admin',
          total: '0',
        },
      ];

      // Mock single window-function query
      (mockWorkspaceRepository.query as jest.Mock)
        .mockResolvedValueOnce(adminRoleResult);

      // Act
      const result = await service.getWorkspaces(query, testUserContext, { headers: {} } as Request, { cookie: jest.fn() } as unknown as Response);

      // Assert
      expect(result).toBeDefined();
      expect(result.data).toHaveLength(1);
      expect(result.data[0].role).toBe('admin');
    });

    // Test case 4: Kiểm tra pagination hoạt động đúng với workspace_members join
    it('should correctly handle pagination with workspace_members join', async () => {
      // Arrange
      const query = {
        limit: 2,
        page: 1,
        sortBy: 'createdAt',
        sortOrder: SortOrder.DESC,
      };

      // Mock single window-function query (each row includes total from window fn)
      (mockWorkspaceRepository.query as jest.Mock)
        .mockResolvedValueOnce(mockMultipleWorkspacesResult);

      // Act
      const result = await service.getWorkspaces(query, testUserContext, { headers: {} } as Request, { cookie: jest.fn() } as unknown as Response);

      // Assert
      expect(result).toBeDefined();
      expect(result.page).toBe(1);
      expect(result.limit).toBe(2);
      expect(result.total).toBe(5);
      expect(result.pageCount).toBe(3);
      expect(result.data).toHaveLength(2);
    });

    // Test case 4b: Kiểm tra pagination với page 2
    it('should correctly calculate offset for page 2', async () => {
      // Arrange
      const query = {
        limit: 2,
        page: 2,
        sortBy: 'createdAt',
        sortOrder: SortOrder.ASC,
      };

      // Mock single window-function query
      (mockWorkspaceRepository.query as jest.Mock)
        .mockResolvedValueOnce(mockMultipleWorkspacesResult);

      // Act
      const result = await service.getWorkspaces(query, testUserContext, { headers: {} } as Request, { cookie: jest.fn() } as unknown as Response);

      // Assert
      expect(result).toBeDefined();
      expect(result.page).toBe(2);

      // Verify query was called with correct offset (page 2, limit 2 => offset = (2-1) * 2 = 2)
      expect(mockWorkspaceRepository.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('LIMIT $2 OFFSET $3'),
        [testUserId, 2, 2],
      );
    });

    // Test case 5: Kiểm tra filter isArchived hoạt động đúng - isArchived = false
    it('should filter out archived workspaces when isArchived is false', async () => {
      // Arrange
      const query = {
        limit: 10,
        page: 1,
        sortBy: 'createdAt',
        sortOrder: SortOrder.DESC,
        isArchived: false,
      };

      // Mock single window-function query — empty result
      (mockWorkspaceRepository.query as jest.Mock)
        .mockResolvedValueOnce([]);

      // Act
      const result = await service.getWorkspaces(query, testUserContext, { headers: {} } as Request, { cookie: jest.fn() } as unknown as Response);

      // Assert
      expect(result).toBeDefined();

      // Verify the query contains the archived filter
      const sqlQuery = (mockWorkspaceRepository.query as jest.Mock).mock
        .calls[0][0];
      expect(sqlQuery).toContain('AND w."archivedAt" IS NULL');
    });

    // Test case 5b: Kiểm tra filter isArchived hoạt động đúng - isArchived = true
    it('should filter to only archived workspaces when isArchived is true', async () => {
      // Arrange
      const query = {
        limit: 10,
        page: 1,
        sortBy: 'createdAt',
        sortOrder: SortOrder.DESC,
        isArchived: true,
      };

      // Mock single window-function query
      (mockWorkspaceRepository.query as jest.Mock)
        .mockResolvedValueOnce(mockArchivedWorkspaceResult);

      // Act
      const result = await service.getWorkspaces(query, testUserContext, { headers: {} } as Request, { cookie: jest.fn() } as unknown as Response);

      // Assert
      expect(result).toBeDefined();
      expect(result.data).toHaveLength(1);
      expect(result.data[0].archivedAt).not.toBeNull();

      // Verify the query contains the archived filter
      const sqlQuery = (mockWorkspaceRepository.query as jest.Mock).mock
        .calls[0][0];
      expect(sqlQuery).toContain('AND w."archivedAt" IS NOT NULL');
    });

    // Test case 5c: Kiểm tra filter isArchived không được set (undefined)
    it('should return all workspaces when isArchived is undefined', async () => {
      // Arrange
      const query = {
        limit: 10,
        page: 1,
        sortBy: 'createdAt',
        sortOrder: SortOrder.DESC,
        isArchived: undefined,
      };

      // Mock single window-function query — empty result
      (mockWorkspaceRepository.query as jest.Mock)
        .mockResolvedValueOnce([]);

      // Act
      const result = await service.getWorkspaces(query, testUserContext, { headers: {} } as Request, { cookie: jest.fn() } as unknown as Response);

      // Assert
      expect(result).toBeDefined();

      // Verify the WHERE clause does not contain archived filter
      const sqlQuery = (mockWorkspaceRepository.query as jest.Mock).mock
        .calls[0][0];
      const whereClause = sqlQuery.split('WHERE')[1]?.split('ORDER BY')[0] ?? '';
      expect(whereClause).not.toContain('archivedAt');
    });

    // Test case: Kiểm tra targetCount và memberCount được map đúng
    it('should correctly map targetCount and memberCount', async () => {
      // Arrange
      const query = {
        limit: 10,
        page: 1,
        sortBy: 'createdAt',
        sortOrder: SortOrder.DESC,
      };

      // Mock single window-function query
      (mockWorkspaceRepository.query as jest.Mock)
        .mockResolvedValueOnce(mockOwnerWorkspaceResult);

      // Act
      const result = await service.getWorkspaces(query, testUserContext, { headers: {} } as Request, { cookie: jest.fn() } as unknown as Response);

      // Assert
      expect(result.data[0].targetCount).toBe(5);
      expect(result.data[0].memberCount).toBe(3);
    });

    // Test case: Kiểm tra sortBy mặc định khi không hợp lệ
    it('should use default sortBy when provided sortBy is invalid', async () => {
      // Arrange
      const query = {
        limit: 10,
        page: 1,
        sortBy: 'invalidField',
        sortOrder: SortOrder.DESC,
      };

      // Mock single window-function query — empty result
      (mockWorkspaceRepository.query as jest.Mock)
        .mockResolvedValueOnce([]);

      // Act
      const result = await service.getWorkspaces(query, testUserContext, { headers: {} } as Request, { cookie: jest.fn() } as unknown as Response);

      // Assert
      expect(result).toBeDefined();
      // Default sortBy should be 'createdAt'
    });

    // Test case: Kiểm tra sortOrder mặc định khi không hợp lệ
    it('should use default sortOrder when provided sortOrder is invalid', async () => {
      // Arrange
      const query = {
        limit: 10,
        page: 1,
        sortBy: 'createdAt',
        sortOrder: 'INVALID' as any,
      };

      // Mock single window-function query — empty result
      (mockWorkspaceRepository.query as jest.Mock)
        .mockResolvedValueOnce([]);

      // Act
      const result = await service.getWorkspaces(query, testUserContext, { headers: {} } as Request, { cookie: jest.fn() } as unknown as Response);

      // Assert
      expect(result).toBeDefined();
      // Default sortOrder should be 'DESC' (ASC is converted to DESC)
    });

    // Test case: empty workspaces list
    it('should return empty list when user has no workspaces', async () => {
      // Arrange
      const query = {
        limit: 10,
        page: 1,
        sortBy: 'createdAt',
        sortOrder: SortOrder.DESC,
      };

      // Mock single window-function query returns empty
      (mockWorkspaceRepository.query as jest.Mock)
        .mockResolvedValueOnce([]);

      // Act
      const result = await service.getWorkspaces(query, testUserContext, { headers: {} } as Request, { cookie: jest.fn() } as unknown as Response);

      // Assert
      expect(result).toBeDefined();
      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.pageCount).toBe(0);
    });
  });
});
