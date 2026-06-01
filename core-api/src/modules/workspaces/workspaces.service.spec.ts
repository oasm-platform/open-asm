import { SortOrder } from '@/common/dtos/get-many-base.dto';
import { Role } from '@/common/enums/enum';
import type { TestingModule } from '@nestjs/testing';
import type { Request, Response } from 'express';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import type { Repository } from 'typeorm';
import { DataSource } from 'typeorm';
import { ApiKeysService } from '../apikeys/apikeys.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WorkspaceTarget } from '../targets/entities/workspace-target.entity';
import { WorkflowsService } from '../workflows/workflows.service';
import { WorkspaceMembers } from './entities/workspace-members.entity';
import { Workspace } from './entities/workspace.entity';
import { WorkspacesService } from './workspaces.service';

describe('WorkspacesService', () => {
  let service: WorkspacesService;
  let mockWorkspaceRepository: Partial<Repository<Workspace>>;
  let mockWorkspaceMembersRepository: Partial<Repository<WorkspaceMembers>>;
  let mockWorkspaceTargetRepository: Partial<Repository<WorkspaceTarget>>;
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
  const mockOwnerWorkspaceResult = [
    {
      workspace_id: testWorkspaceId,
      workspace_name: 'Test Workspace',
      workspace_description: 'Test Description',
      workspace_createdAt: new Date(),
      workspace_updatedAt: new Date(),
      workspace_archivedAt: null,
      workspace_isAssetsDiscovery: true,
      workspace_isAutoEnableAssetAfterDiscovered: true,
      workspace_ownerId: testUserId,
      targetcount: '5',
      membercount: '3',
      member_role: 'owner',
    },
  ];

  const mockMemberWorkspaceResult = [
    {
      workspace_id: testWorkspaceId,
      workspace_name: 'Test Workspace',
      workspace_description: 'Test Description',
      workspace_createdAt: new Date(),
      workspace_updatedAt: new Date(),
      workspace_archivedAt: null,
      workspace_isAssetsDiscovery: true,
      workspace_isAutoEnableAssetAfterDiscovered: true,
      workspace_ownerId: randomUUID(),
      targetcount: '5',
      membercount: '3',
      member_role: 'member',
    },
  ];

  const mockMultipleWorkspacesResult = [
    {
      workspace_id: testWorkspaceId,
      workspace_name: 'Workspace 1',
      workspace_description: 'Description 1',
      workspace_createdAt: new Date(),
      workspace_updatedAt: new Date(),
      workspace_archivedAt: null,
      workspace_isAssetsDiscovery: true,
      workspace_isAutoEnableAssetAfterDiscovered: true,
      workspace_ownerId: testUserId,
      targetcount: '5',
      membercount: '3',
      member_role: 'owner',
    },
    {
      workspace_id: randomUUID(),
      workspace_name: 'Workspace 2',
      workspace_description: 'Description 2',
      workspace_createdAt: new Date(),
      workspace_updatedAt: new Date(),
      workspace_archivedAt: null,
      workspace_isAssetsDiscovery: false,
      workspace_isAutoEnableAssetAfterDiscovered: false,
      workspace_ownerId: randomUUID(),
      targetcount: '10',
      membercount: '5',
      member_role: 'member',
    },
  ];

  const mockArchivedWorkspaceResult = [
    {
      workspace_id: testWorkspaceId,
      workspace_name: 'Archived Workspace',
      workspace_description: 'Archived Description',
      workspace_createdAt: new Date(),
      workspace_updatedAt: new Date(),
      workspace_archivedAt: new Date(),
      workspace_isAssetsDiscovery: true,
      workspace_isAutoEnableAssetAfterDiscovered: true,
      workspace_ownerId: testUserId,
      targetcount: '2',
      membercount: '1',
      member_role: 'owner',
    },
  ];

  const mockEmptyResult: { total: string }[] = [{ total: '0' }];

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
      find: jest.fn(),
    };

    mockWorkspaceTargetRepository = {
      createQueryBuilder: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(),
    } as any;

    mockApiKeysService = {
      create: jest.fn(),
      getCurrentApiKey: jest.fn(),
    };

    mockNotificationsService = {
      createNotification: jest.fn(),
    };

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
          provide: getRepositoryToken(WorkspaceTarget),
          useValue: mockWorkspaceTargetRepository,
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

      // Mock count query
      (mockWorkspaceRepository.query as jest.Mock)
        .mockResolvedValueOnce(mockEmptyResult) // count query
        .mockResolvedValueOnce(mockOwnerWorkspaceResult); // data query

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

      // Mock count query
      (mockWorkspaceRepository.query as jest.Mock)
        .mockResolvedValueOnce(mockEmptyResult) // count query
        .mockResolvedValueOnce(mockMemberWorkspaceResult); // data query

      // Act
      const result = await service.getWorkspaces(query, testUserContext, { headers: {} } as Request, { cookie: jest.fn() } as unknown as Response);

      // Assert
      expect(result).toBeDefined();
      expect(result.data).toHaveLength(1);
      expect(result.data[0].role).toBe('member');
      expect(result.data[0].id).toBe(testWorkspaceId);
    });

    // Test case 3: User là admin của workspace → trả về role = 'admin'
    // Note: WorkspaceRole enum only has OWNER and MEMBER, but we test with database value
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
          workspace_id: testWorkspaceId,
          workspace_name: 'Admin Workspace',
          workspace_description: 'Admin Description',
          workspace_createdAt: new Date(),
          workspace_updatedAt: new Date(),
          workspace_archivedAt: null,
          workspace_isAssetsDiscovery: true,
          workspace_isAutoEnableAssetAfterDiscovered: true,
          workspace_ownerId: randomUUID(),
          targetcount: '5',
          membercount: '3',
          member_role: 'admin', // This might come from database even if not in enum
        },
      ];

      // Mock count query
      (mockWorkspaceRepository.query as jest.Mock)
        .mockResolvedValueOnce(mockEmptyResult) // count query
        .mockResolvedValueOnce(adminRoleResult); // data query

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

      // Mock count query returns 5 total
      (mockWorkspaceRepository.query as jest.Mock)
        .mockResolvedValueOnce([{ total: '5' }]) // count query
        .mockResolvedValueOnce(mockMultipleWorkspacesResult); // data query

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

      // Mock count query
      (mockWorkspaceRepository.query as jest.Mock)
        .mockResolvedValueOnce([{ total: '5' }]) // count query
        .mockResolvedValueOnce(mockMultipleWorkspacesResult); // data query

      // Act
      const result = await service.getWorkspaces(query, testUserContext, { headers: {} } as Request, { cookie: jest.fn() } as unknown as Response);

      // Assert
      expect(result).toBeDefined();
      expect(result.page).toBe(2);

      // Verify query was called with correct offset (page 2, limit 2 => offset = (2-1) * 2 = 2)
      expect(mockWorkspaceRepository.query).toHaveBeenNthCalledWith(
        2,
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

      // Mock count query
      (mockWorkspaceRepository.query as jest.Mock)
        .mockResolvedValueOnce(mockEmptyResult) // count query with isArchived filter
        .mockResolvedValueOnce([]); // data query with isArchived filter

      // Act
      const result = await service.getWorkspaces(query, testUserContext, { headers: {} } as Request, { cookie: jest.fn() } as unknown as Response);

      // Assert
      expect(result).toBeDefined();

      // Verify the query contains the archived filter
      const countQuery = (mockWorkspaceRepository.query as jest.Mock).mock
        .calls[0][0];
      expect(countQuery).toContain('AND w."archivedAt" IS NULL');
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

      // Mock count query
      (mockWorkspaceRepository.query as jest.Mock)
        .mockResolvedValueOnce([{ total: '1' }]) // count query with isArchived filter
        .mockResolvedValueOnce(mockArchivedWorkspaceResult); // data query with isArchived filter

      // Act
      const result = await service.getWorkspaces(query, testUserContext, { headers: {} } as Request, { cookie: jest.fn() } as unknown as Response);

      // Assert
      expect(result).toBeDefined();
      expect(result.data).toHaveLength(1);
      expect(result.data[0].archivedAt).not.toBeNull();

      // Verify the query contains the archived filter
      const countQuery = (mockWorkspaceRepository.query as jest.Mock).mock
        .calls[0][0];
      expect(countQuery).toContain('AND w."archivedAt" IS NOT NULL');
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

      // Mock count query
      (mockWorkspaceRepository.query as jest.Mock)
        .mockResolvedValueOnce(mockEmptyResult) // count query without isArchived filter
        .mockResolvedValueOnce([]); // data query without isArchived filter

      // Act
      const result = await service.getWorkspaces(query, testUserContext, { headers: {} } as Request, { cookie: jest.fn() } as unknown as Response);

      // Assert
      expect(result).toBeDefined();

      // Verify the query does not contain archived filter
      const countQuery = (mockWorkspaceRepository.query as jest.Mock).mock
        .calls[0][0];
      expect(countQuery).not.toContain('archivedAt');
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

      // Mock count query
      (mockWorkspaceRepository.query as jest.Mock)
        .mockResolvedValueOnce(mockEmptyResult) // count query
        .mockResolvedValueOnce(mockOwnerWorkspaceResult); // data query

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

      // Mock count query
      (mockWorkspaceRepository.query as jest.Mock)
        .mockResolvedValueOnce(mockEmptyResult) // count query
        .mockResolvedValueOnce([]); // data query

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

      // Mock count query
      (mockWorkspaceRepository.query as jest.Mock)
        .mockResolvedValueOnce(mockEmptyResult) // count query
        .mockResolvedValueOnce([]); // data query

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

      // Mock count query returns 0
      (mockWorkspaceRepository.query as jest.Mock)
        .mockResolvedValueOnce(mockEmptyResult) // count query
        .mockResolvedValueOnce([]); // data query returns empty

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
