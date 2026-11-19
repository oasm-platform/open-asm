import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { NotificationScope, NotificationType } from '@/common/enums/enum';
import { InvalidInputError, NotFoundError } from '@/common/errors/domain.errors';
import { UserContextPayload } from '@/common/interfaces/app.interface';
import { User } from '@/modules/auth/entities/user.entity';
import { InvitationStatus } from '@/modules/workspaces/enums/workspace.enums';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { DataSource, In, MoreThan, Repository } from 'typeorm';
import { CreateNotificationDto } from '../notifications/dto/create-notification.dto';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateInvitationsDto,
  CreateInvitationsResponseDto,
  InvitationPreviewDto,
} from './dto/workspace-access.dto';
import { WorkspaceInvitation } from './entities/workspace-invitation.entity';
import { WorkspaceMemberPermission } from './entities/workspace-member-permission.entity';
import { WorkspaceMembers } from './entities/workspace-members.entity';
import { WorkspacePermission } from './entities/workspace-permission.entity';
import { Workspace } from './entities/workspace.entity';
import { WorkspaceMembershipService } from './workspace-membership.service';
import { WorkspacePermissionGroupsService } from './workspace-permission-groups.service';

/** Invitation validity window: 7 days */
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** ref tag used on workspace-invitation notifications so they can be located
 * (and deleted once the invite is accepted/declined/cancelled) via refId =
 * the invitation id. */
const INVITATION_NOTIF_REF = 'workspace_invitation';

/**
 * Invitations into a workspace: invite existing accounts, list and preview
 * pending invitations, accept, decline and cancel. Only the token's sha256 is
 * stored, an invite carries only non-system groups the inviter holds, and
 * accepting consumes the token once.
 */
@Injectable()
export class WorkspaceInvitationsService {
  private readonly logger = new Logger(WorkspaceInvitationsService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
    @InjectRepository(WorkspaceMembers)
    private readonly workspaceMembersRepository: Repository<WorkspaceMembers>,
    @InjectRepository(WorkspaceInvitation)
    private readonly invitationRepository: Repository<WorkspaceInvitation>,
    private readonly notificationsService: NotificationsService,
    private readonly membership: WorkspaceMembershipService,
    private readonly permissionGroups: WorkspacePermissionGroupsService,
  ) {}

  public async createInvitations(
    workspaceId: string,
    invitedById: string,
    dto: CreateInvitationsDto,
  ): Promise<CreateInvitationsResponseDto> {
    const emails = [...new Set(dto.emails.map((email) => email.toLowerCase()))];
    const userRepository = this.workspaceRepository.manager.getRepository(User);
    const users = await userRepository.find({ where: { email: In(emails) } });
    const userByEmail = new Map(
      users.map((user) => [user.email.toLowerCase(), user]),
    );

    const workspace = await this.workspaceRepository.findOne({ where: { id: workspaceId } });
    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }
    if (workspace.archivedAt) {
      throw new InvalidInputError(
        'Cannot invite members to an archived workspace',
      );
    }

    // Privilege-escalation guard: the inviter must hold every key of every
    // permission group being assigned to the invitees.
    const validGroups = await this.permissionGroups.findValidPermissionGroups(
      workspaceId,
      dto.permissionIds,
    );
    const validPermissionIds = validGroups.map((group) => group.id);
    const { permissionKeys } = await this.membership.getMembershipWithPermissions(
      workspaceId,
      invitedById,
    );
    this.permissionGroups.assertCanGrantGroups(permissionKeys, validGroups);

    // Skip users who are already members of the workspace (no invite needed).
    const invitedCandidates = emails.filter((email) =>
      userByEmail.has(email),
    );
    const candidateUserIds = invitedCandidates.map(
      (email) => userByEmail.get(email)!.id,
    );
    const existingMemberships =
      candidateUserIds.length > 0
        ? await this.workspaceMembersRepository.find({
            where: {
              workspace: { id: workspaceId },
              user: { id: In(candidateUserIds) },
            },
            relations: ['user'],
          })
        : [];
    const memberUserIds = new Set(
      existingMemberships.map((membership) => membership.user?.id),
    );

    const invitedEmails = invitedCandidates.filter(
      (email) => !memberUserIds.has(userByEmail.get(email)!.id),
    );
    const skippedCount = emails.length - invitedEmails.length;
    const tokenByEmail = new Map<string, string>();
    const invitationIdByEmail = new Map<string, string>();

