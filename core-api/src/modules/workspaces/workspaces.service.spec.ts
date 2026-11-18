import { SortOrder } from '@/common/dtos/get-many-base.dto';
import { Role } from '@/common/enums/enum';
import { InvitationStatus } from '@/modules/workspaces/enums/workspace.enums';

import type { TestingModule } from '@nestjs/testing';
import type { NodeRequest, NodeResponse } from '@nestjs/platform-node';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import type { Repository } from 'typeorm';
import { DataSource } from 'typeorm';
import { WorkspaceEncryptionService } from '@/services/workspace-encryption/workspace-encryption.service';
import { ApiKeysService } from '../apikeys/apikeys.service';
import { ArtifactsService } from '../artifacts/artifacts.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  WORKSPACE_DELETING_EVENT,
  WORKSPACE_INITIALIZING_EVENT,
} from './workspace.events';
import { WorkspaceInvitation } from './entities/workspace-invitation.entity';
import { WorkspaceMemberPermission } from './entities/workspace-member-permission.entity';
import { WorkspaceMembers } from './entities/workspace-members.entity';
import { WorkspacePermission } from './entities/workspace-permission.entity';
import { Workspace } from './entities/workspace.entity';
import { WorkspaceMembershipService } from './workspace-membership.service';
import { WorkspacePermissionGroupsService } from './workspace-permission-groups.service';
import { WorkspacesService } from './workspaces.service';
import { InvalidInputError } from '@/common/errors/domain.errors';

