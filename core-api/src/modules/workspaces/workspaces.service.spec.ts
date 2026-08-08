import { SortOrder } from '@/common/dtos/get-many-base.dto';
import { InvitationStatus, Role } from '@/common/enums/enum';
import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
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
import { WorkspaceInvitation } from './entities/workspace-invitation.entity';
import { WorkspaceMemberPermission } from './entities/workspace-member-permission.entity';
import { WorkspaceMembers } from './entities/workspace-members.entity';
import { WorkspacePermission } from './entities/workspace-permission.entity';
import { Workspace } from './entities/workspace.entity';
import { WorkspacesService } from './workspaces.service';

describe('WorkspacesService', () => {
  let service: WorkspacesService;
  let mockWorkspaceRepository: Partial<Repository<Workspace>>;
  let mockWorkspaceMembersRepository: Partial<Repository<WorkspaceMembers>>;
  let mockPermissionRepository: Partial<Repository<WorkspacePermission>>;
  let mockMemberPermissionRepository: Partial<Repository<WorkspaceMemberPermission>>;
  let mockInvitationRepository: Partial<Repository<WorkspaceInvitation>>;
  let mockApiKeysService: Partial<ApiKeysService>;
  let mockNotificationsService: Partial<NotificationsService>;
  let mockDataSource: Partial<DataSource>;
  let mockManager: any;

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
      delete: jest.fn(),
    };

    mockPermissionRepository = {
      save: jest.fn().mockImplementation((data: unknown) => Promise.resolve(data)),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      delete: jest.fn(),
    };

    mockMemberPermissionRepository = {
      save: jest.fn().mockImplementation((data: unknown) => Promise.resolve(data)),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockInvitationRepository = {
      save: jest.fn().mockImplementation((data: unknown) => Promise.resolve(data)),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockManager = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      save: jest.fn().mockImplementation((_entity: unknown, data?: unknown) =>
        Promise.resolve(data ?? _entity),
      ),
      create: jest.fn().mockImplementation((_entity: unknown, data: unknown) => data),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      getRepository: jest.fn().mockReturnValue({
        find: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue(null),
        save: jest.fn().mockImplementation((data: unknown) => Promise.resolve(data)),
      }),
    };
    mockWorkspaceRepository.manager = {
      ...mockManager,
      transaction: jest.fn((cb: (m: any) => unknown) => cb(mockManager)),
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
          provide: getRepositoryToken(WorkspacePermission),
          useValue: mockPermissionRepository,
        },
        {
          provide: getRepositoryToken(WorkspaceMemberPermission),
          useValue: mockMemberPermissionRepository,
        },
        {
          provide: getRepositoryToken(WorkspaceInvitation),
          useValue: mockInvitationRepository,
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

    // Test case: currentPermission = union of permission keys from the
    // current user's membership permission groups (no workspaceMembers)
    it('should return currentPermission as union of permission keys from user membership', async () => {
      // Arrange
      const query = {
        limit: 10,
        page: 1,
        sortBy: 'createdAt',
        sortOrder: SortOrder.DESC,
      };

      (mockWorkspaceRepository.query as jest.Mock).mockResolvedValueOnce(
        mockOwnerWorkspaceResult,
      );

      (mockWorkspaceMembersRepository.find as jest.Mock).mockResolvedValueOnce([
        {
          id: randomUUID(),
          workspace: { id: testWorkspaceId },
          memberPermissions: [
            {
              id: randomUUID(),
              permission: {
                id: randomUUID(),
                permissions: ['group.read', 'target.read'],
              },
            },
            {
              id: randomUUID(),
              permission: {
                id: randomUUID(),
                permissions: ['group.read', 'target.write'],
              },
            },
          ],
        },
      ]);

      // Act
      const result = await service.getWorkspaces(
        query,
        testUserContext,
        { headers: {} } as Request,
        { cookie: jest.fn() } as unknown as Response,
      );

      // Assert
      expect(result.data[0].currentPermission).toEqual(
        expect.arrayContaining(['group.read', 'target.read', 'target.write']),
      );
      expect(result.data[0].currentPermission).toHaveLength(3);
    });

    // Test case: response no longer includes workspaceMembers
    it('should not return workspaceMembers in the response', async () => {
      // Arrange
      const query = {
        limit: 10,
        page: 1,
        sortBy: 'createdAt',
        sortOrder: SortOrder.DESC,
      };

      (mockWorkspaceRepository.query as jest.Mock).mockResolvedValueOnce(
        mockMultipleWorkspacesResult,
      );
      (mockWorkspaceMembersRepository.find as jest.Mock).mockResolvedValueOnce(
        [],
      );

      // Act
      const result = await service.getWorkspaces(
        query,
        testUserContext,
        { headers: {} } as Request,
        { cookie: jest.fn() } as unknown as Response,
      );

      // Assert
      expect(result.data[0]).not.toHaveProperty('workspaceMembers');
      expect(result.data[1]).not.toHaveProperty('workspaceMembers');
      expect(result.data[0]).not.toHaveProperty('role');
      expect(result.data[1]).not.toHaveProperty('role');
    });

    // Test case: empty currentPermission when membership has no permission groups
    it('should return empty currentPermission when membership has no permission groups', async () => {
      // Arrange
      const query = {
        limit: 10,
        page: 1,
        sortBy: 'createdAt',
        sortOrder: SortOrder.DESC,
      };

      (mockWorkspaceRepository.query as jest.Mock).mockResolvedValueOnce(
        mockOwnerWorkspaceResult,
      );
      (mockWorkspaceMembersRepository.find as jest.Mock).mockResolvedValueOnce([
        {
          id: randomUUID(),
          workspace: { id: testWorkspaceId },
          memberPermissions: [],
        },
      ]);

      // Act
      const result = await service.getWorkspaces(
        query,
        testUserContext,
        { headers: {} } as Request,
        { cookie: jest.fn() } as unknown as Response,
      );

      // Assert
      expect(result.data[0].currentPermission).toEqual([]);
    });

    // Test case: memberships are loaded for the current user only, with
    // permission relations joined
    it('should load memberships for the current user with permission relations', async () => {
      // Arrange
      const query = {
        limit: 10,
        page: 1,
        sortBy: 'createdAt',
        sortOrder: SortOrder.DESC,
      };

      (mockWorkspaceRepository.query as jest.Mock).mockResolvedValueOnce(
        mockMultipleWorkspacesResult,
      );
      (mockWorkspaceMembersRepository.find as jest.Mock).mockResolvedValueOnce(
        [],
      );

      // Act
      await service.getWorkspaces(
        query,
        testUserContext,
        { headers: {} } as Request,
        { cookie: jest.fn() } as unknown as Response,
      );

      // Assert — find called with current user id + permission relations
      const findCall = (mockWorkspaceMembersRepository.find as jest.Mock).mock
        .calls[0][0];
      expect(findCall.where.user.id).toBe(testUserId);
      expect(findCall.relations).toEqual([
        'workspace',
        'memberPermissions',
        'memberPermissions.permission',
      ]);
    });
  });

  describe('permission groups', () => {
    it('should create a permission group', async () => {
      (mockPermissionRepository.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.createPermissionGroup(testWorkspaceId, {
        name: 'Viewer',
        permissions: ['group.read', 'target.read'],
      });

      expect(result).toEqual(
        expect.objectContaining({
          name: 'Viewer',
          permissions: ['group.read', 'target.read'],
          isSystem: false,
        }),
      );
      expect(mockPermissionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ workspace: { id: testWorkspaceId } }),
      );
    });

    it('should reject wildcard "*" for non-system groups', async () => {
      await expect(
        service.createPermissionGroup(testWorkspaceId, {
          name: 'Hacker',
          permissions: ['*'],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject a duplicate group name', async () => {
      (mockPermissionRepository.findOne as jest.Mock).mockResolvedValue({
        id: randomUUID(),
        name: 'Viewer',
      });

      await expect(
        service.createPermissionGroup(testWorkspaceId, {
          name: 'Viewer',
          permissions: ['group.read'],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should forbid modifying a system group', async () => {
      (mockPermissionRepository.findOne as jest.Mock).mockResolvedValue({
        id: randomUUID(),
        name: 'Admin',
        isSystem: true,
        permissions: ['*'],
      });

      await expect(
        service.updatePermissionGroup(testWorkspaceId, randomUUID(), {
          name: 'Renamed',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should forbid deleting a system group', async () => {
      (mockPermissionRepository.findOne as jest.Mock).mockResolvedValue({
        id: randomUUID(),
        name: 'Admin',
        isSystem: true,
        permissions: ['*'],
      });

      await expect(
        service.deletePermissionGroup(testWorkspaceId, randomUUID()),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('members', () => {
    const memberId = randomUUID();
    const anotherUserId = randomUUID();

    const makeMember = (overrides: Record<string, unknown> = {}) => ({
      id: memberId,
      user: { id: anotherUserId, name: 'Other', image: null },
      memberPermissions: [
        { permission: { isSystem: false, permissions: ['group.read'] } },
      ],
      ...overrides,
    });

    it('should aggregate permission keys across groups', async () => {
      (mockWorkspaceMembersRepository.findOne as jest.Mock).mockResolvedValue({
        memberPermissions: [
          { permission: { permissions: ['group.read'] } },
          { permission: { permissions: ['target.read', '*'] } },
        ],
      });

      const result = await service.getMembershipWithPermissions(
        testWorkspaceId,
        testUserId,
      );

      expect(result.permissionKeys.sort()).toEqual([
        '*',
        'group.read',
        'target.read',
      ]);
    });

    it('should throw NotFound for a non-member', async () => {
      (mockWorkspaceMembersRepository.findOne as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(
        service.getMembershipWithPermissions(testWorkspaceId, testUserId),
      ).rejects.toThrow('Workspace member not found');
    });

    it('should update member permissions', async () => {
      const permissionId = randomUUID();
      (mockWorkspaceMembersRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(makeMember())
        .mockResolvedValueOnce(makeMember());
      (mockPermissionRepository.find as jest.Mock).mockResolvedValue([
        { id: permissionId },
      ]);

      await service.updateMemberPermissions(
        testWorkspaceId,
        memberId,
        [permissionId],
        testUserId,
      );

      // Replacement happens inside a transaction via the manager
      expect(mockManager.delete).toHaveBeenCalledWith(
        WorkspaceMemberPermission,
        { member: { id: memberId } },
      );
      expect(mockManager.save).toHaveBeenCalledWith(
        WorkspaceMemberPermission,
        expect.objectContaining({
          member: { id: memberId },
          permission: { id: permissionId },
        }),
      );
    });

    it('should forbid modifying your own membership', async () => {
      (mockWorkspaceMembersRepository.findOne as jest.Mock).mockResolvedValue(
        makeMember({ user: { id: testUserId } }),
      );

      await expect(
        service.updateMemberPermissions(
          testWorkspaceId,
          memberId,
          [],
          testUserId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should forbid modifying the owner (system group holder)', async () => {
      (mockWorkspaceMembersRepository.findOne as jest.Mock).mockResolvedValue(
        makeMember({
          memberPermissions: [
            { permission: { isSystem: true, permissions: ['*'] } },
          ],
        }),
      );

      await expect(
        service.updateMemberPermissions(
          testWorkspaceId,
          memberId,
          [],
          testUserId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should forbid removing yourself', async () => {
      (mockWorkspaceMembersRepository.findOne as jest.Mock).mockResolvedValue(
        makeMember({ user: { id: testUserId } }),
      );

      await expect(
        service.removeMember(testWorkspaceId, memberId, testUserId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('invitations', () => {
    const inviteeEmail = 'invitee@example.com';
    const makeInvitation = (overrides: Record<string, unknown> = {}) => ({
      id: randomUUID(),
      workspace: { id: testWorkspaceId, name: 'Test Workspace' },
      invitedBy: { id: randomUUID() },
      email: inviteeEmail,
      permissionIds: [],
      tokenHash: 'x'.repeat(64),
      status: InvitationStatus.PENDING,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    });

    it('should invite existing users and skip unknown emails', async () => {
      (mockWorkspaceRepository.findOne as jest.Mock).mockResolvedValue({
        id: testWorkspaceId,
        name: 'Test Workspace',
      });
      mockManager.getRepository.mockReturnValue({
        find: jest.fn().mockResolvedValue([
          { id: testUserId, email: inviteeEmail },
        ]),
      });

      const result = await service.createInvitations(
        testWorkspaceId,
        testUserId,
        {
          emails: [inviteeEmail, 'nobody@example.com'],
          permissionIds: [],
        },
      );

      expect(result).toEqual({
        invited: [inviteeEmail],
        skipped: ['nobody@example.com'],
      });
      const saved = (mockManager.save as jest.Mock).mock.calls[0][1];
      expect(saved.tokenHash).toHaveLength(64);
      expect(saved.status).toBe(InvitationStatus.PENDING);
      expect(mockNotificationsService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipients: [testUserId],
          scope: 'SYSTEM',
          metadata: expect.objectContaining({
            token: expect.stringMatching(/^[0-9a-f]{64}$/),
            action: 'created',
          }),
        }),
      );
      expect(mockNotificationsService.createNotification).toHaveBeenCalledWith(
        expect.not.objectContaining({ workspaceId: expect.anything() }),
      );
    });

    it('should expire previous pending invitations on re-invite', async () => {
      (mockWorkspaceRepository.findOne as jest.Mock).mockResolvedValue({
        id: testWorkspaceId,
        name: 'Test Workspace',
      });
      mockManager.getRepository.mockReturnValue({
        find: jest.fn().mockResolvedValue([
          { id: testUserId, email: inviteeEmail },
        ]),
      });

      await service.createInvitations(testWorkspaceId, testUserId, {
        emails: [inviteeEmail],
        permissionIds: [],
      });

      expect(mockManager.update).toHaveBeenCalledWith(
        WorkspaceInvitation,
        {
          workspace: { id: testWorkspaceId },
          email: inviteeEmail,
          status: InvitationStatus.PENDING,
        },
        { status: InvitationStatus.EXPIRED },
      );
    });

    it('should skip emails of users who are already members', async () => {
      (mockWorkspaceRepository.findOne as jest.Mock).mockResolvedValue({
        id: testWorkspaceId,
        name: 'Test Workspace',
      });
      mockManager.getRepository.mockReturnValue({
        find: jest.fn().mockResolvedValue([
          { id: testUserId, email: inviteeEmail },
        ]),
      });
      (mockWorkspaceMembersRepository.find as jest.Mock).mockResolvedValue([
        { user: { id: testUserId } },
      ]);

      const result = await service.createInvitations(
        testWorkspaceId,
        testUserId,
        {
          emails: [inviteeEmail],
          permissionIds: [],
        },
      );

      expect(result).toEqual({ invited: [], skipped: [inviteeEmail] });
      expect(mockManager.save).not.toHaveBeenCalled();
    });

    it('should never grant system permission groups via invitations', async () => {
      (mockWorkspaceRepository.findOne as jest.Mock).mockResolvedValue({
        id: testWorkspaceId,
        name: 'Test Workspace',
      });
      mockManager.getRepository.mockReturnValue({
        find: jest.fn().mockResolvedValue([
          { id: testUserId, email: inviteeEmail },
        ]),
      });
      // filterValidPermissionIds returns only non-system groups
      (mockPermissionRepository.find as jest.Mock).mockResolvedValue([]);

      await service.createInvitations(testWorkspaceId, testUserId, {
        emails: [inviteeEmail],
        permissionIds: ['system-group-id'],
      });

      const saved = (mockManager.save as jest.Mock).mock.calls[0][1];
      expect(saved.permissionIds).toEqual([]);
      expect(mockPermissionRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isSystem: false }),
        }),
      );
    });

    it('should accept a valid invitation', async () => {
      (mockInvitationRepository.findOne as jest.Mock).mockResolvedValue(
        makeInvitation(),
      );

      const result = await service.acceptInvitation(
        'a'.repeat(64),
        { ...testUserContext, email: inviteeEmail },
      );

      expect(result).toEqual({ message: 'Invitation accepted successfully' });
      expect(mockManager.update).toHaveBeenCalledWith(
        WorkspaceInvitation,
        { id: expect.any(String), status: InvitationStatus.PENDING },
        { status: InvitationStatus.ACCEPTED },
      );
      expect(mockNotificationsService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            action: 'accepted',
            token: expect.any(String),
          }),
        }),
      );
    });

    it('should not remove existing permission groups on accept', async () => {
      (mockInvitationRepository.findOne as jest.Mock).mockResolvedValue(
        makeInvitation({ permissionIds: ['group-2'] }),
      );
      mockManager.getRepository
        .mockReturnValueOnce({
          findOne: jest.fn().mockResolvedValue({
            id: 'member-1',
          }),
        })
        .mockReturnValueOnce({
          find: jest.fn().mockResolvedValue([
            { permission: { id: 'group-1' } },
          ]),
        })
        .mockReturnValueOnce({
          find: jest.fn().mockResolvedValue([{ id: 'group-2' }]),
        });

      await service.acceptInvitation('a'.repeat(64), {
        ...testUserContext,
        email: inviteeEmail,
      });

      // Never wipes groups the member already holds (e.g. a system Admin group)
      expect(mockManager.delete).not.toHaveBeenCalledWith(
        WorkspaceMemberPermission,
        expect.anything(),
      );
      expect(mockManager.save).not.toHaveBeenCalledWith(
        WorkspaceMemberPermission,
        expect.objectContaining({ permission: { id: 'group-1' } }),
      );
      expect(mockManager.save).toHaveBeenCalledWith(
        WorkspaceMemberPermission,
        expect.objectContaining({ permission: { id: 'group-2' } }),
      );
    });

    it('should reject accept when the email does not match', async () => {
      (mockInvitationRepository.findOne as jest.Mock).mockResolvedValue(
        makeInvitation(),
      );

      await expect(
        service.acceptInvitation('a'.repeat(64), testUserContext),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject accept when the invitation is expired', async () => {
      (mockInvitationRepository.findOne as jest.Mock).mockResolvedValue(
        makeInvitation({
          expiresAt: new Date(Date.now() - 60_000),
        }),
      );

      await expect(
        service.acceptInvitation('a'.repeat(64), {
          ...testUserContext,
          email: inviteeEmail,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject accept when the token is already used', async () => {
      (mockInvitationRepository.findOne as jest.Mock).mockResolvedValue(
        makeInvitation({ status: InvitationStatus.ACCEPTED }),
      );

      await expect(
        service.acceptInvitation('a'.repeat(64), {
          ...testUserContext,
          email: inviteeEmail,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject a concurrent double accept', async () => {
      (mockInvitationRepository.findOne as jest.Mock).mockResolvedValue(
        makeInvitation(),
      );
      (mockManager.update as jest.Mock).mockResolvedValue({ affected: 0 });

      await expect(
        service.acceptInvitation('a'.repeat(64), {
          ...testUserContext,
          email: inviteeEmail,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should decline an invitation and notify the inviter', async () => {
      (mockInvitationRepository.findOne as jest.Mock).mockResolvedValue(
        makeInvitation(),
      );

      const result = await service.declineInvitation('a'.repeat(64), {
        ...testUserContext,
        email: inviteeEmail,
      });

      expect(result).toEqual({ message: 'Invitation declined successfully' });
      expect(mockInvitationRepository.update).toHaveBeenCalledWith(
        { id: expect.any(String), status: InvitationStatus.PENDING },
        { status: InvitationStatus.DECLINED },
      );
      expect(mockNotificationsService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ action: 'declined' }),
        }),
      );
    });

    it('should cancel a pending invitation by deleting it', async () => {
      (mockInvitationRepository.delete as jest.Mock).mockResolvedValue({
        affected: 1,
      });

      const result = await service.cancelInvitation(
        testWorkspaceId,
        randomUUID(),
      );

      expect(mockInvitationRepository.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.any(String),
          workspace: { id: testWorkspaceId },
          status: InvitationStatus.PENDING,
        }),
      );
      expect(result).toEqual({ message: 'Invitation cancelled successfully' });
    });

    it('should 404 when cancelling an already handled invitation', async () => {
      (mockInvitationRepository.delete as jest.Mock).mockResolvedValue({
        affected: 0,
      });

      await expect(
        service.cancelInvitation(testWorkspaceId, randomUUID()),
      ).rejects.toThrow('Invitation not found or already handled');
    });

    it('should only return pending invitations that have not expired', async () => {
      const futureExpiry = new Date(Date.now() + 60_000);
      const pendingInvitation = {
        ...makeInvitation({ expiresAt: futureExpiry }),
        toJSON: () => ({
          id: randomUUID(),
          email: inviteeEmail,
          permissionIds: [],
          status: InvitationStatus.PENDING,
          expiresAt: futureExpiry,
          createdAt: new Date(),
          updatedAt: new Date(),
          workspace: { id: testWorkspaceId, name: 'Test Workspace' },
          invitedBy: { id: randomUUID() },
        }),
      };
      (mockInvitationRepository.find as jest.Mock).mockResolvedValue([
        pendingInvitation,
      ]);

      const result = await service.listInvitations(testWorkspaceId);

      expect(mockInvitationRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: InvitationStatus.PENDING,
            expiresAt: expect.any(Object), // MoreThan operator
          }),
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe(InvitationStatus.PENDING);
    });

    it('should expose no secrets in the public preview', async () => {
      (mockInvitationRepository.findOne as jest.Mock).mockResolvedValue(
        makeInvitation(),
      );

      const result = await service.getInvitationPreview('a'.repeat(64));

      expect(result).toEqual(
        expect.objectContaining({
          workspaceId: testWorkspaceId,
          workspaceName: 'Test Workspace',
          email: inviteeEmail,
        }),
      );
      expect(JSON.stringify(result)).not.toContain('tokenHash');
    });
  });

  describe('seedOwnerPermissionGroup', () => {
    it('should create the system Admin group and assign it to the creator', async () => {
      const memberId = randomUUID();
      (mockWorkspaceMembersRepository.findOne as jest.Mock).mockResolvedValue({
        id: memberId,
      });

      await service.seedOwnerPermissionGroup(testWorkspaceId, testUserId);

      expect(mockPermissionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Admin',
          permissions: ['*'],
          isSystem: true,
        }),
      );
      expect(mockMemberPermissionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          member: { id: memberId },
        }),
      );
    });
  });

  describe('permission catalog', () => {
    it('should return resources with unique, valid domain.action keys and labels', () => {
      const catalog = service.getPermissionCatalog();

      expect(catalog.length).toBeGreaterThan(0);
      const keys = catalog.flatMap((resource) =>
        resource.actions.map((action) => `${resource.resource}.${action.action}`),
      );
      expect(keys.length).toBeGreaterThan(0);
      expect(new Set(keys).size).toBe(keys.length);
      for (const key of keys) {
        expect(key).toMatch(/^[a-z]+\.[a-z]+$/);
      }
      for (const resource of catalog) {
        for (const action of resource.actions) {
          expect(action.description.trim().length).toBeGreaterThan(0);
        }
      }
    });
  });
});
