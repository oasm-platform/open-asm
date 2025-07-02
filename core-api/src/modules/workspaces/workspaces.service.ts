import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DefaultMessageResponseDto } from 'src/common/dtos/default-message-response.dto';
import {
  GetManyBaseQueryParams,
  GetManyBaseResponseDto,
} from 'src/common/dtos/get-many-base.dto';
import { UserContextPayload } from 'src/common/interfaces/app.interface';
import { getManyResponse } from 'src/utils/getManyResponse';
import { DataSource, Repository } from 'typeorm';
import {
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  WorkspaceStatisticsResponseDto,
} from './dto/workspaces.dto';
import { WorkspaceMembers } from './entities/workspace-members.entity';
import { Workspace } from './entities/workspace.entity';
import { JobStatus, WorkerName } from 'src/common/enums/enum';
import { Asset } from '../assets/entities/assets.entity';
import { Job } from '../jobs-registry/entities/job.entity';
import { WorkspaceTarget } from '../targets/entities/workspace-target.entity';
import { WorkspaceStatisticsRepository } from './workspaces-statistics.repository';
import { stat } from 'fs';

@Injectable()
export class WorkspacesService {
  constructor(
    @InjectRepository(Workspace)
    private readonly repo: Repository<Workspace>,
    @InjectRepository(WorkspaceMembers)
    private readonly workspaceMembersRepository: Repository<WorkspaceMembers>,
    private dataSource: DataSource,

    private readonly workspaceStatisticsRepository: WorkspaceStatisticsRepository,
  ) {}

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

    const newWorkspace = await this.repo.save({
      name: dto.name,
      description: dto?.description,
      owner: { id },
    });

    await this.workspaceMembersRepository.save({
      workspace: newWorkspace,
      user: { id },
    });

    return newWorkspace;
  }

  /**
   * Retrieves a list of workspaces that the user is a member of.
   * @param query - The query parameters to filter and paginate the workspaces.
   * @param userContextPayload - The user's context data, which includes the user's ID.
   * @returns A paginated list of workspaces, along with the total count and page information.
   */
  public async getWorkspaces(
    query: GetManyBaseQueryParams,
    userContextPayload: UserContextPayload,
  ): Promise<GetManyBaseResponseDto<Workspace>> {
    const { limit, page, sortOrder } = query;
    let { sortBy } = query;
    const { id } = userContextPayload;

    if (!(sortBy in Workspace)) {
      sortBy = 'createdAt';
    }
    const [data, total] = await this.repo.findAndCount({
      where: {
        owner: { id },
      },
      take: query.limit,
      skip: (page - 1) * limit,
      order: {
        [sortBy]: sortOrder,
      },
    });

    return getManyResponse(query, data, total);
  }

  /**
   * Retrieves workspace statistics.
   * @param id - The ID of the workspace for which to retrieve statistics.
   * @param userContext - The user's context data, which includes the user's ID.
   * @returns An object containing workspace statistics, including
   * the number of targets, assets, technologies, CNAME records, and status codes.
   */
  public async getWorkspaceStatistics(
    id: string,
    userContext: UserContextPayload,
  ): Promise<WorkspaceStatisticsResponseDto | null> {
    const workspace = await this.getWorkspaceById(id, userContext);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    return await this.workspaceStatisticsRepository.getStatisticsByWorkspaceId(
      id,
    );
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
  ): Promise<Workspace | null> {
    const userId = userContext.id;
    const workspace = await this.repo
      .createQueryBuilder('workspace')
      .leftJoinAndSelect('workspace.owner', 'owner')
      .leftJoin('workspace.workspaceMembers', 'member')
      .where('workspace.id = :workspaceId', { workspaceId: id })
      .andWhere('member.user.id = :userId', { userId })
      .getOne();

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

    await this.repo.update({ id: id }, { ...dto });

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
}
