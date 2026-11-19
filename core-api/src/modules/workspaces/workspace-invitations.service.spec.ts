import { Role } from '@/common/enums/enum';
import { InvalidInputError } from '@/common/errors/domain.errors';
import { InvitationStatus } from '@/modules/workspaces/enums/workspace.enums';
import { randomUUID } from 'crypto';
import type { DataSource, Repository } from 'typeorm';
import type { AuditService } from '../audit/audit.service';
import type { NotificationsService } from '../notifications/notifications.service';
import { WorkspaceInvitation } from './entities/workspace-invitation.entity';
import { WorkspaceMemberPermission } from './entities/workspace-member-permission.entity';
import type { WorkspaceMembers } from './entities/workspace-members.entity';
import type { WorkspacePermission } from './entities/workspace-permission.entity';
import type { Workspace } from './entities/workspace.entity';
import { WorkspaceInvitationsService } from './workspace-invitations.service';
import { WorkspaceMembershipService } from './workspace-membership.service';
import { WorkspacePermissionGroupsService } from './workspace-permission-groups.service';

describe('WorkspaceInvitationsService', () => {
  let service: WorkspaceInvitationsService;
  let mockWorkspaceRepository: Partial<Repository<Workspace>>;
  let mockWorkspaceMembersRepository: Partial<Repository<WorkspaceMembers>>;
  let mockPermissionRepository: Partial<Repository<WorkspacePermission>>;
  let mockInvitationRepository: Partial<Repository<WorkspaceInvitation>>;
  let mockNotificationsService: Partial<NotificationsService>;
  let mockManager: any;

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

  beforeEach(() => {
    mockWorkspaceRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      update: jest.fn(),
    };

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

    const fixedTransactionalRepository = {
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
    // Invitees are looked up through the workspace repository's manager
    mockWorkspaceRepository.manager = {
      ...mockManager,
      transaction: jest.fn((cb: (m: unknown) => unknown) => cb(mockManager)),
    };

    mockNotificationsService = {
      createNotification: jest.fn(),
      deleteByRef: jest.fn(),
    };

    const dataSource = {
      transaction: jest.fn((cb: (m: unknown) => unknown) => cb(mockManager)),
    } as unknown as DataSource;
    const membership = new WorkspaceMembershipService(
      mockWorkspaceMembersRepository as Repository<WorkspaceMembers>,
    );

    service = new WorkspaceInvitationsService(
      dataSource,
      mockWorkspaceRepository as Repository<Workspace>,
      mockWorkspaceMembersRepository as Repository<WorkspaceMembers>,
      mockInvitationRepository as Repository<WorkspaceInvitation>,
      mockNotificationsService as NotificationsService,
      membership,
      // Real: which groups an invite may carry, and whether the inviter holds them
      new WorkspacePermissionGroupsService(
        dataSource,
        mockPermissionRepository as Repository<WorkspacePermission>,
        mockWorkspaceMembersRepository as Repository<WorkspaceMembers>,
        {} as Repository<WorkspaceMemberPermission>,
        {} as AuditService,
        membership,
      ),
    );
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
});