    await this.dataSource.transaction(async (manager) => {
      for (const email of invitedEmails) {
        // Re-invite: expire any previous pending invitation for this email
        await manager.update(
          WorkspaceInvitation,
          {
            workspace: { id: workspaceId },
            email,
            status: InvitationStatus.PENDING,
          },
          { status: InvitationStatus.EXPIRED },
        );

        const token = randomBytes(32).toString('hex');
        tokenByEmail.set(email, token);
        const invitation = await manager.save(
          WorkspaceInvitation,
          manager.create(WorkspaceInvitation, {
            workspace: { id: workspaceId },
            invitedBy: { id: invitedById },
            email,
            permissionIds: validPermissionIds,
            tokenHash: createHash('sha256').update(token).digest('hex'),
            status: InvitationStatus.PENDING,
            expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
          }),
        );
        invitationIdByEmail.set(email, invitation.id);
      }
    });

    // Notify invitees after the transaction commits. The notification is
    // system-scoped (no workspaceId) so it appears in every workspace the
    // invitee opens — they are not a member of the inviting workspace yet.
    for (const email of invitedEmails) {
      const user = userByEmail.get(email);
      await this.notifySafely({
        recipients: [user!.id],
        scope: NotificationScope.SYSTEM,
        type: NotificationType.WORKSPACE_INVITATION,
        ref: INVITATION_NOTIF_REF,
        refId: invitationIdByEmail.get(email) ?? '',
        metadata: {
          token: tokenByEmail.get(email) ?? '',
          workspaceName: workspace.name,
          action: 'created',
        },
      });
    }

