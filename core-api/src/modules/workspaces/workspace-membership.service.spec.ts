import { randomUUID } from 'crypto';
import type { Repository } from 'typeorm';
import type { WorkspaceMembers } from './entities/workspace-members.entity';
import { WorkspaceMembershipService } from './workspace-membership.service';

describe('WorkspaceMembershipService', () => {
  const testUserId = randomUUID();
  const testWorkspaceId = randomUUID();
  let mockWorkspaceMembersRepository: { findOne: jest.Mock };
  let service: WorkspaceMembershipService;

  beforeEach(() => {
    mockWorkspaceMembersRepository = { findOne: jest.fn() };
    service = new WorkspaceMembershipService(
      mockWorkspaceMembersRepository as unknown as Repository<WorkspaceMembers>,
    );
  });

  it('loads the membership of the user in the workspace with its groups', async () => {
    mockWorkspaceMembersRepository.findOne.mockResolvedValue({ memberPermissions: [] });

    await service.getMembershipWithPermissions(testWorkspaceId, testUserId);

    expect(mockWorkspaceMembersRepository.findOne).toHaveBeenCalledWith({
      where: { workspace: { id: testWorkspaceId }, user: { id: testUserId } },
      relations: ['memberPermissions', 'memberPermissions.permission'],
    });
  });

  it('should aggregate permission keys across groups', async () => {
    mockWorkspaceMembersRepository.findOne.mockResolvedValue({
      memberPermissions: [
        { permission: { permissions: ['project.read'] } },
        { permission: { permissions: ['target.read', '*'] } },
      ],
    });

    const result = await service.getMembershipWithPermissions(
      testWorkspaceId,
      testUserId,
    );

    expect(result.permissionKeys.sort()).toEqual([
      '*',
      'project.read',
      'target.read',
    ]);
  });

  it('should throw NotFound for a non-member', async () => {
    mockWorkspaceMembersRepository.findOne.mockResolvedValue(null);

    await expect(
      service.getMembershipWithPermissions(testWorkspaceId, testUserId),
    ).rejects.toThrow('Workspace member not found');
  });

  describe('getCurrentPermission', () => {
    it('should return the union of permission keys for the member', async () => {
      mockWorkspaceMembersRepository.findOne.mockResolvedValue({
        memberPermissions: [
          { permission: { permissions: ['project.read'] } },
          { permission: { permissions: ['target.read', '*'] } },
        ],
      });

      const result = await service.getCurrentPermission(
        testWorkspaceId,
        testUserId,
      );

      expect(result.currentPermission.sort()).toEqual([
        '*',
        'project.read',
        'target.read',
      ]);
    });

    it('should return an empty list when membership has no permission groups', async () => {
      mockWorkspaceMembersRepository.findOne.mockResolvedValue({
        memberPermissions: [],
      });

      const result = await service.getCurrentPermission(
        testWorkspaceId,
        testUserId,
      );

      expect(result).toEqual({ currentPermission: [] });
    });

    it('should throw NotFound for a non-member', async () => {
      mockWorkspaceMembersRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getCurrentPermission(testWorkspaceId, testUserId),
      ).rejects.toThrow('Workspace member not found');
    });
  });
});
