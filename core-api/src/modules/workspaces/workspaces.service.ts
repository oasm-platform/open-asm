import {
  LIMIT_WORKSPACE_CREATE,
  WORKSPACE_COOKIE_NAME,
} from '@/common/constants/app.constants';
import { getWorkspaceIdFromRequest } from '@/common/decorators/workspace-id.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { SortOrder } from '@/common/dtos/get-many-base.dto';
import { ApiKeyType, AuditOutcome, NotificationScope, NotificationType } from '@/common/enums/enum';
import { InvitationStatus } from '@/modules/workspaces/enums/workspace.enums';
import { UserContextPayload } from '@/common/interfaces/app.interface';
import { User } from '@/modules/auth/entities/user.entity';
import { Job } from '@/modules/jobs-registry/entities/job.entity';
import { WorkspaceEncryptionService } from '@/services/workspace-encryption/workspace-encryption.service';
import { getManyResponse } from '@/common/utils/get-many-response.util';
import { SwaggerPropertyMetadata } from '@/common/utils/get-swagger-metadata.util';
import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'crypto';
import type { NodeRequest, NodeResponse } from '@nestjs/platform-node';
import { DataSource, In, MoreThan, Repository } from 'typeorm';
import { ApiKeysService } from '../apikeys/apikeys.service';
import { ArtifactsService } from '../artifacts/artifacts.service';
import { AuditContext, AuditService } from '../audit/audit.service';
import { CreateNotificationDto } from '../notifications/dto/create-notification.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { Target } from '../targets/entities/target.entity';
import { GetWorkspaceConfigsDto } from './dto/get-workspace-configs.dto';
import { UpdateWorkspaceConfigsDto } from './dto/update-workspace-configs.dto';
import {
  CreateInvitationsDto,
  CreateInvitationsResponseDto,
  InvitationPreviewDto,
} from './dto/workspace-access.dto';
import {
  CreateWorkspaceDto,
  GetApiKeyResponseDto,
  GetManyWorkspacesDto,
  UpdateWorkspaceDto,
} from './dto/workspaces.dto';
import { WorkspaceMembers } from './entities/workspace-members.entity';
import { WorkspaceMembershipService } from './workspace-membership.service';
import {
  WILDCARD_PERMISSION,
  WorkspacePermissionGroupsService,
} from './workspace-permission-groups.service';
import { WorkspaceInvitation } from './entities/workspace-invitation.entity';
import { WorkspaceMemberPermission } from './entities/workspace-member-permission.entity';
import { WorkspacePermission } from './entities/workspace-permission.entity';
import { Workspace } from './entities/workspace.entity';
import {
  WORKSPACE_DELETING_EVENT,
  WORKSPACE_INITIALIZING_EVENT,
  type WorkspaceDeletingEvent,
  type WorkspaceInitializingEvent,
} from './workspace.events';
import { ForbiddenError, InvalidInputError, NotFoundError } from '@/common/errors/domain.errors';

/** Invitation validity window: 7 days */
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** ref tag used on workspace-invitation notifications so they can be located
 * (and deleted once the invite is accepted/declined/cancelled) via refId =
 * the invitation id. */
const INVITATION_NOTIF_REF = 'workspace_invitation';

@Injectable()
export class WorkspacesService implements OnModuleInit {
  private readonly logger = new Logger(WorkspacesService.name);

