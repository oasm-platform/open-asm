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
  let mockWorkflowsService: Partial<WorkflowsService>;
  let mockDataSource: Partial<DataSource>;
  let mockManager: any;
  let fixedTransactionalRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
  };

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
      findOne: jest.fn(),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockInvitationRepository = {
      save: jest.fn().mockImplementation((data: unknown) => Promise.resolve(data)),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      }),
    };

    fixedTransactionalRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation((data: unknown) => Promise.resolve(data)),
    };

    mockManager = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      save: jest.fn().mockImplementation((_entity: unknown, data?: unknown) =>
        Promise.resolve(data ?? _entity),
      ),
      create: jest.fn().mockImplementation((_entity: unknown, data: unknown) => data),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      getRepository: jest.fn().mockReturnValue(fixedTransactionalRepository),
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
      deleteByRef: jest.fn(),
    };

    mockWorkflowsService = {
      createDefaultWorkflows: jest.fn(),
    };

    const mockWorkspaceEncryptionService = {
      generateWrappedDEK: jest.fn().mockReturnValue('wrapped-dek'),
    };

    mockDataSource = {
      transaction: jest.fn((cb: (m: any) => unknown) => cb(mockManager)),
    };

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
          useValue: mockWorkflowsService,
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

    // Test case: response no longer includes currentPermission
    it('should not return currentPermission in the response', async () => {
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

      // Act
      const result = await service.getWorkspaces(
        query,
        testUserContext,
        { headers: {} } as Request,
        { cookie: jest.fn() } as unknown as Response,
      );

      // Assert
      expect(result.data[0]).not.toHaveProperty('currentPermission');
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

    // Test case: memberships are no longer batch-loaded for the list response
    it('should not load memberships for the workspaces list', async () => {
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

      // Act
      await service.getWorkspaces(
        query,
        testUserContext,
        { headers: {} } as Request,
        { cookie: jest.fn() } as unknown as Response,
      );

      // Assert — membership lookup no longer happens for the list
      expect(mockWorkspaceMembersRepository.find).not.toHaveBeenCalled();
    });
  });

  describe('permission groups', () => {
    const holderMembership = {
      memberPermissions: [
        { permission: { permissions: ['group.read', 'target.read'] } },
      ],
    };

    it('should create a permission group', async () => {
      (mockWorkspaceMembersRepository.findOne as jest.Mock).mockResolvedValue(
        holderMembership,
      );

      const result = await service.createPermissionGroup(
        testWorkspaceId,
        {
          name: 'Viewer',
          permissions: ['group.read', 'target.read'],
        },
        testUserId,
      );

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
        service.createPermissionGroup(
          testWorkspaceId,
          {
            name: 'Hacker',
            permissions: ['*'],
          },
          testUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject unknown permission keys not present in the catalog', async () => {
      (mockWorkspaceMembersRepository.findOne as jest.Mock).mockResolvedValue(
        holderMembership,
      );

      await expect(
        service.createPermissionGroup(
          testWorkspaceId,
          {
            name: 'Sneaky',
            permissions: ['group.read', 'target.own'],
          },
          testUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should forbid granting permission keys the creator does not hold', async () => {
      // Creator only holds group.read, tries to grant member.write too.
      (mockWorkspaceMembersRepository.findOne as jest.Mock).mockResolvedValue({
        memberPermissions: [{ permission: { permissions: ['group.read'] } }],
      });

      await expect(
        service.createPermissionGroup(
          testWorkspaceId,
          {
            name: 'Escalator',
            permissions: ['group.read', 'member.write'],
          },
          testUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow a wildcard holder to create any group', async () => {
      (mockWorkspaceMembersRepository.findOne as jest.Mock).mockResolvedValue({
        memberPermissions: [{ permission: { permissions: ['*'] } }],
      });

      const result = await service.createPermissionGroup(
        testWorkspaceId,
        {
          name: 'Power',
          permissions: ['member.write', 'workspace.write'],
        },
        testUserId,
      );

      expect(result).toEqual(
        expect.objectContaining({ name: 'Power', isSystem: false }),
      );
    });

    it('should reject a duplicate group name case-insensitively', async () => {
      (mockWorkspaceMembersRepository.findOne as jest.Mock).mockResolvedValue(
        holderMembership,
      );
      (mockPermissionRepository.find as jest.Mock).mockResolvedValue([
        { id: randomUUID(), name: 'viewer' },
      ]);

      await expect(
        service.createPermissionGroup(
          testWorkspaceId,
          {
            name: 'Viewer',
            permissions: ['group.read'],
          },
          testUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject a concurrent duplicate insert with 23505 as 400', async () => {
      (mockWorkspaceMembersRepository.findOne as jest.Mock).mockResolvedValue(
        holderMembership,
      );
      (mockPermissionRepository.save as jest.Mock).mockRejectedValue({
        code: '23505',
      });

      await expect(
        service.createPermissionGroup(
          testWorkspaceId,
          {
            name: 'Viewer',
            permissions: ['group.read'],
          },
          testUserId,
        ),
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
        }, testUserId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject an empty update body', async () => {
      (mockPermissionRepository.findOne as jest.Mock).mockResolvedValue({
        id: randomUUID(),
        name: 'Viewer',
        isSystem: false,
        permissions: ['group.read'],
      });

      await expect(
        service.updatePermissionGroup(testWorkspaceId, randomUUID(), {}, testUserId),
      ).rejects.toThrow(BadRequestException);
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

    describe('getCurrentPermission', () => {
      it('should return the union of permission keys for the member', async () => {
        (mockWorkspaceMembersRepository.findOne as jest.Mock).mockResolvedValue(
          {
            memberPermissions: [
              { permission: { permissions: ['group.read'] } },
              { permission: { permissions: ['target.read', '*'] } },
            ],
          },
        );

        const result = await service.getCurrentPermission(
          testWorkspaceId,
          testUserId,
        );

        expect(result.currentPermission.sort()).toEqual([
          '*',
          'group.read',
          'target.read',
        ]);
      });

      it('should return an empty list when membership has no permission groups', async () => {
        (mockWorkspaceMembersRepository.findOne as jest.Mock).mockResolvedValue(
          {
            memberPermissions: [],
          },
        );

        const result = await service.getCurrentPermission(
          testWorkspaceId,
          testUserId,
        );

        expect(result).toEqual({ currentPermission: [] });
      });

      it('should throw NotFound for a non-member', async () => {
        (mockWorkspaceMembersRepository.findOne as jest.Mock).mockResolvedValue(
          null,
        );

        await expect(
          service.getCurrentPermission(testWorkspaceId, testUserId),
        ).rejects.toThrow('Workspace member not found');
      });
    });

    it('should update member permissions', async () => {
      const permissionId = randomUUID();
      (mockWorkspaceMembersRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(makeMember())
        .mockResolvedValueOnce(makeMember())
        .mockResolvedValueOnce({
          memberPermissions: [
            { permission: { permissions: ['group.read'] } },
          ],
        });
      (mockPermissionRepository.find as jest.Mock).mockResolvedValue([
        { id: permissionId, permissions: ['group.read'] },
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

    it('should reject an empty permission list instead of stripping permissions', async () => {
      await expect(
        service.updateMemberPermissions(
          testWorkspaceId,
          memberId,
          [],
          testUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject unknown permission group ids instead of silently dropping them', async () => {
      const validId = randomUUID();
      const unknownId = randomUUID();
      (mockWorkspaceMembersRepository.findOne as jest.Mock).mockResolvedValue(
        makeMember(),
      );
      (mockPermissionRepository.find as jest.Mock).mockResolvedValue([
        { id: validId, permissions: ['group.read'] },
      ]);

      await expect(
        service.updateMemberPermissions(
          testWorkspaceId,
          memberId,
          [validId, unknownId],
          testUserId,
        ),
      ).rejects.toThrow(BadRequestException);
      // No replacement happened — no silent partial write.
      expect(mockManager.delete).not.toHaveBeenCalled();
    });

    it('should forbid assigning a group whose keys the assigner does not hold', async () => {
      const powerfulGroupId = randomUUID();
      (mockWorkspaceMembersRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(makeMember())
        .mockResolvedValueOnce({
          // Assigner only holds group.read
          memberPermissions: [
            { permission: { permissions: ['group.read'] } },
          ],
        });
      (mockPermissionRepository.find as jest.Mock).mockResolvedValue([
        {
          id: powerfulGroupId,
          name: 'Powerful',
          permissions: ['member.write'],
        },
      ]);

      await expect(
        service.updateMemberPermissions(
          testWorkspaceId,
          memberId,
          [powerfulGroupId],
          testUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should forbid modifying your own membership', async () => {
      (mockWorkspaceMembersRepository.findOne as jest.Mock).mockResolvedValue(
        makeMember({ user: { id: testUserId } }),
      );

      await expect(
        service.updateMemberPermissions(
          testWorkspaceId,
          memberId,
          [randomUUID()],
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
          [randomUUID()],
          testUserId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should forbid modifying the owner even when the system group is missing', async () => {
      // Simulates a workspace whose seeding failed: the owner holds no Admin
      // group, but the workspace.ownerId still matches the member.
      (mockWorkspaceMembersRepository.findOne as jest.Mock).mockResolvedValue(
        makeMember({ memberPermissions: [] }),
      );
      (mockWorkspaceRepository.findOne as jest.Mock).mockResolvedValue({
        id: testWorkspaceId,
        owner: { id: anotherUserId },
      });

      await expect(
        service.updateMemberPermissions(
          testWorkspaceId,
          memberId,
          [randomUUID()],
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

    // The inviter holds "*" (Admin) so the privilege-subset guard passes.
    const stubWildcardInviter = () => {
      (mockWorkspaceMembersRepository.findOne as jest.Mock).mockResolvedValue({
        memberPermissions: [{ permission: { permissions: ['*'] } }],
      });
    };

    it('should invite existing users and skip unknown emails', async () => {
      (mockWorkspaceRepository.findOne as jest.Mock).mockResolvedValue({
        id: testWorkspaceId,
        name: 'Test Workspace',
      });
      stubWildcardInviter();
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

      expect(result).toEqual({ invited: 1, skipped: 1 });
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
      stubWildcardInviter();
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
      stubWildcardInviter();
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

      expect(result).toEqual({ invited: 0, skipped: 1 });
      expect(mockManager.save).not.toHaveBeenCalled();
    });

    it('should never grant system permission groups via invitations', async () => {
      (mockWorkspaceRepository.findOne as jest.Mock).mockResolvedValue({
        id: testWorkspaceId,
        name: 'Test Workspace',
      });
      stubWildcardInviter();
      mockManager.getRepository.mockReturnValue({
        find: jest.fn().mockResolvedValue([
          { id: testUserId, email: inviteeEmail },
        ]),
      });
      // findValidPermissionGroups returns only non-system groups
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

    it('should reject inviting into an archived workspace', async () => {
      (mockWorkspaceRepository.findOne as jest.Mock).mockResolvedValue({
        id: testWorkspaceId,
        name: 'Archived',
        archivedAt: new Date(),
      });
      stubWildcardInviter();

      await expect(
        service.createInvitations(testWorkspaceId, testUserId, {
          emails: [inviteeEmail],
          permissionIds: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should forbid inviting with a group whose keys the inviter does not hold', async () => {
      (mockWorkspaceRepository.findOne as jest.Mock).mockResolvedValue({
        id: testWorkspaceId,
        name: 'Test Workspace',
      });
      // Inviter only holds group.read, group grants member.write
      (mockWorkspaceMembersRepository.findOne as jest.Mock).mockResolvedValue({
        memberPermissions: [{ permission: { permissions: ['group.read'] } }],
      });
      (mockPermissionRepository.find as jest.Mock).mockResolvedValue([
        { id: randomUUID(), name: 'Powerful', permissions: ['member.write'] },
      ]);

      await expect(
        service.createInvitations(testWorkspaceId, testUserId, {
          emails: [inviteeEmail],
          permissionIds: ['powerful-group'],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should still succeed when the invite notification fails to enqueue', async () => {
      (mockWorkspaceRepository.findOne as jest.Mock).mockResolvedValue({
        id: testWorkspaceId,
        name: 'Test Workspace',
      });
      stubWildcardInviter();
      mockManager.getRepository.mockReturnValue({
        find: jest.fn().mockResolvedValue([
          { id: testUserId, email: inviteeEmail },
        ]),
      });
      (mockNotificationsService.createNotification as jest.Mock).mockRejectedValue(
        new Error('queue down'),
      );

      const result = await service.createInvitations(testWorkspaceId, testUserId, {
        emails: [inviteeEmail],
        permissionIds: [],
      });

      expect(result).toEqual({ invited: 1, skipped: 0 });
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
          }),
        }),
      );
    });

    it('should reuse the existing membership when a concurrent accept wins the unique-constraint race', async () => {
      (mockInvitationRepository.findOne as jest.Mock).mockResolvedValue(
        makeInvitation(),
      );
      const existingMember = { id: randomUUID() };
      const memberRepo = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(existingMember),
        save: jest.fn().mockRejectedValue({ code: '23505' }),
      };
      const permissionRepo = { find: jest.fn().mockResolvedValue([]) };
      const groupRepo = { find: jest.fn().mockResolvedValue([]) };
      mockManager.getRepository
        .mockReturnValueOnce(memberRepo)
        .mockReturnValueOnce(permissionRepo)
        .mockReturnValueOnce(groupRepo);

      const result = await service.acceptInvitation('a'.repeat(64), {
        ...testUserContext,
        email: inviteeEmail,
      });

      expect(result).toEqual({ message: 'Invitation accepted successfully' });
      expect(memberRepo.save).toHaveBeenCalledTimes(1);
      expect(memberRepo.findOne).toHaveBeenCalledTimes(2);
      expect(
        mockNotificationsService.createNotification,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ action: 'accepted' }),
        }),
      );
    });

    it('should reject accepting into an archived workspace', async () => {
      (mockInvitationRepository.findOne as jest.Mock).mockResolvedValue(
        makeInvitation({
          workspace: {
            id: testWorkspaceId,
            name: 'Archived',
            archivedAt: new Date(),
          },
        }),
      );

      await expect(
        service.acceptInvitation('a'.repeat(64), {
          ...testUserContext,
          email: inviteeEmail,
        }),
      ).rejects.toThrow(BadRequestException);
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

    it('should reject accept for a cancelled invitation', async () => {
      (mockInvitationRepository.findOne as jest.Mock).mockResolvedValue(
        makeInvitation({ status: InvitationStatus.CANCELLED }),
      );

      await expect(
        service.acceptInvitation('a'.repeat(64), {
          ...testUserContext,
          email: inviteeEmail,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject accept for an expired (persisted) invitation', async () => {
      (mockInvitationRepository.findOne as jest.Mock).mockResolvedValue(
        makeInvitation({ status: InvitationStatus.EXPIRED }),
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

    it('should cancel a pending invitation by setting status to CANCELLED', async () => {
      const result = await service.cancelInvitation(
        testWorkspaceId,
        randomUUID(),
      );

      expect(mockInvitationRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.any(String),
          workspace: { id: testWorkspaceId },
          status: InvitationStatus.PENDING,
        }),
        { status: InvitationStatus.CANCELLED },
      );
      expect(mockInvitationRepository.delete).not.toHaveBeenCalled();
      expect(result).toEqual({ message: 'Invitation cancelled successfully' });
    });

    it('should 404 when cancelling an already handled invitation', async () => {
      (mockInvitationRepository.update as jest.Mock).mockResolvedValue({
        affected: 0,
      });

      await expect(
        service.cancelInvitation(testWorkspaceId, randomUUID()),
      ).rejects.toThrow('Invitation not found or already handled');
    });

    it('should persist the EXPIRED status for due invitations before listing', async () => {
      (mockInvitationRepository.find as jest.Mock).mockResolvedValue([]);

      await service.listInvitations(testWorkspaceId);

      // Expiry sweep ran first: UPDATE ... SET status=EXPIRED WHERE PENDING and expired
      const qb = (mockInvitationRepository.createQueryBuilder as jest.Mock)
        .mock.results[0].value;
      expect(qb.set).toHaveBeenCalledWith({
        status: InvitationStatus.EXPIRED,
      });
      expect(mockInvitationRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: expect.anything(),
          }),
        }),
      );
    });

    it('should list pending plus expired/cancelled invitations (resend history)', async () => {
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
            status: expect.anything(),
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

    it('should report a persisted EXPIRED status in the preview', async () => {
      (mockInvitationRepository.findOne as jest.Mock).mockResolvedValue(
        makeInvitation({ status: InvitationStatus.EXPIRED }),
      );

      const result = await service.getInvitationPreview('a'.repeat(64));

      expect(result.status).toBe(InvitationStatus.EXPIRED);
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

    it('should be idempotent when the Admin group already exists', async () => {
      const memberId = randomUUID();
      const adminGroup = { id: randomUUID(), name: 'Admin' };
      (mockPermissionRepository.findOne as jest.Mock).mockResolvedValue(
        adminGroup,
      );
      (mockWorkspaceMembersRepository.findOne as jest.Mock).mockResolvedValue({
        id: memberId,
      });
      (mockMemberPermissionRepository.findOne as jest.Mock).mockResolvedValue({
        id: randomUUID(),
      });

      const result = await service.seedOwnerPermissionGroup(
        testWorkspaceId,
        testUserId,
      );

      expect(mockPermissionRepository.save).not.toHaveBeenCalled();
      expect(mockMemberPermissionRepository.save).not.toHaveBeenCalled();
      expect(result).toBe(adminGroup);
    });
  });

  describe('createWorkspace', () => {
    it('should create the workspace, membership and Admin group in one transaction', async () => {
      (mockWorkspaceRepository.count as jest.Mock).mockResolvedValue(0);
      (mockWorkspaceRepository.findOne as jest.Mock).mockResolvedValue({
        id: 'ws-1',
        name: 'New Workspace',
      });

      const result = await service.createWorkspace(
        { name: 'New Workspace' },
        testUserContext,
      );

      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(fixedTransactionalRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New Workspace' }),
      );
      // Admin group seeded inside the same transaction
      expect(fixedTransactionalRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Admin',
          permissions: ['*'],
          isSystem: true,
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({ name: 'New Workspace' }),
      );
    });

    it('should roll back the whole workspace creation when seeding fails', async () => {
      (mockWorkspaceRepository.count as jest.Mock).mockResolvedValue(0);
      fixedTransactionalRepository.save.mockRejectedValueOnce(
        new Error('seed failure'),
      );

      await expect(
        service.createWorkspace({ name: 'Broken' }, testUserContext),
      ).rejects.toThrow('seed failure');

      // The transaction was started — a partial workspace + missing Admin
      // group can no longer be left behind.
      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(mockWorkflowsService.createDefaultWorkflows).not.toHaveBeenCalled();
    });

    it('should enforce the workspace creation limit', async () => {
      (mockWorkspaceRepository.count as jest.Mock).mockResolvedValue(5);

      await expect(
        service.createWorkspace({ name: 'Too Many' }, testUserContext),
      ).rejects.toThrow('limit');
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

  describe('getWorkspaceById', () => {
    const workspaceWithMembers = {
      id: testWorkspaceId,
      name: 'Test',
      owner: { id: testUserId },
      workspaceMembers: [{ user: { id: randomUUID() } }],
    };

    const stubMemberAndWorkspace = () => {
      (mockWorkspaceMembersRepository.findOne as jest.Mock).mockResolvedValue({
        id: 'member-1',
      });
      (mockWorkspaceRepository.findOne as jest.Mock).mockResolvedValue({
        ...workspaceWithMembers,
        // Fresh array so the delete-based gating never mutates the fixture.
        workspaceMembers: [{ user: { id: randomUUID() } }],
      });
    };

    it('should omit workspaceMembers when the requester lacks member.read', async () => {
      stubMemberAndWorkspace();

      const result = await service.getWorkspaceById(testWorkspaceId, testUserContext, [
        'workspace.read',
      ]);

      expect(result).not.toHaveProperty('workspaceMembers');
    });

    it('should include workspaceMembers for member.read holders', async () => {
      stubMemberAndWorkspace();

      const result = await service.getWorkspaceById(testWorkspaceId, testUserContext, [
        'member.read',
      ]);

      expect(result).toHaveProperty('workspaceMembers');
    });

    it('should include workspaceMembers for wildcard holders', async () => {
      stubMemberAndWorkspace();

      const result = await service.getWorkspaceById(testWorkspaceId, testUserContext, [
        '*',
      ]);

      expect(result).toHaveProperty('workspaceMembers');
    });

    it('should keep including members when permissions are not provided', async () => {
      stubMemberAndWorkspace();

      const result = await service.getWorkspaceById(testWorkspaceId, testUserContext);

      expect(result).toHaveProperty('workspaceMembers');
    });
  });
});
