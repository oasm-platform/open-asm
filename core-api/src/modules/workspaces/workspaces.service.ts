import {
  LIMIT_WORKSPACE_CREATE,
  WORKSPACE_COOKIE_NAME,
} from '@/common/constants/app.constants';
import { getWorkspaceIdFromRequest } from '@/common/decorators/workspace-id.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { SortOrder } from '@/common/dtos/get-many-base.dto';
import { ApiKeyType, WorkspaceRole } from '@/common/enums/enum';
import { UserContextPayload } from '@/common/interfaces/app.interface';
import { Job } from '@/modules/jobs-registry/entities/job.entity';
import { WorkspaceEncryptionService } from '@/services/workspace-encryption/workspace-encryption.service';
import { getManyResponse } from '@/utils/getManyResponse';
import { SwaggerPropertyMetadata } from '@/utils/getSwaggerMetadata';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { In, Repository } from 'typeorm';
import { ApiKeysService } from '../apikeys/apikeys.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Target } from '../targets/entities/target.entity';
import { WorkflowsService } from '../workflows/workflows.service';
import { GetWorkspaceConfigsDto } from './dto/get-workspace-configs.dto';
import { UpdateWorkspaceConfigsDto } from './dto/update-workspace-configs.dto';
import {
  CreateWorkspaceDto,
  GetApiKeyResponseDto,
  GetManyWorkspacesDto,
  UpdateWorkspaceDto,
} from './dto/workspaces.dto';
import { WorkspaceMembers } from './entities/workspace-members.entity';
import { Workspace } from './entities/workspace.entity';

@Injectable()
export class WorkspacesService implements OnModuleInit {
  constructor(
    @InjectRepository(Workspace)
    private readonly repo: Repository<Workspace>,
    @InjectRepository(WorkspaceMembers)
    private readonly workspaceMembersRepository: Repository<WorkspaceMembers>,
    private apiKeyService: ApiKeysService,
    private notificationsService: NotificationsService,
    private workflowsService: WorkflowsService,
    private workspaceEncryptionService: WorkspaceEncryptionService,
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
      throw new BadRequestException('You have reached the limit of workspaces');
    }

    const newWorkspaceId = randomUUID();

    // Generate wrapped DEK via centralized encryption service
    const wrappedDEK = this.workspaceEncryptionService.generateWrappedDEK();

    const newWorkspace = await this.repo.save({
      id: newWorkspaceId,
      name: dto.name,
      description: dto?.description,
      owner: { id },
      dek: wrappedDEK,
      dekAt: new Date(),
      // apiKey: generateToken(API_KEY_LENGTH),
    });

    await this.workspaceMembersRepository.save({
      workspace: newWorkspace,
      user: { id },
    });

    await this.workflowsService.createDefaultWorkflows(newWorkspace.id);