  /**
   * Hardening for the workspace selector cookie. Note: the console also sets
   * `wid` via document.cookie (cannot set httpOnly), which replaces this cookie
   * on the client — so httpOnly here only protects the value set by the API.
   */
  private readonly workspaceCookieOptions: Record<string, unknown> = {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  };

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Workspace)
    private readonly repo: Repository<Workspace>,
    @InjectRepository(WorkspaceMembers)
    private readonly workspaceMembersRepository: Repository<WorkspaceMembers>,
    @InjectRepository(WorkspacePermission)
    private readonly permissionRepository: Repository<WorkspacePermission>,
    @InjectRepository(WorkspaceMemberPermission)
    private readonly memberPermissionRepository: Repository<WorkspaceMemberPermission>,
    @InjectRepository(WorkspaceInvitation)
    private readonly invitationRepository: Repository<WorkspaceInvitation>,
    private apiKeyService: ApiKeysService,
    private notificationsService: NotificationsService,
    private events: EventEmitter2,
    private workspaceEncryptionService: WorkspaceEncryptionService,
    private auditService: AuditService,
    private artifactsService: ArtifactsService,
    private readonly membership: WorkspaceMembershipService,
    private readonly permissionGroups: WorkspacePermissionGroupsService,
  ) {}

  async onModuleInit() {}

  /**
   * Creates a new workspace, and adds the requesting user as a member.
   * The workspace is created with the owner set to the requesting user.
   * @param dto - The data transfer object containing the workspace details.
   * @param userContextPayload - The user's context data, which includes the user's ID.
   * @returns The newly created workspace entity.
   */
  public async createWorkspace(
    dto: CreateWorkspaceDto,
    userContextPayload: UserContextPayload,
  ): Promise<Workspace> {
    const { id } = userContextPayload;
    const currentNumberOfWorkspace = await this.repo.count({
      where: {
        owner: { id },
      },
    });

    if (currentNumberOfWorkspace >= LIMIT_WORKSPACE_CREATE) {
      throw new InvalidInputError('You have reached the limit of workspaces');
    }

    const newWorkspaceId = randomUUID();

    // Generate wrapped DEK via centralized encryption service
    const wrappedDEK = this.workspaceEncryptionService.generateWrappedDEK();

    // Create the workspace, its owner membership and the system Admin group in
    // a single transaction so a mid-way failure cannot leave an orphan
    // workspace whose owner is locked out (no Admin group).
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(Workspace).save({
        id: newWorkspaceId,
        name: dto.name,
        description: dto?.description,
        owner: { id },
        dek: wrappedDEK,
        dekAt: new Date(),
        // apiKey: generateToken(API_KEY_LENGTH),
      });

      await manager.getRepository(WorkspaceMembers).save({
        workspace: { id: newWorkspaceId },
        user: { id },
      });

      await this.permissionGroups.seedOwnerPermissionGroup(newWorkspaceId, id, manager);
    });

    await this.events.emitAsync(WORKSPACE_INITIALIZING_EVENT, {
      workspaceId: newWorkspaceId,
    } satisfies WorkspaceInitializingEvent);

    const created = await this.repo.findOne({ where: { id: newWorkspaceId } });
    if (!created) {
      throw new InvalidInputError('Failed to create workspace');
    }

    return created;
  }

  /**
   * Retrieves a list of workspaces by their IDs.
   * @param workspaceIds - An array of workspace IDs to filter.
   * @returns A promise that resolves to an array of Workspace entities.
   */
  public async getWorkspacesByIds(
    workspaceIds: string[],
  ): Promise<Workspace[]> {
    return this.repo.find({
      where: {
        id: In(workspaceIds),
      },
      // The only caller (IntegrationSyncService.resolveActingUser) needs the
      // workspace owner to act on behalf of scheduled syncs — without the
      // relation, `owner` is never loaded.
      relations: ['owner'],
    });
  }

  /**
   * Retrieves a list of workspaces that the user is a member of.
   * @param query - The query parameters to filter and paginate the workspaces.
   * @param userContextPayload - The user's context data, which includes the user's ID.
   * @returns A paginated list of workspaces, along with the total count and page information.
   */
  public async getWorkspaces(
    query: GetManyWorkspacesDto,
    userContextPayload: UserContextPayload,
    req: NodeRequest,
    res: NodeResponse,
  ) {
    const { limit, page, sortOrder, isArchived, sortBy: rawSortBy } = query;
    const { id } = userContextPayload;

    // Injection-safe sort column lookup via allowlist map
    const sortColumnMap: Record<string, string> = {
      id: 'id',
      name: 'name',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
      archivedAt: 'archivedAt',
    };
    const sortBy = sortColumnMap[rawSortBy] ?? 'createdAt';

    const offset = (page - 1) * limit;
    const validSortOrder: 'ASC' | 'DESC' =
      sortOrder === SortOrder.ASC ? 'ASC' : 'DESC';

    const archivedCondition =
      isArchived === true
        ? 'AND w."archivedAt" IS NOT NULL'
        : isArchived === false
          ? 'AND w."archivedAt" IS NULL'
          : '';

    // Single query with window function — eliminates separate COUNT round-trip
    const queryText = `
      SELECT
        w."id",
        w."name",
        w."description",
        w."createdAt",
        w."updatedAt",
        w."archivedAt",
        w."isAssetsDiscovery",
        w."isAutoEnableAssetAfterDiscovered",
        w."ownerId",
        COALESCE(t.target_count, 0)::integer AS "targetCount",
        COALESCE(m.member_count, 0)::integer AS "memberCount",
        COUNT(*) OVER() AS total
      FROM workspaces w
      INNER JOIN workspace_members wm ON wm."workspaceId" = w.id AND wm."userId" = $1
      LEFT JOIN (
        SELECT "workspaceId", COUNT(*) AS target_count
        FROM targets GROUP BY "workspaceId"
      ) t ON t."workspaceId" = w.id
      LEFT JOIN (
        SELECT "workspaceId", COUNT(*) AS member_count
        FROM workspace_members GROUP BY "workspaceId"
      ) m ON m."workspaceId" = w.id
      WHERE 1=1 ${archivedCondition}
      ORDER BY w."${sortBy}" ${validSortOrder}
      LIMIT $2 OFFSET $3
    `;

    const rawData: Record<string, unknown>[] = await this.repo.query(queryText, [
      id,
      limit,
      offset,
    ]);

    // Early return — skip count/members work when no results
    if (rawData.length === 0) {
      res.cookie(WORKSPACE_COOKIE_NAME, '', this.workspaceCookieOptions);
      return getManyResponse({ query, data: [], total: 0 });
    }

    const total = parseInt(rawData[0].total as string, 10);

    // Map data — column aliases already match response field names
    const mappedData = rawData.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      description: row.description as string | null,
      createdAt: row.createdAt as Date,
      updatedAt: row.updatedAt as Date,
      archivedAt: row.archivedAt as Date | null,
      isAssetsDiscovery: row.isAssetsDiscovery as boolean,
      isAutoEnableAssetAfterDiscovered:
        row.isAutoEnableAssetAfterDiscovered as boolean,
      ownerId: row.ownerId as string,
      targetCount: row.targetCount as number,
      memberCount: row.memberCount as number,
    }));

    const defaultWorkspace = mappedData[0].id;
    const workspaceId = getWorkspaceIdFromRequest(req);
    const selectedWorkspaceId =
      mappedData.some((workspace) => workspace.id === workspaceId)
        ? workspaceId
        : defaultWorkspace;

    res.cookie(WORKSPACE_COOKIE_NAME, selectedWorkspaceId, this.workspaceCookieOptions);
    return getManyResponse({ query, data: mappedData, total });
  }

  /**
   * Updates a workspace's details, but only if the requesting user is the owner of the workspace.
   *
   * @param id - The ID of the workspace to be updated.
   * @param dto - The data transfer object containing the updated details of the workspace.
   * @param userContext - The user's context data, which includes the user's ID.
   * @throws BadRequestException if the workspace is not found or the user is not the owner.
   * @returns A response indicating the workspace was successfully updated.
   */
  public async updateWorkspace(
    id: string,
    dto: UpdateWorkspaceDto,
    _userContext: UserContextPayload,
  ) {
    await this.repo.update({ id }, { ...dto });

    return { message: 'Workspace updated successfully' };
  }

  /**
   * Deletes a workspace by its ID, but only if the requesting user is the owner.
   * The workspace is soft deleted, meaning it is not actually removed from the
   * database, but its `deletedAt` field is set to the current timestamp.
   *
   * @param id - The ID of the workspace to be deleted.
   * @param userContext - The user's context data, which includes the user's ID.
   * @throws ForbiddenException if the workspace is not found or the user is not the owner.
   * @returns A response indicating the workspace was successfully deleted.
   */
  public async deleteWorkspace(
    id: string,
    _userContext: UserContextPayload,
    auditContext?: AuditContext,
  ): Promise<DefaultMessageResponseDto> {
    const workspace = await this.repo.findOne({ where: { id } });
    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    // Other modules remove their rows first, each in its own transaction (the
    // audit row must stay atomic with the workspace-row delete below).
    await this.events.emitAsync(WORKSPACE_DELETING_EVENT, {
      workspaceId: id,
    } satisfies WorkspaceDeletingEvent);

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(Workspace, { id });
      if (auditContext) {
        await this.auditService.recordInTx(manager, {
          workspaceId: id,
          ...auditContext,
          action: 'workspace.deleted',
          resourceType: 'workspace',
          resourceId: id,
          // `workspace.name` is the state BEFORE the delete — label it `before`.
          changes: { name: { before: workspace.name } },
          outcome: AuditOutcome.Success,
        });
      }
    });
    // File rows cascaded above; their objects go in the background, since a
    // large workspace would outlast the request.
    void this.artifactsService.deleteWorkspaceObjects(id);

    return {
      message: 'Workspace deleted successfully',
    };
  }

  /**
   * Regenerates the API key for a user.
   * @param userId The ID of the user to regenerate the API key for.
   * @returns The new API key for the user.
   */
  public async rotateApiKey(
    workspaceId: string,
    _userContext: UserContextPayload,
  ): Promise<GetApiKeyResponseDto> {
    const apiKey = await this.apiKeyService.create({
      name: `API Key for workspace ${workspaceId}`,
      type: ApiKeyType.WORKSPACE,
      ref: workspaceId,
    });

    const workspace = await this.repo.findOne({
      where: { id: workspaceId },
    });

    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    workspace.apiKey = apiKey;
    await this.repo.save(workspace);
    return {
      apiKey: workspace.apiKey.key,
    };
  }

  /**
   * Retrieves the configuration settings for a specific workspace.
   * @param workspaceId
   * @returns
   */
  public async getWorkspaceConfigs(
    workspaceId: string,
    _userContext: UserContextPayload,
  ): Promise<GetWorkspaceConfigsDto> {
    const workspace = await this.repo.findOne({
      where: { id: workspaceId },
    });

    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    const configKeys: (keyof GetWorkspaceConfigsDto)[] = [
      'isAssetsDiscovery',
      'isAutoEnableAssetAfterDiscovered',
    ];

    const result = {} as GetWorkspaceConfigsDto;

    for (const key of configKeys) {
      const meta: unknown = Reflect.getMetadata(
        'swagger/apiModelProperties',
        Workspace.prototype,
        key,
      );
      const metaObj = meta as Record<string, unknown> | undefined;

      const metaType = metaObj?.type;
      let typeName: string | undefined;

      if (typeof metaType === 'function') {
        typeName =
          typeof metaType.name === 'string' ? metaType.name.toLowerCase() : undefined;
      } else if (typeof metaType === 'string') {
        typeName = metaType.toLowerCase();
      } else if (
        typeof metaType === 'object' &&
        metaType !== null &&
        'name' in metaType &&
        typeof (metaType as Record<string, unknown>).name === 'string'
      ) {
        typeName = ((metaType as Record<string, unknown>).name as string).toLowerCase();
      } else {
        typeName = typeof workspace[key as keyof Workspace];
      }

      const safeString = (v: unknown): string | undefined => {
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          return String(v);
        }
        return undefined;
      };

      result[key] = {
        value: workspace[key as keyof Workspace] as SwaggerPropertyMetadata['value'],
        type: typeName,
        title: safeString(metaObj?.title) ?? key,
        description: safeString(metaObj?.description) ?? '',
      };
    }

    return result;
  }

  /**
   * Retrieves the workspace ID associated with a target ID.
   * @param targetId - The ID of the target to look up.
   * @returns The workspace ID associated with the target, or null if not found.
   */
  public async getWorkspaceIdByTargetId(
    targetId: string,
  ): Promise<string | null> {
    const target = await this.repo.manager
      .getRepository(Target)
      .createQueryBuilder('target')
      .select('target.workspaceId', 'workspaceId')
      .where('target.id = :targetId', { targetId })
      .cache(60000)
      .getRawOne<{ workspaceId: string }>();

    return target ? target.workspaceId : null;
  }

  /**
   * Retrieves the configuration settings for a specific workspace.
   * @param workspaceId
   * @returns
   */
  public async getWorkspaceConfigValue(
    workspaceId: string,
  ): Promise<Workspace> {
    const workspace = await this.repo.findOne({
      where: {
        id: workspaceId,
      },
    });

    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    return workspace;
  }

  /**
   * Updates the configuration settings for a specific workspace.
   * @param workspaceId
   * @param dto
   * @param userContext
   * @returns
   */
  async updateWorkspaceConfigs(
    workspaceId: string,
    dto: UpdateWorkspaceConfigsDto,
    _userContext: UserContextPayload,
  ) {
    await this.repo.update({ id: workspaceId }, dto);
    return { message: 'Workspace configs updated successfully' };
  }

  /**
   * Retrieves the API key for a workspace.
   * @param workspaceId The ID of the workspace to retrieve the API key for.
   * @returns The API key for the workspace.
   */
  public async getWorkspaceApiKey(
    workspaceId: string,
    userContext: UserContextPayload,
  ): Promise<GetApiKeyResponseDto> {
    try {
      const apiKey = await this.apiKeyService.getCurrentApiKey(
        ApiKeyType.WORKSPACE,
        workspaceId,
      );

      if (!apiKey) {
        return this.rotateApiKey(workspaceId, userContext);
      }
      return {
        apiKey: apiKey.key,
      };
    } catch {
      return this.rotateApiKey(workspaceId, userContext);
    }
  }

  /**
   * Retrieves a workspace by its ID, but only if the user is a member of the workspace.
   * @param id - The ID of the workspace to retrieve.
   * @param userContext - The user's context data, which includes the user's ID.
   * @param permissions - The requester's permission keys (set by the guard).
   *   When provided, the workspaceMembers relation is only included for
   *   holders of `member.read` or the `*` wildcard. Internal callers that omit
   *   it keep the previous behaviour.
   * @returns The workspace, if found and the user is a member. Otherwise, null.
   */
  public async getWorkspaceById(
    id: string,
    userContext: UserContextPayload,
    permissions?: string[],
  ): Promise<Workspace> {
    const userId = userContext.id;

    // Check if user is a member of the workspace
    const isMember = await this.workspaceMembersRepository.findOne({
      where: { workspace: { id }, user: { id: userId } },
    });

    if (!isMember) {
      throw new NotFoundError('Workspace not found');
    }

    // Load workspace with owner and members
    const workspace = await this.repo.findOne({
      where: { id },
      relations: ['owner', 'workspaceMembers', 'workspaceMembers.user'],
    });

    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    if (permissions !== undefined) {
      const canReadMembers =
        permissions.includes(WILDCARD_PERMISSION) ||
        permissions.includes('member.read');
      if (!canReadMembers) {
        delete (workspace as Partial<Workspace>).workspaceMembers;
      }
    }

    return workspace;
  }

  /**
   * Retrieves a workspace by its ID, but only if the requesting user is the owner of the workspace.
   * @param id - The ID of the workspace to retrieve.
   * @param userContext - The user's context data, which includes the user's ID.
   * @throws BadRequestException if the workspace is not found or the user is not the owner.
   * @returns The workspace, if found and the user is the owner.
   */
  public async getWorkspaceByIdAndOwner(
    workspaceId: string,
    userContext: UserContextPayload,
  ): Promise<Workspace> {
    const workspace = await this.repo.findOne({
      where: { id: workspaceId },
      relations: ['owner'],
    });

    if (!workspace || workspace.owner.id !== userContext.id) {
      throw new ForbiddenError('You are not the owner of this workspace');
    }

    return workspace;
  }

  /**
   * Sets the archived status of a workspace.
   * @param id - The ID of the workspace to archive/unarchive.
   * @param archived - Whether to archive (true) or unarchive (false) the workspace.
   * @param userContext - The user's context data, which includes the user's ID.
   * @returns A response indicating the workspace was successfully updated.
   */
  public async makeArchived(
    id: string,
    archived: boolean,
    _userContext: UserContextPayload,
  ): Promise<DefaultMessageResponseDto> {
    await this.repo.update(
      { id },
      {
        archivedAt: archived ? new Date() : null,
      },
    );

    return {
      message: archived
        ? 'Workspace archived successfully'
        : 'Workspace unarchived successfully',
    };
  }

  /**
   * A member's membership row and the union of their permission keys
   * (`WorkspaceMembershipService`). Kept here for `WorkspacePermissionGuard`
   * and the other modules that ask the workspaces module.
   * @throws NotFoundError if the user is not a member of the workspace.
   */
  public getMembershipWithPermissions(
    workspaceId: string,
    userId: string,
  ): Promise<{ membership: WorkspaceMembers; permissionKeys: string[] }> {
    return this.membership.getMembershipWithPermissions(workspaceId, userId);
  }

  // ---------------------------------------------------------------------------
  // Invitations
  // ---------------------------------------------------------------------------

  public async createInvitations(
    workspaceId: string,
    invitedById: string,
    dto: CreateInvitationsDto,
  ): Promise<CreateInvitationsResponseDto> {
    const emails = [...new Set(dto.emails.map((email) => email.toLowerCase()))];
    const userRepository = this.repo.manager.getRepository(User);
    const users = await userRepository.find({ where: { email: In(emails) } });
    const userByEmail = new Map(
      users.map((user) => [user.email.toLowerCase(), user]),
    );

    const workspace = await this.repo.findOne({ where: { id: workspaceId } });
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

  public async getMemberOfWorkspaceByJobId(
    jobId: string,
  ): Promise<WorkspaceMembers[]> {
    const job = await this.repo.manager.getRepository(Job).findOne({
      where: { id: jobId },
      relations: ['asset'],
    });

    if (!job || !job.asset?.targetId) {
      return [];
    }

    const targetId = job.asset.targetId;

    const target = await this.repo.manager.getRepository(Target).findOne({
      where: { id: targetId },
      select: ['workspaceId'],
    });

    if (!target) {
      return [];
    }

    const workspaceIds = [target.workspaceId];

    return this.workspaceMembersRepository.find({
      where: { workspace: { id: In(workspaceIds) } },
      relations: ['user', 'workspace'],
    });
  }
}
