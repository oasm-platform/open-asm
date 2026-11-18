import { ForbiddenError, InvalidInputError } from '@/common/errors/domain.errors';
import { randomUUID } from 'crypto';
import type { DataSource, Repository } from 'typeorm';
import type { AuditService } from '../audit/audit.service';
import type { WorkspaceMemberPermission } from './entities/workspace-member-permission.entity';
import type { WorkspaceMembers } from './entities/workspace-members.entity';
import { WorkspacePermission } from './entities/workspace-permission.entity';
import { WorkspaceMembershipService } from './workspace-membership.service';
import { WorkspacePermissionGroupsService } from './workspace-permission-groups.service';

describe('WorkspacePermissionGroupsService', () => {
  let service: WorkspacePermissionGroupsService;
  let mockWorkspaceMembersRepository: Partial<Repository<WorkspaceMembers>>;
  let mockPermissionRepository: Partial<Repository<WorkspacePermission>>;
  let mockMemberPermissionRepository: Partial<Repository<WorkspaceMemberPermission>>;
  let mockAuditService: { recordInTx: jest.Mock };
  let mockManager: {
    save: jest.Mock;
    delete: jest.Mock;
  };

  const testUserId = randomUUID();
  const testWorkspaceId = randomUUID();

  beforeEach(() => {
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

    mockManager = {
      save: jest.fn().mockImplementation((_entity: unknown, data?: unknown) =>
        Promise.resolve(data ?? _entity),
      ),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockAuditService = { recordInTx: jest.fn().mockResolvedValue({ id: randomUUID() }) };

    const dataSource = {
      transaction: jest.fn((cb: (m: unknown) => unknown) => cb(mockManager)),
    };

    service = new WorkspacePermissionGroupsService(
      dataSource as unknown as DataSource,
      mockPermissionRepository as Repository<WorkspacePermission>,
      mockWorkspaceMembersRepository as Repository<WorkspaceMembers>,
      mockMemberPermissionRepository as Repository<WorkspaceMemberPermission>,
      mockAuditService as unknown as AuditService,
      // Real: the grant checks read the holder's keys through it
      new WorkspaceMembershipService(
        mockWorkspaceMembersRepository as Repository<WorkspaceMembers>,
      ),
    );
  });

  describe('permission groups', () => {
    const holderMembership = {
      memberPermissions: [
        { permission: { permissions: ['project.read', 'target.read'] } },
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
          permissions: ['project.read', 'target.read'],
        },
        testUserId,
      );

      expect(result).toEqual(
        expect.objectContaining({
          name: 'Viewer',
          permissions: ['project.read', 'target.read'],
          isSystem: false,
        }),
      );
      // The insert now runs on the transaction manager so the audit row can
      // commit atomically with the group (M4.1 explicit event wiring).
      expect(mockManager.save).toHaveBeenCalledWith(
        WorkspacePermission,
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
      ).rejects.toThrow(InvalidInputError);
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
            permissions: ['project.read', 'target.own'],
          },
          testUserId,
        ),
      ).rejects.toThrow(InvalidInputError);
    });

    it('should forbid granting permission keys the creator does not hold', async () => {
      // Creator only holds project.read, tries to grant member.write too.
      (mockWorkspaceMembersRepository.findOne as jest.Mock).mockResolvedValue({
        memberPermissions: [{ permission: { permissions: ['project.read'] } }],
      });

      await expect(
        service.createPermissionGroup(
          testWorkspaceId,
          {
            name: 'Escalator',
            permissions: ['project.read', 'member.write'],
          },
          testUserId,
        ),
      ).rejects.toThrow(InvalidInputError);
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
            permissions: ['project.read'],
          },
          testUserId,
        ),
      ).rejects.toThrow(InvalidInputError);
    });

    it('should reject a concurrent duplicate insert with 23505 as 400', async () => {
      (mockWorkspaceMembersRepository.findOne as jest.Mock).mockResolvedValue(
        holderMembership,
      );
      mockManager.save.mockRejectedValue({ code: '23505' });

      await expect(
        service.createPermissionGroup(
          testWorkspaceId,
          {
            name: 'Viewer',
            permissions: ['project.read'],
          },
          testUserId,
        ),
      ).rejects.toThrow(InvalidInputError);
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
      ).rejects.toThrow(ForbiddenError);
    });

    it('updatePermissionGroup drops retired template keys', async () => {
      const group = {
        id: randomUUID(),
        name: 'Viewer',
        isSystem: false,
        permissions: ['asset.read', 'template.read'],
      };
      (mockPermissionRepository.findOne as jest.Mock).mockResolvedValue(group);
      (mockWorkspaceMembersRepository.findOne as jest.Mock).mockResolvedValue({
        memberPermissions: [{ permission: { permissions: ['*'] } }],
      });

      await service.updatePermissionGroup(
        testWorkspaceId,
        group.id,
        { permissions: ['asset.read', 'template.write'] },
        testUserId,
      );

      expect(group.permissions).toEqual(['asset.read']);
    });

    it('updatePermissionGroup still rejects other unknown keys', async () => {
      (mockPermissionRepository.findOne as jest.Mock).mockResolvedValue({
        id: randomUUID(),
        name: 'Viewer',
        isSystem: false,
        permissions: ['project.read'],
      });

      await expect(
        service.updatePermissionGroup(
          testWorkspaceId,
          randomUUID(),
          { permissions: ['foo.bar'] },
          testUserId,
        ),
      ).rejects.toThrow(InvalidInputError);
    });

    it('createPermissionGroup drops retired template keys', async () => {
      (mockWorkspaceMembersRepository.findOne as jest.Mock).mockResolvedValue(
        holderMembership,
      );

      const result = await service.createPermissionGroup(
        testWorkspaceId,
        { name: 'Viewer', permissions: ['project.read', 'template.read'] },
        testUserId,
      );

      expect(result.permissions).toEqual(['project.read']);
    });

    it('should reject an empty update body', async () => {
      (mockPermissionRepository.findOne as jest.Mock).mockResolvedValue({
        id: randomUUID(),
        name: 'Viewer',
        isSystem: false,
        permissions: ['project.read'],
      });

      await expect(
        service.updatePermissionGroup(testWorkspaceId, randomUUID(), {}, testUserId),
      ).rejects.toThrow(InvalidInputError);
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
      ).rejects.toThrow(ForbiddenError);
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

    it('catalog includes audit.read for the audit log endpoints', () => {
      const catalog = service.getPermissionCatalog();
      const audit = catalog.find((resource) => resource.resource === 'audit');
      expect(audit).toBeDefined();
      expect(audit!.actions.map((action) => action.action)).toContain('read');
      expect(`${audit!.resource}.read`).toMatch(/^[a-z]+\.[a-z]+$/);
    });
  });

  describe('audit wiring - explicit events (M4.1)', () => {
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

    it('createPermissionGroup records permission_group.created with name and permissions', async () => {
      (mockWorkspaceMembersRepository.findOne as jest.Mock).mockResolvedValue({
        memberPermissions: [{ permission: { permissions: ['*'] } }],
      });

      const result = await service.createPermissionGroup(
        testWorkspaceId,
        { name: 'Viewer', permissions: ['project.read'] },
        testUserId,
        auditContext,
      );

      expect(result).toEqual(
        expect.objectContaining({ name: 'Viewer', isSystem: false }),
      );
      expect(mockAuditService.recordInTx).toHaveBeenCalledWith(
        mockManager,
        expect.objectContaining({
          workspaceId: testWorkspaceId,
          action: 'permission_group.created',
          resourceType: 'permission_group',
          changes: {
            name: { after: 'Viewer' },
            permissions: { after: ['project.read'] },
          },
          actorId: testUserId,
        }),
      );
    });

    it('updatePermissionGroup records permission_group.updated with before/after permissions', async () => {
      const group = {
        id: randomUUID(),
        name: 'Viewer',
        isSystem: false,
        permissions: ['project.read'],
      };
      (mockPermissionRepository.findOne as jest.Mock).mockResolvedValue(group);
      // The updater holds "*" so the privilege-subset guard passes
      (mockWorkspaceMembersRepository.findOne as jest.Mock).mockResolvedValue({
        memberPermissions: [{ permission: { permissions: ['*'] } }],
      });

      await service.updatePermissionGroup(
        testWorkspaceId,
        group.id,
        { permissions: ['project.read', 'target.read'] },
        testUserId,
        auditContext,
      );

      expect(mockAuditService.recordInTx).toHaveBeenCalledWith(
        mockManager,
        expect.objectContaining({
          workspaceId: testWorkspaceId,
          action: 'permission_group.updated',
          resourceType: 'permission_group',
          resourceId: group.id,
          changes: {
            permissions: {
              before: ['project.read'],
              after: ['project.read', 'target.read'],
            },
          },
          actorId: testUserId,
        }),
      );
    });

    it('deletePermissionGroup records permission_group.deleted with the group name', async () => {
      const group = {
        id: randomUUID(),
        name: 'Viewer',
        isSystem: false,
        permissions: ['project.read'],
      };
      (mockPermissionRepository.findOne as jest.Mock).mockResolvedValue(group);

      const result = await service.deletePermissionGroup(
        testWorkspaceId,
        group.id,
        auditContext,
      );

      expect(result).toEqual({ message: 'Permission group deleted successfully' });
      expect(mockManager.delete).toHaveBeenCalledWith(WorkspacePermission, {
        id: group.id,
        workspace: { id: testWorkspaceId },
      });
      expect(mockAuditService.recordInTx).toHaveBeenCalledWith(
        mockManager,
        expect.objectContaining({
          workspaceId: testWorkspaceId,
          action: 'permission_group.deleted',
          resourceType: 'permission_group',
          resourceId: group.id,
          changes: { name: { before: 'Viewer' } },
          actorId: testUserId,
        }),
      );
    });
  });
});
