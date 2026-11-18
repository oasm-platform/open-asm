import { ForbiddenError, InvalidInputError } from '@/common/errors/domain.errors';
import { randomUUID } from 'crypto';
import type { DataSource, Repository } from 'typeorm';
import type { AuditService } from '../audit/audit.service';
import { WorkspaceMemberPermission } from './entities/workspace-member-permission.entity';
import { WorkspaceMembers } from './entities/workspace-members.entity';
import type { WorkspacePermission } from './entities/workspace-permission.entity';
import type { Workspace } from './entities/workspace.entity';
import { WorkspaceMembersService } from './workspace-members.service';
import { WorkspaceMembershipService } from './workspace-membership.service';
import { WorkspacePermissionGroupsService } from './workspace-permission-groups.service';

describe('WorkspaceMembersService', () => {
  let service: WorkspaceMembersService;
  let mockWorkspaceRepository: Partial<Repository<Workspace>>;
  let mockWorkspaceMembersRepository: Partial<Repository<WorkspaceMembers>>;
  let mockPermissionRepository: Partial<Repository<WorkspacePermission>>;
  let mockAuditService: { recordInTx: jest.Mock; pseudonymizeActor: jest.Mock };
  let mockManager: { save: jest.Mock; delete: jest.Mock };

  const testUserId = randomUUID();
  const testWorkspaceId = randomUUID();

  beforeEach(() => {
    mockWorkspaceRepository = { findOne: jest.fn() };

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

    mockManager = {
      save: jest.fn().mockImplementation((_entity: unknown, data?: unknown) =>
        Promise.resolve(data ?? _entity),
      ),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockAuditService = {
      recordInTx: jest.fn().mockResolvedValue({ id: randomUUID() }),
      pseudonymizeActor: jest.fn().mockResolvedValue(undefined),
    };

    const dataSource = {
      transaction: jest.fn((cb: (m: unknown) => unknown) => cb(mockManager)),
    } as unknown as DataSource;
    const membership = new WorkspaceMembershipService(
      mockWorkspaceMembersRepository as Repository<WorkspaceMembers>,
    );

    service = new WorkspaceMembersService(
      dataSource,
      mockWorkspaceRepository as Repository<Workspace>,
      mockWorkspaceMembersRepository as Repository<WorkspaceMembers>,
      mockPermissionRepository as Repository<WorkspacePermission>,
      mockAuditService as unknown as AuditService,
      membership,
      // Real: the no-escalation check of the assigner
      new WorkspacePermissionGroupsService(
        dataSource,
        mockPermissionRepository as Repository<WorkspacePermission>,
        mockWorkspaceMembersRepository as Repository<WorkspaceMembers>,
        {} as Repository<WorkspaceMemberPermission>,
        mockAuditService as unknown as AuditService,
        membership,
      ),
    );
  });

  describe('members', () => {
    const memberId = randomUUID();
    const anotherUserId = randomUUID();

    const makeMember = (overrides: Record<string, unknown> = {}) => ({
      id: memberId,
      user: { id: anotherUserId, name: 'Other', image: null },
      memberPermissions: [
        { permission: { isSystem: false, permissions: ['project.read'] } },
      ],
      ...overrides,
    });

    it('should update member permissions', async () => {
      const permissionId = randomUUID();
      (mockWorkspaceMembersRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(makeMember())
        .mockResolvedValueOnce(makeMember())
        .mockResolvedValueOnce({
          memberPermissions: [
            { permission: { permissions: ['project.read'] } },
          ],
        });
      (mockPermissionRepository.find as jest.Mock).mockResolvedValue([
        { id: permissionId, permissions: ['project.read'] },
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

    it('ignores retired template keys still stored on a group being assigned', async () => {
      const legacyGroupId = randomUUID();
      (mockWorkspaceMembersRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(makeMember())
        .mockResolvedValueOnce(makeMember())
        .mockResolvedValueOnce({
          memberPermissions: [{ permission: { permissions: ['project.read'] } }],
        });
      (mockPermissionRepository.find as jest.Mock).mockResolvedValue([
        { id: legacyGroupId, permissions: ['project.read', 'template.read'] },
      ]);

      await service.updateMemberPermissions(
        testWorkspaceId,
        memberId,
        [legacyGroupId],
        testUserId,
      );

      expect(mockManager.save).toHaveBeenCalledWith(
        WorkspaceMemberPermission,
        expect.objectContaining({ permission: { id: legacyGroupId } }),
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
      ).rejects.toThrow(InvalidInputError);
    });

    it('should reject unknown permission group ids instead of silently dropping them', async () => {
      const validId = randomUUID();
      const unknownId = randomUUID();
      (mockWorkspaceMembersRepository.findOne as jest.Mock).mockResolvedValue(
        makeMember(),
      );
      (mockPermissionRepository.find as jest.Mock).mockResolvedValue([
        { id: validId, permissions: ['project.read'] },
      ]);

      await expect(
        service.updateMemberPermissions(
          testWorkspaceId,
          memberId,
          [validId, unknownId],
          testUserId,
        ),
      ).rejects.toThrow(InvalidInputError);
      // No replacement happened — no silent partial write.
      expect(mockManager.delete).not.toHaveBeenCalled();
    });

    it('should forbid assigning a group whose keys the assigner does not hold', async () => {
      const powerfulGroupId = randomUUID();
      (mockWorkspaceMembersRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(makeMember())
        .mockResolvedValueOnce({
          // Assigner only holds project.read
          memberPermissions: [
            { permission: { permissions: ['project.read'] } },
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
      ).rejects.toThrow(InvalidInputError);
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
      ).rejects.toThrow(ForbiddenError);
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
      ).rejects.toThrow(ForbiddenError);
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
      ).rejects.toThrow(ForbiddenError);
    });

    it('should forbid removing yourself', async () => {
      (mockWorkspaceMembersRepository.findOne as jest.Mock).mockResolvedValue(
        makeMember({ user: { id: testUserId } }),
      );

      await expect(
        service.removeMember(testWorkspaceId, memberId, testUserId),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('audit wiring - explicit events (M4.1)', () => {
    const memberId = randomUUID();
    const removedUserId = randomUUID();

    // Built by the controller from the request (AuditService.buildActorContext)
    const auditContext = {
      actorId: testUserId,
      actorType: 'user',
      actorName: 'Test User',
      actorEmail: 'test@example.com',
      sourceIp: '203.0.113.7',
      userAgent: 'agent',
      requestId: 'req-1',
    };

    const makeMember = (overrides: Record<string, unknown> = {}) => ({
      id: memberId,
      user: { id: removedUserId, name: 'Removed', image: null },
      memberPermissions: [
        { permission: { isSystem: false, permissions: ['project.read'] } },
      ],
      ...overrides,
    });

    it('removeMember records member.removed in the tx and pseudonymizes the removed user after commit (scenario 9)', async () => {
      (mockWorkspaceMembersRepository.findOne as jest.Mock).mockResolvedValue(
        makeMember(),
      );

      const result = await service.removeMember(
        testWorkspaceId,
        memberId,
        testUserId,
        auditContext,
      );

      expect(result).toEqual({ message: 'Member removed successfully' });
      // In-transaction audit row: actor = the acting user, target = removed
      expect(mockManager.delete).toHaveBeenCalledWith(WorkspaceMembers, {
        id: memberId,
      });
      expect(mockAuditService.recordInTx).toHaveBeenCalledWith(
        mockManager,
        expect.objectContaining({
          workspaceId: testWorkspaceId,
          action: 'member.removed',
          resourceType: 'member',
          resourceId: memberId,
          metadata: { targetUserId: removedUserId },
          actorId: testUserId,
        }),
      );
      // GDPR sweep runs AFTER the tx commits; the removed user's PII is
      // swept from their own rows AND from the member.removed event row
      // (metadata.targetUserId) via the event id returned by recordInTx.
      expect(mockAuditService.pseudonymizeActor).toHaveBeenCalledWith(
        removedUserId,
        expect.any(String),
      );
    });

    it('removeMember still succeeds when pseudonymization fails (audit must not break the business request)', async () => {
      (mockWorkspaceMembersRepository.findOne as jest.Mock).mockResolvedValue(
        makeMember(),
      );
      (mockAuditService.pseudonymizeActor).mockRejectedValue(
        new Error('trigger blocked'),
      );

      await expect(
        service.removeMember(testWorkspaceId, memberId, testUserId, auditContext),
      ).resolves.toEqual({ message: 'Member removed successfully' });
    });

    it('updateMemberPermissions records member.permissions.updated with the before/after group ids', async () => {
      const oldGroupId = randomUUID();
      const newGroupId = randomUUID();
      (mockWorkspaceMembersRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(
          makeMember({
            memberPermissions: [
              {
                permission: {
                  id: oldGroupId,
                  isSystem: false,
                  permissions: ['project.read'],
                },
              },
            ],
          }),
        )
        .mockResolvedValueOnce({
          memberPermissions: [
            { permission: { permissions: ['*'] } },
          ],
        })
        .mockResolvedValueOnce(makeMember());
      (mockPermissionRepository.find as jest.Mock).mockResolvedValue([
        { id: newGroupId, permissions: ['project.read'] },
      ]);

      await service.updateMemberPermissions(
        testWorkspaceId,
        memberId,
        [newGroupId],
        testUserId,
        auditContext,
      );

      expect(mockAuditService.recordInTx).toHaveBeenCalledWith(
        mockManager,
        expect.objectContaining({
          workspaceId: testWorkspaceId,
          action: 'member.permissions.updated',
          resourceType: 'member',
          resourceId: memberId,
          changes: {
            permissionIds: { before: [oldGroupId], after: [newGroupId] },
          },
          actorId: testUserId,
        }),
      );
    });
  });
});