describe('WorkspacesService', () => {
  let service: WorkspacesService;
  let mockWorkspaceRepository: Partial<Repository<Workspace>>;
  let mockWorkspaceMembersRepository: Partial<Repository<WorkspaceMembers>>;
  let mockPermissionRepository: Partial<Repository<WorkspacePermission>>;
  let mockMemberPermissionRepository: Partial<Repository<WorkspaceMemberPermission>>;
  let mockInvitationRepository: Partial<Repository<WorkspaceInvitation>>;
  let mockApiKeysService: Partial<ApiKeysService>;
  let mockNotificationsService: Partial<NotificationsService>;
  let mockEvents: { emitAsync: jest.Mock };
  let mockAuditService: {
    recordInTx: jest.Mock;
    pseudonymizeActor: jest.Mock;
    buildActorContext: jest.Mock;
  };
  let mockDataSource: Partial<DataSource>;
  let mockArtifactsService: {
    deleteWorkspaceObjects: jest.Mock;
  };
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

    mockEvents = { emitAsync: jest.fn().mockResolvedValue([]) };

    mockAuditService = {
      recordInTx: jest.fn().mockResolvedValue({ id: randomUUID() }),
      pseudonymizeActor: jest.fn().mockResolvedValue(undefined),
      buildActorContext: jest.fn(),
    };

    const mockWorkspaceEncryptionService = {
      generateWrappedDEK: jest.fn().mockReturnValue('wrapped-dek'),
    };

    mockArtifactsService = {
      deleteWorkspaceObjects: jest.fn().mockResolvedValue(undefined),
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
          provide: EventEmitter2,
          useValue: mockEvents,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: WorkspaceEncryptionService,
          useValue: mockWorkspaceEncryptionService,
        },
        {
          provide: ArtifactsService,
          useValue: mockArtifactsService,
        },
        // Real: the guard-facing lookup the grant checks go through
        WorkspaceMembershipService,
        // Real: seeds the Admin group at creation, checks grants of members/invites
        WorkspacePermissionGroupsService,
      ],
    }).compile();

    service = module.get<WorkspacesService>(WorkspacesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('answers the guard through WorkspaceMembershipService', async () => {
    (mockWorkspaceMembersRepository.findOne as jest.Mock).mockResolvedValue({
      memberPermissions: [{ permission: { permissions: ['project.read'] } }],
    });

    const result = await service.getMembershipWithPermissions(
      testWorkspaceId,
      testUserId,
    );

    expect(result.permissionKeys).toEqual(['project.read']);
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
      const result = await service.getWorkspaces(query, testUserContext, { headers: {} } as NodeRequest, { cookie: jest.fn() } as unknown as NodeResponse);

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
      const result = await service.getWorkspaces(query, testUserContext, { headers: {} } as NodeRequest, { cookie: jest.fn() } as unknown as NodeResponse);

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
      const result = await service.getWorkspaces(query, testUserContext, { headers: {} } as NodeRequest, { cookie: jest.fn() } as unknown as NodeResponse);

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
      const result = await service.getWorkspaces(query, testUserContext, { headers: {} } as NodeRequest, { cookie: jest.fn() } as unknown as NodeResponse);

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
      const result = await service.getWorkspaces(query, testUserContext, { headers: {} } as NodeRequest, { cookie: jest.fn() } as unknown as NodeResponse);

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
      const result = await service.getWorkspaces(query, testUserContext, { headers: {} } as NodeRequest, { cookie: jest.fn() } as unknown as NodeResponse);

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
      const result = await service.getWorkspaces(query, testUserContext, { headers: {} } as NodeRequest, { cookie: jest.fn() } as unknown as NodeResponse);

      // Assert
      expect(result).toBeDefined();
      // The allowlist map rejects 'invalidField' → falls back to 'createdAt'.
      const sqlQuery = (mockWorkspaceRepository.query as jest.Mock).mock
        .calls[0][0] as string;
      expect(sqlQuery).toContain('ORDER BY w."createdAt" DESC');
      // And the invalid column name must never be interpolated into the SQL.
      expect(sqlQuery).not.toContain('invalidField');
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
      const result = await service.getWorkspaces(query, testUserContext, { headers: {} } as NodeRequest, { cookie: jest.fn() } as unknown as NodeResponse);

      // Assert
      expect(result).toBeDefined();
      // Only SortOrder.ASC maps to ASC; anything else (including garbage)
      // falls back to DESC.
      const sqlQuery = (mockWorkspaceRepository.query as jest.Mock).mock
        .calls[0][0] as string;
      expect(sqlQuery).toContain('ORDER BY w."createdAt" DESC');
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
      const result = await service.getWorkspaces(query, testUserContext, { headers: {} } as NodeRequest, { cookie: jest.fn() } as unknown as NodeResponse);

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
        { headers: {} } as NodeRequest,
        { cookie: jest.fn() } as unknown as NodeResponse,
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
        { headers: {} } as NodeRequest,
        { cookie: jest.fn() } as unknown as NodeResponse,
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
        { headers: {} } as NodeRequest,
        { cookie: jest.fn() } as unknown as NodeResponse,
      );

      // Assert — membership lookup no longer happens for the list
      expect(mockWorkspaceMembersRepository.find).not.toHaveBeenCalled();
    });
  });

  describe('audit wiring — explicit events (M4.1)', () => {
    // The controller passes this into the service (built via
    // AuditService.buildActorContext(req)); the service must never call
    // buildActorContext itself.
    const auditContext = {
      actorId: testUserId,
      actorType: 'user',
      actorName: 'Test User',
      actorEmail: 'test@example.com',
      sourceIp: '203.0.113.7',
      userAgent: 'agent',
      requestId: 'req-1',
    };

    it('deleteWorkspace records workspace.deleted in the same tx as the workspace delete', async () => {
      (mockWorkspaceRepository.findOne as jest.Mock).mockResolvedValue({
        id: testWorkspaceId,
        name: 'Doomed',
      });
      const result = await service.deleteWorkspace(
        testWorkspaceId,
        testUserContext,
        auditContext,
      );

      expect(result).toEqual({ message: 'Workspace deleted successfully' });
      // Other modules remove their rows first (targets: its own tx)
      expect(mockEvents.emitAsync).toHaveBeenCalledWith(
        WORKSPACE_DELETING_EVENT,
        { workspaceId: testWorkspaceId },
      );
      expect(mockEvents.emitAsync.mock.invocationCallOrder[0]).toBeLessThan(
        mockDataSource.transaction.mock.invocationCallOrder[0],
      );
      expect(mockManager.delete).toHaveBeenCalledWith(Workspace, {
        id: testWorkspaceId,
      });
      expect(mockArtifactsService.deleteWorkspaceObjects).toHaveBeenCalledWith(
        testWorkspaceId,
      );
      expect(mockAuditService.recordInTx).toHaveBeenCalledTimes(1);
      expect(mockAuditService.recordInTx).toHaveBeenCalledWith(
        mockManager,
        expect.objectContaining({
          workspaceId: testWorkspaceId,
          action: 'workspace.deleted',
          resourceType: 'workspace',
          resourceId: testWorkspaceId,
          changes: { name: { before: 'Doomed' } },
          actorId: testUserId,
          actorName: 'Test User',
        }),
      );
    });

    it('deleteWorkspace keeps the workspace when a module fails to remove its rows', async () => {
      (mockWorkspaceRepository.findOne as jest.Mock).mockResolvedValue({
        id: testWorkspaceId,
        name: 'Doomed',
      });
      mockEvents.emitAsync.mockRejectedValueOnce(new Error('targets delete failed'));

      await expect(
        service.deleteWorkspace(testWorkspaceId, testUserContext, auditContext),
      ).rejects.toThrow('targets delete failed');

      expect(mockManager.delete).not.toHaveBeenCalled();
      expect(mockAuditService.recordInTx).not.toHaveBeenCalled();
    });

    it('deleteWorkspace rolls back when the audit write fails mid-transaction (no success response, no committed state)', async () => {
      (mockWorkspaceRepository.findOne as jest.Mock).mockResolvedValue({
        id: testWorkspaceId,
        name: 'Doomed',
      });
      (mockAuditService.recordInTx).mockRejectedValueOnce(
        new Error('audit write failed'),
      );

      await expect(
        service.deleteWorkspace(testWorkspaceId, testUserContext, auditContext),
      ).rejects.toThrow('audit write failed');

      // The transaction callback rejected → in production the tx rolls back
      // the workspace delete. Here we verify the failure propagates (the
      // service must not swallow it and must not report success) and that the
      // audit row was attempted only inside the same failed tx.
      expect(mockManager.delete).toHaveBeenCalledWith(Workspace, {
        id: testWorkspaceId,
      });
      expect(mockAuditService.recordInTx).toHaveBeenCalledTimes(1);
    });

    it('deleteWorkspace propagates a workspace-delete failure and never writes the audit row', async () => {
      (mockWorkspaceRepository.findOne as jest.Mock).mockResolvedValue({
        id: testWorkspaceId,
        name: 'Doomed',
      });
      (mockManager.delete as jest.Mock).mockRejectedValueOnce(
        new Error('workspace delete failed'),
      );

      await expect(
        service.deleteWorkspace(testWorkspaceId, testUserContext, auditContext),
      ).rejects.toThrow('workspace delete failed');

      expect(mockAuditService.recordInTx).not.toHaveBeenCalled();
      // The rows survived, so their files must too.
      expect(mockArtifactsService.deleteWorkspaceObjects).not.toHaveBeenCalled();
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
      ).rejects.toThrow(InvalidInputError);
    });

    it('should forbid inviting with a group whose keys the inviter does not hold', async () => {
      (mockWorkspaceRepository.findOne as jest.Mock).mockResolvedValue({
        id: testWorkspaceId,
        name: 'Test Workspace',
      });
      // Inviter only holds project.read, group grants member.write
      (mockWorkspaceMembersRepository.findOne as jest.Mock).mockResolvedValue({
        memberPermissions: [{ permission: { permissions: ['project.read'] } }],
      });
      (mockPermissionRepository.find as jest.Mock).mockResolvedValue([
        { id: randomUUID(), name: 'Powerful', permissions: ['member.write'] },
      ]);

      await expect(
        service.createInvitations(testWorkspaceId, testUserId, {
          emails: [inviteeEmail],
          permissionIds: ['powerful-group'],
        }),
      ).rejects.toThrow(InvalidInputError);
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
      ).rejects.toThrow(InvalidInputError);
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
      ).rejects.toThrow(InvalidInputError);
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
      ).rejects.toThrow(InvalidInputError);
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
      ).rejects.toThrow(InvalidInputError);
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
      ).rejects.toThrow(InvalidInputError);
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
      ).rejects.toThrow(InvalidInputError);
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
      ).rejects.toThrow(InvalidInputError);
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

    it('should list only pending invitations', async () => {
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
          }),
        }),
      );
      // No expiry sweep needed anymore — only PENDING rows are listed.
      expect(mockInvitationRepository.createQueryBuilder).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe(InvitationStatus.PENDING);
    });

    it('should exclude expired/cancelled invitations from the list', async () => {
      (mockInvitationRepository.find as jest.Mock).mockResolvedValue([]);

      const result = await service.listInvitations(testWorkspaceId);

      expect(mockInvitationRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: InvitationStatus.PENDING,
          }),
        }),
      );
      expect(result).toEqual([]);
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

    it('lets other modules add their defaults once the workspace is committed', async () => {
      (mockWorkspaceRepository.count as jest.Mock).mockResolvedValue(0);
      (mockWorkspaceRepository.findOne as jest.Mock).mockResolvedValue({
        id: 'ws-new',
        name: 'New Workspace',
      });

      await service.createWorkspace({ name: 'New Workspace' }, testUserContext);

      expect(mockEvents.emitAsync).toHaveBeenCalledWith(
        WORKSPACE_INITIALIZING_EVENT,
        { workspaceId: expect.any(String) as string },
      );
      expect(mockDataSource.transaction.mock.invocationCallOrder[0]).toBeLessThan(
        mockEvents.emitAsync.mock.invocationCallOrder[0],
      );
    });

    it('fails the creation when adding the defaults fails', async () => {
      (mockWorkspaceRepository.count as jest.Mock).mockResolvedValue(0);
      mockEvents.emitAsync.mockRejectedValue(new Error('templates unreadable'));

      await expect(
        service.createWorkspace({ name: 'New Workspace' }, testUserContext),
      ).rejects.toThrow('templates unreadable');
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
      expect(mockEvents.emitAsync).not.toHaveBeenCalled();
    });

    it('should enforce the workspace creation limit', async () => {
      (mockWorkspaceRepository.count as jest.Mock).mockResolvedValue(5);

      await expect(
        service.createWorkspace({ name: 'Too Many' }, testUserContext),
      ).rejects.toThrow('limit');
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