    return newWorkspace;
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
    req: Request,
    res: Response,
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
        wm.role,
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
      res.cookie(WORKSPACE_COOKIE_NAME, '');
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
      role: row.role as WorkspaceRole,
    }));

    const defaultWorkspace = mappedData[0].id;
    const workspaceId = getWorkspaceIdFromRequest(req);
    const selectedWorkspaceId =
      mappedData.some((workspace) => workspace.id === workspaceId)
        ? workspaceId
        : defaultWorkspace;

    // Batch-load workspace members for all returned workspaces
    const workspaceIds = mappedData.map((w) => w.id);
    const members = await this.workspaceMembersRepository.find({
      where: { workspace: { id: In(workspaceIds) } },
      relations: ['user'],
    });

    // TypeORM adds implicit FK columns (workspaceId) on ManyToOne relations
    const membersByWorkspace = new Map<string, WorkspaceMembers[]>();
    for (const member of members) {
      const wsId = (member as unknown as { workspaceId: string }).workspaceId;
      if (!membersByWorkspace.has(wsId)) {
        membersByWorkspace.set(wsId, []);
      }
      membersByWorkspace.get(wsId)!.push(member);
    }

    for (const item of mappedData) {
      (item as unknown as { workspaceMembers: WorkspaceMembers[] }).workspaceMembers =
        membersByWorkspace.get(item.id) ?? [];
    }

    res.cookie(WORKSPACE_COOKIE_NAME, selectedWorkspaceId);
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
    userContext: UserContextPayload,
  ) {
    await this.getWorkspaceByIdAndOwner(id, userContext);

    await this.repo.update({ id }, { ...dto });

    return { message: 'Workspace updated successfully' };
  }

  /**
   * Deletes all targets associated with a specific workspace.
   * Uses transaction and createQueryBuilder for atomic operation.
   *
   * @param workspaceId - The ID of the workspace whose targets will be deleted.
   * @returns An object containing the list of deleted target IDs.
   */
  public async deleteAllTargetsFromWorkspace(
    workspaceId: string,
  ): Promise<{ deletedTargetIds: string[] }> {
    const result = await this.repo.manager.transaction(
      async (transactionalEntityManager) => {
        const result = await transactionalEntityManager
          .getRepository(Target)
          .createQueryBuilder()
          .delete()
          .where('"workspaceId" = :workspaceId', { workspaceId })
          .returning('id')
          .execute();

        const raw = result.raw as { id: string }[] | undefined;
        const targetIds = (raw ?? []).map((r) => r.id);

        return { deletedTargetIds: targetIds };
      },
    );

    return result;
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
    userContext: UserContextPayload,
  ): Promise<DefaultMessageResponseDto> {
    await this.getWorkspaceByIdAndOwner(id, userContext);

    // Delete all targets associated with the workspace first
    await this.deleteAllTargetsFromWorkspace(id);

    await this.repo.delete({ id });

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
    userContext: UserContextPayload,
  ): Promise<GetApiKeyResponseDto> {
    const apiKey = await this.apiKeyService.create({
      name: `API Key for workspace ${workspaceId}`,
      type: ApiKeyType.WORKSPACE,
      ref: workspaceId,
    });

    const workspace = await this.getWorkspaceByIdAndOwner(
      workspaceId,
      userContext,
    );

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
    userContext: UserContextPayload,
  ): Promise<GetWorkspaceConfigsDto> {
    const workspace = await this.getWorkspaceByIdAndOwner(
      workspaceId,
      userContext,
    );

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
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
      throw new NotFoundException('Workspace not found');
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
    userContext: UserContextPayload,
  ) {
    await this.getWorkspaceByIdAndOwner(workspaceId, userContext);
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
    await this.getWorkspaceByIdAndOwner(workspaceId, userContext);
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
   * @returns The workspace, if found and the user is a member. Otherwise, null.
   */
  public async getWorkspaceById(
    id: string,
    userContext: UserContextPayload,
  ): Promise<Workspace> {
    const userId = userContext.id;

    // Check if user is a member of the workspace
    const isMember = await this.workspaceMembersRepository.findOne({
      where: { workspace: { id }, user: { id: userId } },
    });

    if (!isMember) {
      throw new NotFoundException('Workspace not found');
    }

    // Load workspace with owner and members
    const workspace = await this.repo.findOne({
      where: { id },
      relations: ['owner', 'workspaceMembers', 'workspaceMembers.user'],
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
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
      throw new ForbiddenException('You are not the owner of this workspace');
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
    userContext: UserContextPayload,
  ): Promise<DefaultMessageResponseDto> {
    await this.getWorkspaceByIdAndOwner(id, userContext);

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
   * Retrieves a workspace member by workspace ID and user ID.
   * @param workspaceId - The ID of the workspace to be retrieved.
   * @param userId - The ID of the user to be retrieved.
   * @returns The workspace member, if found.
   * @throws NotFoundException if the workspace member does not exist.
   */
  private async getWorkspaceMember(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMembers> {
    const workspaceMember = await this.workspaceMembersRepository.findOne({
      where: {
        workspace: { id: workspaceId },
        user: { id: userId },
      },
      relations: ['workspace', 'user'],
    });

    if (!workspaceMember) {
      throw new NotFoundException('Workspace member not found');
    }

    return workspaceMember;
  }

  /**
   * Retrieves all members of a workspace.
   * @param workspaceId - The ID of the workspace.
   * @returns A promise that resolves to an array of workspace members with user details.
   */
  public async getMembersByWorkspaceId(
    workspaceId: string,
  ): Promise<WorkspaceMembers[]> {
    return this.workspaceMembersRepository.find({
      where: {
        workspace: { id: workspaceId },
      },
      relations: ['user'],
    });
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
