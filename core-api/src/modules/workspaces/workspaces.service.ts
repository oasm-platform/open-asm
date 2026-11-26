import {
  LIMIT_WORKSPACE_CREATE,
  WORKSPACE_COOKIE_NAME,
} from '@/common/constants/app.constants';
import { getWorkspaceIdFromRequest } from '@/common/decorators/workspace-id.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { SortOrder } from '@/common/dtos/get-many-base.dto';
import { ApiKeyType, AuditOutcome } from '@/common/enums/enum';
import { UserContextPayload } from '@/common/interfaces/app.interface';
import { Job } from '@/modules/jobs-registry/entities/job.entity';
import { WorkspaceEncryptionService } from '@/services/workspace-encryption/workspace-encryption.service';
import { getManyResponse } from '@/common/utils/get-many-response.util';
import { SwaggerPropertyMetadata } from '@/common/utils/get-swagger-metadata.util';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import type { NodeRequest, NodeResponse } from '@nestjs/platform-node';
import { DataSource, In, Repository } from 'typeorm';
import { ApiKeysService } from '../apikeys/apikeys.service';
import { ArtifactsService } from '../artifacts/artifacts.service';
import { AuditContext, AuditService } from '../audit/audit.service';
import { Target } from '../targets/entities/target.entity';
import { GetWorkspaceConfigsDto } from './dto/get-workspace-configs.dto';
import { UpdateWorkspaceConfigsDto } from './dto/update-workspace-configs.dto';
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
import { Workspace } from './entities/workspace.entity';
import {
  WORKSPACE_DELETING_EVENT,
  WORKSPACE_INITIALIZING_EVENT,
  type WorkspaceDeletingEvent,
  type WorkspaceInitializingEvent,
} from './workspace.events';
import { ForbiddenError, InvalidInputError, NotFoundError } from '@/common/errors/domain.errors';


@Injectable()
export class WorkspacesService implements OnModuleInit {

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
    private apiKeyService: ApiKeysService,
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
      // IntegrationSyncService.resolveActingUser needs the workspace owner to
      // act on behalf of scheduled syncs — without the relation, `owner` is
      // never loaded. ReportRunner only reads the name and ignores it.
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
