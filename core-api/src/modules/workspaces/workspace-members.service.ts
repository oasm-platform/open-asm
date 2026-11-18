import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { AuditOutcome } from '@/common/enums/enum';
import { ForbiddenError, InvalidInputError, NotFoundError } from '@/common/errors/domain.errors';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AuditContext, AuditService } from '../audit/audit.service';
import { WorkspaceMemberPermission } from './entities/workspace-member-permission.entity';
import { WorkspaceMembers } from './entities/workspace-members.entity';
import { WorkspacePermission } from './entities/workspace-permission.entity';
import { Workspace } from './entities/workspace.entity';
import { WorkspaceMembershipService } from './workspace-membership.service';
import { WorkspacePermissionGroupsService } from './workspace-permission-groups.service';

/**
 * The members of a workspace: listing them with their groups, replacing a
 * member's groups, and removing a member. Nobody may change their own
 * membership or the owner's, and an assigner may only grant groups whose keys
 * they hold.
 */
@Injectable()
export class WorkspaceMembersService {
  private readonly logger = new Logger(WorkspaceMembersService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
    @InjectRepository(WorkspaceMembers)
    private readonly workspaceMembersRepository: Repository<WorkspaceMembers>,
    @InjectRepository(WorkspacePermission)
    private readonly permissionRepository: Repository<WorkspacePermission>,
    private readonly auditService: AuditService,
    private readonly membership: WorkspaceMembershipService,
    private readonly permissionGroups: WorkspacePermissionGroupsService,
  ) {}

  public async getMembersWithPermissions(
    workspaceId: string,
  ): Promise<WorkspaceMembers[]> {
    return this.workspaceMembersRepository.find({
      where: { workspace: { id: workspaceId } },
      relations: ['user', 'memberPermissions', 'memberPermissions.permission'],
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Replaces a member's permission groups.
   * The workspace owner (holder of the system Admin group) and the acting user
   * cannot be modified through this endpoint.
   */
  public async updateMemberPermissions(
    workspaceId: string,
    memberId: string,
    permissionIds: string[],
    currentUserId: string,
    auditContext?: AuditContext,
  ): Promise<WorkspaceMembers> {
    if (permissionIds.length === 0) {
      throw new InvalidInputError(
        'At least one permission group is required',
      );
    }

    const member = await this.workspaceMembersRepository.findOne({
      where: { id: memberId, workspace: { id: workspaceId } },
      relations: ['user', 'memberPermissions', 'memberPermissions.permission'],
    });
    if (!member) {
      throw new NotFoundError('Workspace member not found');
    }
    await this.assertMemberMutable(member, currentUserId, workspaceId);

    // Diff source for the audit row: the member's groups BEFORE this change.
    const beforePermissionIds =
      member.memberPermissions
        ?.map((mp) => mp.permission?.id)
        .filter((id): id is string => !!id) ?? [];

    // Validate every id against the workspace's groups — never silently drop.
    const groups = await this.permissionRepository.find({
      where: { id: In(permissionIds), workspace: { id: workspaceId } },
    });
    const validIds = new Set(groups.map((group) => group.id));
    const invalidIds = permissionIds.filter((id) => !validIds.has(id));
    if (invalidIds.length > 0) {
      throw new InvalidInputError(
        `Unknown permission group(s): ${invalidIds.join(', ')}`,
      );
    }

    // Privilege escalation guard: assigner must hold every key being granted.
    const { permissionKeys } = await this.membership.getMembershipWithPermissions(
      workspaceId,
      currentUserId,
    );
    this.permissionGroups.assertCanGrantGroups(permissionKeys, groups);

    // Replace the member's groups atomically so a failure mid-way cannot
    // leave the member with no permissions at all. The audit row commits in
    // the same transaction (event 9, explicit).
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(WorkspaceMemberPermission, {
        member: { id: member.id },
      });
      for (const permissionId of permissionIds) {
        await manager.save(WorkspaceMemberPermission, {
          member: { id: member.id },
          permission: { id: permissionId },
        });
      }
      if (auditContext) {
        await this.auditService.recordInTx(manager, {
          workspaceId,
          ...auditContext,
          action: 'member.permissions.updated',
          resourceType: 'member',
          resourceId: member.id,
          changes: {
            permissionIds: { before: beforePermissionIds, after: permissionIds },
          },
          outcome: AuditOutcome.Success,
        });
      }
    });

    const updated = await this.workspaceMembersRepository.findOne({
      where: { id: member.id },
      relations: ['user', 'memberPermissions', 'memberPermissions.permission'],
    });
    if (!updated) {
      throw new NotFoundError('Workspace member not found');
    }
    return updated;
  }

  public async removeMember(
    workspaceId: string,
    memberId: string,
    currentUserId: string,
    auditContext?: AuditContext,
  ): Promise<DefaultMessageResponseDto> {
    const member = await this.workspaceMembersRepository.findOne({
      where: { id: memberId, workspace: { id: workspaceId } },
      relations: ['user', 'memberPermissions', 'memberPermissions.permission'],
    });
    if (!member) {
      throw new NotFoundError('Workspace member not found');
    }
    await this.assertMemberMutable(member, currentUserId, workspaceId);

    // Membership delete + audit row commit atomically; the removed member's
    // PII is pseudonymized AFTER commit so a GDPR-sweep failure can never
    // roll back a successful removal. The event id is passed to the sweep so
    // it can also null metadata.targetUserId on the member.removed row itself
    // (that row's actorId is the *acting* user, so the actor sweep misses it).
    let removedEventId: string | undefined;
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(WorkspaceMembers, { id: member.id });
      if (auditContext) {
        const event = await this.auditService.recordInTx(manager, {
          workspaceId,
          ...auditContext,
          action: 'member.removed',
          resourceType: 'member',
          resourceId: member.id,
          ...(member.user?.id ? { metadata: { targetUserId: member.user.id } } : {}),
          outcome: AuditOutcome.Success,
        });
        removedEventId = event.id;
      }
    });

    if (member.user?.id) {
      try {
        await this.auditService.pseudonymizeActor(
          member.user.id,
          removedEventId,
        );
      } catch (error) {
        this.logger.error(
          'Failed to pseudonymize audit rows of removed member',
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    return { message: 'Member removed successfully' };
  }

  /**
   * Guards against modifying the workspace owner or removing your own access.
   * Owner protection is checked both via the system Admin group and via the
   * workspace.ownerId, so it stays robust even if seeding ever failed.
   */
  private async assertMemberMutable(
    member: WorkspaceMembers,
    currentUserId: string,
    workspaceId: string,
  ): Promise<void> {
    if (member.user?.id === currentUserId) {
      throw new ForbiddenError('You cannot modify your own membership');
    }
    const hasOwnerGroup =
      member.memberPermissions?.some((mp) => mp.permission?.isSystem) ?? false;
    if (hasOwnerGroup) {
      throw new ForbiddenError('The workspace owner cannot be modified');
    }
    const workspace = await this.workspaceRepository.findOne({
      where: { id: workspaceId },
      relations: ['owner'],
    });
    if (workspace?.owner?.id === member.user?.id) {
      throw new ForbiddenError('The workspace owner cannot be modified');
    }
  }
}
