import { LIMIT_WORKSPACE_CREATE } from '@/common/constants/app.constants';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { SortOrder } from '@/common/dtos/get-many-base.dto';
import { ApiKeyType } from '@/common/enums/enum';
import { UserContextPayload } from '@/common/interfaces/app.interface';
import { getManyResponse } from '@/utils/getManyResponse';
import getSwaggerMetadata, {
  SwaggerPropertyMetadata,
} from '@/utils/getSwaggerMetadata';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { In, Repository } from 'typeorm';
import { ApiKeysService } from '../apikeys/apikeys.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Target } from '../targets/entities/target.entity';
import { WorkspaceTarget } from '../targets/entities/workspace-target.entity';
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
    @InjectRepository(WorkspaceTarget)
    private readonly workspaceTargetRepository: Repository<WorkspaceTarget>,
    private apiKeyService: ApiKeysService,
    private notificationsService: NotificationsService,
    private workflowsService: WorkflowsService,
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

    const newWorkspace = await this.repo.save({
      id: newWorkspaceId,
      name: dto.name,
      description: dto?.description,
      owner: { id },
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
  ) {
    const { limit, page, sortOrder, isArchived } = query;
    let { sortBy } = query;
    const { id } = userContextPayload;

    if (!(sortBy in Workspace)) {
      sortBy = 'createdAt';
    }

    // Validate sortBy to prevent SQL injection
    const allowedSortFields = [
      'id',
      'name',
      'createdAt',
      'updatedAt',
      'archivedAt',
    ];
    if (!allowedSortFields.includes(sortBy)) {
      sortBy = 'createdAt';
    }

    // Build WHERE clause based on isArchived
    const archivedCondition =
      isArchived === true
        ? 'AND w."archivedAt" IS NOT NULL'
        : isArchived === false
          ? 'AND w."archivedAt" IS NULL'
          : '';

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM workspaces w
      WHERE w."ownerId" = $1 ${archivedCondition}
    `;
    const countResult: { total: string }[] = await this.repo.query(countQuery, [
      id,
    ]);
    const total = parseInt(countResult[0]?.total || '0', 10);

    // Get paginated data with target and member counts
    const offset = (page - 1) * limit;
    const validSortOrder: 'ASC' | 'DESC' =
      sortOrder === SortOrder.ASC ? 'ASC' : 'DESC';

    const dataQuery = `
      SELECT
        w."id" as workspace_id,
        w."name" as workspace_name,
        w."description" as workspace_description,
        w."createdAt" as workspace_createdAt,
        w."updatedAt" as workspace_updatedAt,
        w."archivedAt" as workspace_archivedAt,
        w."isAssetsDiscovery" as workspace_isAssetsDiscovery,
        w."isAutoEnableAssetAfterDiscovered" as workspace_isAutoEnableAssetAfterDiscovered,
        w."ownerId" as workspace_ownerId,
        COALESCE(t.target_count, 0)::integer as targetcount,
        COALESCE(m.member_count, 0)::integer as membercount
      FROM workspaces w
      LEFT JOIN (
        SELECT "workspaceId", COUNT(*) as target_count
        FROM workspace_targets
        GROUP BY "workspaceId"
      ) t ON t."workspaceId" = w."id"
      LEFT JOIN (
        SELECT "workspaceId", COUNT(*) as member_count
        FROM workspace_members
        GROUP BY "workspaceId"
      ) m ON m."workspaceId" = w."id"
      WHERE w."ownerId" = $1 ${archivedCondition}
      ORDER BY w."${sortBy}" ${validSortOrder}
      LIMIT $2 OFFSET $3
    `;

    const rawData: Record<string, unknown>[] = await this.repo.query(
      dataQuery,
      [id, limit, offset],
    );

    // Map raw data to expected format
    const mappedData = rawData.map((row) => ({
      id: row.workspace_id as string,
      name: row.workspace_name as string,
      description: row.workspace_description as string | null,
      createdAt: row.workspace_createdAt as Date,
      updatedAt: row.workspace_updatedAt as Date,
      archivedAt: row.workspace_archivedAt as Date | null,
      isAssetsDiscovery: row.workspace_isAssetsDiscovery as boolean,
      isAutoEnableAssetAfterDiscovered:
        row.workspace_isAutoEnableAssetAfterDiscovered as boolean,
      ownerId: row.workspace_ownerId as string,
      targetCount: Number(row.targetcount) || 0,
      memberCount: Number(row.membercount) || 0,
    }));

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
    // Use transaction to ensure atomicity of deletion
    const result = await this.repo.manager.transaction(
      async (transactionalEntityManager) => {
        // Get target IDs from workspace_targets using createQueryBuilder
        const workspaceTargets = await transactionalEntityManager
          .getRepository(WorkspaceTarget)
          .createQueryBuilder('workspaceTarget')
          .innerJoin('workspaceTarget.workspace', 'workspace')
          .innerJoin('workspaceTarget.target', 'target')
          .where('workspace.id = :workspaceId', { workspaceId })
          .select(['target.id as id'])
          .getRawMany<{ id: string }>();

        const targetIds = workspaceTargets.map((wt) => wt.id);

        if (targetIds.length === 0) {
          return { deletedTargetIds: [] };
        }

        // Delete all workspace targets for this workspace
        await transactionalEntityManager
          .getRepository(WorkspaceTarget)
          .createQueryBuilder()
          .delete()
          .where('"workspaceId" = :workspaceId', { workspaceId })
          .execute();

        // Delete the actual targets
        await transactionalEntityManager
          .getRepository(Target)
          .createQueryBuilder()
          .delete()
          .where('id IN (:...targetIds)', { targetIds })
          .execute();

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
    const swaggerMetadata = getSwaggerMetadata(Workspace);

    const workspace = await this.getWorkspaceByIdAndOwner(
      workspaceId,
      userContext,
    );

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const result = new GetWorkspaceConfigsDto();
    const keyConfigs = Object.keys(result);
    keyConfigs.forEach((key) => {
      result[key] = {
        ...swaggerMetadata[key],
        value: workspace[key] as Workspace,
      } as SwaggerPropertyMetadata;
    });

    return result;
  }

  /**
   * Retrieves the workspace ID associated with a target ID by joining through the workspace_targets table.
   * @param targetId - The ID of the target to look up.
   * @returns The workspace ID associated with the target, or null if not found.
   */
  public async getWorkspaceIdByTargetId(
    targetId: string,
  ): Promise<string | null> {
    const workspaceTarget = await this.workspaceTargetRepository
      .createQueryBuilder('workspaceTarget')
      .innerJoin('workspaceTarget.workspace', 'workspace')
      .innerJoin('workspaceTarget.target', 'target')
      .select('workspace.id', 'workspaceId')
      .where('target.id = :targetId', { targetId })
      .cache(60000)
      .getRawOne<{ workspaceId: string }>();

    return workspaceTarget ? workspaceTarget.workspaceId : null;
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
    const workspace = await this.repo
      .createQueryBuilder('workspace')
      .leftJoinAndSelect('workspace.owner', 'owner')
      .leftJoin('workspace.workspaceMembers', 'member')
      .where('workspace.id = :workspaceId', { workspaceId: id })
      .andWhere('member.user.id = :userId', { userId })
      .getOne();

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
}
