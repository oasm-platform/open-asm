import { NotFoundError } from '@/common/errors/domain.errors';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrentPermissionResponseDto } from './dto/workspaces.dto';
import { WorkspaceMembers } from './entities/workspace-members.entity';

/**
 * Who a user is in a workspace: the membership row and the permission keys of
 * all their groups. The tenancy lookup behind `WorkspacePermissionGuard`
 * (through `WorkspacesService.getMembershipWithPermissions`) and behind every
 * "may this member grant that" check.
 */
@Injectable()
export class WorkspaceMembershipService {
  constructor(
    @InjectRepository(WorkspaceMembers)
    private readonly workspaceMembersRepository: Repository<WorkspaceMembers>,
  ) {}

  /**
   * Resolves a member's membership row and the union of permission keys from
   * all their permission groups.
   * @throws NotFoundError if the user is not a member of the workspace.
   */
  async getMembershipWithPermissions(
    workspaceId: string,
    userId: string,
  ): Promise<{ membership: WorkspaceMembers; permissionKeys: string[] }> {
    const membership = await this.workspaceMembersRepository.findOne({
      where: { workspace: { id: workspaceId }, user: { id: userId } },
      relations: ['memberPermissions', 'memberPermissions.permission'],
    });

    if (!membership) {
      throw new NotFoundError('Workspace member not found');
    }

    const keys = new Set<string>();
    for (const memberPermission of membership.memberPermissions ?? []) {
      for (const key of memberPermission.permission?.permissions ?? []) {
        keys.add(key);
      }
    }

    return { membership, permissionKeys: [...keys] };
  }

  /**
   * The deduped permission keys of the user in the workspace, for the
   * current-permission endpoint.
   * @throws NotFoundError if the user is not a member of the workspace.
   */
  async getCurrentPermission(
    workspaceId: string,
    userId: string,
  ): Promise<CurrentPermissionResponseDto> {
    const { permissionKeys } = await this.getMembershipWithPermissions(
      workspaceId,
      userId,
    );
    return { currentPermission: permissionKeys };
  }
}
