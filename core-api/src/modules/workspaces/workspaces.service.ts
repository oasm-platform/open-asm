import { LIMIT_WORKSPACE_CREATE } from '@/common/constants/app.constants';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { GetManyBaseResponseDto } from '@/common/dtos/get-many-base.dto';
import {
  ApiKeyType,
  NotificationScope,
  NotificationType,
} from '@/common/enums/enum';
import { UserContextPayload } from '@/common/interfaces/app.interface';
import { getManyResponse } from '@/utils/getManyResponse';
import getSwaggerMetadata, {
  SwaggerPropertyMetadata,
} from '@/utils/getSwaggerMetadata';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ApiKeysService } from '../apikeys/apikeys.service';
import { NotificationsService } from '../notifications/notifications.service';
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
    @Inject(forwardRef(() => WorkflowsService))
    private workflowsService: WorkflowsService,
  ) { }

  async onModuleInit() { }

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

    const newWorkspace = await this.repo.save({
      name: dto.name,
      description: dto?.description,
      owner: { id },
      // apiKey: generateToken(API_KEY_LENGTH),
    });

    await this.workspaceMembersRepository.save({
      workspace: newWorkspace,
      user: { id },
    });

    await this.notificationsService.createNotification({
      recipients: [id],
      scope: NotificationScope.USER,
      type: NotificationType.WORKSPACE_CREATED,
      metadata: {
        name: newWorkspace.name,
      },
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
  ): Promise<GetManyBaseResponseDto<Workspace>> {
    const { limit, page, sortOrder, isArchived } = query;
    let { sortBy } = query;
    const { id } = userContextPayload;

    if (!(sortBy in Workspace)) {
      sortBy = 'createdAt';
    }

    const queryBuilder = this.repo
      .createQueryBuilder('workspace')
      .where('workspace.ownerId = :id', { id });
    if (isArchived !== undefined) {
      if (isArchived) {
        queryBuilder.andWhere('workspace.archivedAt IS NOT NULL');
      } else {
        queryBuilder.andWhere('workspace.archivedAt IS NULL');
      }
    }

    const [data, total] = await queryBuilder
      .orderBy(`workspace.${sortBy}`, sortOrder)
      .take(limit)
      .skip((page - 1) * limit)
      .getManyAndCount();

    return getManyResponse({ query, data, total });
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

    await this.repo.softDelete({ id });

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