    // Uniform counts only — never reveal which emails have accounts/memberships.
    return { invited: invitedEmails.length, skipped: skippedCount };
  }

  public async listInvitations(
    workspaceId: string,
  ): Promise<WorkspaceInvitation[]> {
    // List only the active pending invites. Handled history (expired,
    // cancelled, accepted, declined) is intentionally not exposed here.
    const invitations = await this.invitationRepository.find({
      where: {
        workspace: { id: workspaceId },
        status: InvitationStatus.PENDING,
        expiresAt: MoreThan(new Date()),
      },
      relations: ['invitedBy', 'workspace'],
      order: { createdAt: 'DESC' },
    });

    return invitations.map((invitation) => ({
      ...invitation.toJSON(),
      status: invitation.status,
    })) as unknown as WorkspaceInvitation[];
  }

  public async getInvitationPreview(token: string): Promise<InvitationPreviewDto> {
    await this.expireDueInvitations();

    const invitation = await this.findInvitationByToken(token);
    if (!invitation) {
      throw new NotFoundError('Invitation not found');
    }

    return {
      workspaceId: invitation.workspace.id,
      workspaceName: invitation.workspace.name,
      email: invitation.email,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
    };
  }

  public async acceptInvitation(
    token: string,
    user: UserContextPayload,
  ): Promise<DefaultMessageResponseDto> {
    const invitation = await this.findInvitationByToken(token);
    if (!this.canAcceptInvitation(invitation, user.email)) {
      throw new InvalidInputError('Invitation is invalid or expired');
    }
    if (invitation!.workspace.archivedAt) {
      throw new InvalidInputError(
        'Cannot join an archived workspace',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      // Atomic one-time consume: only one concurrent accept wins
      const consumed = await manager.update(
        WorkspaceInvitation,
        { id: invitation!.id, status: InvitationStatus.PENDING },
        { status: InvitationStatus.ACCEPTED },
      );
      if (!consumed.affected) {
        throw new InvalidInputError('Invitation is invalid or expired');
      }

      const memberRepository = manager.getRepository(WorkspaceMembers);
      let member = await memberRepository.findOne({
        where: {
          workspace: { id: invitation!.workspace.id },
          user: { id: user.id },
        },
      });
      if (!member) {
        try {
          member = await memberRepository.save({
            workspace: { id: invitation!.workspace.id },
            user: { id: user.id },
          });
        } catch (error: unknown) {
          // Concurrent accept of another invitation for the same user hits
          // the unique (workspaceId, userId) constraint — reuse the winning
          // membership instead of surfacing a raw 23505 → 500.
          if ((error as { code?: string }).code === '23505') {
            member = await memberRepository.findOne({
              where: {
                workspace: { id: invitation!.workspace.id },
                user: { id: user.id },
              },
            });
            if (!member) {
              throw error;
            }
          } else {
            throw error;
          }
        }
      }

      // Assign the permission groups chosen at invite time (groups still
      // existing). Never removes groups the member already holds — accepting
      // must not strip e.g. an existing system Admin group.
      const memberPermissionRepository =
        manager.getRepository(WorkspaceMemberPermission);
      const existingPermissions = await memberPermissionRepository.find({
        where: { member: { id: member.id } },
        relations: ['permission'],
      });
      const existingGroupIds = new Set(
        existingPermissions.map((mp) => mp.permission?.id),
      );
      const groups = await manager.getRepository(WorkspacePermission).find({
        where: {
          id: In(invitation!.permissionIds),
          workspace: { id: invitation!.workspace.id },
        },
      });
      for (const group of groups) {
        if (existingGroupIds.has(group.id)) {
          continue;
        }
        await manager.save(WorkspaceMemberPermission, {
          member: { id: member.id },
          permission: { id: group.id },
        });
      }
    });

    await this.notifySafely({
      recipients: [invitation!.invitedBy.id],
      scope: NotificationScope.SYSTEM,
      type: NotificationType.WORKSPACE_INVITATION,
      metadata: {
        // No token here: the inviter does not need the (now consumed) token.
        action: 'accepted',
        userName: user.name,
        workspaceName: invitation!.workspace.name,
      },
    });

    // The pending-invite notification sent to the invitee is no longer
    // relevant once the invite is accepted — drop it.
    await this.notificationsService.deleteByRef(
      INVITATION_NOTIF_REF,
      invitation!.id,
    );

    return { message: 'Invitation accepted successfully' };
  }

  public async declineInvitation(
    token: string,
    user: UserContextPayload,
  ): Promise<DefaultMessageResponseDto> {
    const invitation = await this.findInvitationByToken(token);
    if (!this.canAcceptInvitation(invitation, user.email)) {
      throw new InvalidInputError('Invitation is invalid or expired');
    }

    const declined = await this.invitationRepository.update(
      { id: invitation!.id, status: InvitationStatus.PENDING },
      { status: InvitationStatus.DECLINED },
    );
    if (!declined.affected) {
      throw new InvalidInputError('Invitation is invalid or expired');
    }

    await this.notifySafely({
      recipients: [invitation!.invitedBy.id],
      scope: NotificationScope.SYSTEM,
      type: NotificationType.WORKSPACE_INVITATION,
      metadata: {
        // No token here: the inviter does not need the (now consumed) token.
        action: 'declined',
        userName: user.name,
        workspaceName: invitation!.workspace.name,
      },
    });

    // The pending-invite notification sent to the invitee is no longer
    // relevant once the invite is declined — drop it.
    await this.notificationsService.deleteByRef(
      INVITATION_NOTIF_REF,
      invitation!.id,
    );

    return { message: 'Invitation declined successfully' };
  }

  public async cancelInvitation(
    workspaceId: string,
    invitationId: string,
  ): Promise<DefaultMessageResponseDto> {
    // Keep the row for the audit trail: flip the status to CANCELLED instead
    // of deleting, so the console's cancelled badge and InvitationStatus
    // values stay consistent.
    const updated = await this.invitationRepository.update(
      {
        id: invitationId,
        workspace: { id: workspaceId },
        status: InvitationStatus.PENDING,
      },
      { status: InvitationStatus.CANCELLED },
    );
    if (!updated.affected) {
      throw new NotFoundError('Invitation not found or already handled');
    }

    // The pending-invite notification sent to the invitee is no longer
    // relevant once the inviter cancels the invite — drop it.
    await this.notificationsService.deleteByRef(
      INVITATION_NOTIF_REF,
      invitationId,
    );

    return { message: 'Invitation cancelled successfully' };
  }

  private async findInvitationByToken(
    token: string,
  ): Promise<WorkspaceInvitation | null> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    return this.invitationRepository.findOne({
      where: { tokenHash },
      relations: ['workspace', 'invitedBy'],
    });
  }

  private canAcceptInvitation(
    invitation: WorkspaceInvitation | null,
    userEmail: string,
  ): boolean {
    if (
      !invitation ||
      invitation.status !== InvitationStatus.PENDING ||
      invitation.expiresAt.getTime() <= Date.now() ||
      invitation.email !== userEmail.toLowerCase()
    ) {
      return false;
    }
    return true;
  }

  /**
   * Persists the EXPIRED status for pending invitations past their expiry, so
   * list/preview reads reflect real status instead of computing it on the fly.
   */
  private async expireDueInvitations(): Promise<void> {
    await this.invitationRepository
      .createQueryBuilder()
      .update(WorkspaceInvitation)
      .set({ status: InvitationStatus.EXPIRED })
      .where('status = :status', { status: InvitationStatus.PENDING })
      .andWhere('"expiresAt" <= :now', { now: new Date() })
      .execute();
  }

  /**
   * Sends an invitation notification without letting a queue failure turn a
   * successful DB write into a 500 for the caller.
   */
  private async notifySafely(body: CreateNotificationDto): Promise<void> {
    try {
      await this.notificationsService.createNotification(body);
    } catch (error) {
      this.logger.error(
        'Failed to send workspace invitation notification',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
