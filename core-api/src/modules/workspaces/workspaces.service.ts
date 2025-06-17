import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DefaultMessageResponseDto } from 'src/common/dtos/default-message-response.dto';
import {
  GetManyBaseQueryParams,
  GetManyResponseDto,
} from 'src/common/dtos/get-many-base.dto';
import { UserContextPayload } from 'src/common/interfaces/app.interface';
import { getManyResponse } from 'src/utils/getManyResponse';
import { Repository } from 'typeorm';
import { WorkspaceMembers } from './entities/workspace-members.entity';
import { Workspace } from './entities/workspace.entity';
import { CreateWorkspaceDto, UpdateWorkspaceDto } from './dto/workspaces.dto';

@Injectable()
export class WorkspacesService {
  constructor(
    @InjectRepository(Workspace)
    private readonly repo: Repository<Workspace>,
    @InjectRepository(WorkspaceMembers)
    private readonly workspaceMembersRepository: Repository<WorkspaceMembers>,
  ) {}

  /**
   * Creates a new workspace.
   * @param dto - The workspace data.
   * @param userContextPayload - The user's context data, which includes the user's ID.
   * @returns A message indicating if the workspace was created successfully or not.
   */

  public async createWorkspace(
    dto: CreateWorkspaceDto,
    userContextPayload: UserContextPayload,
  ) {
    const newWorkspace = await this.repo.save({
      name: dto.name,
      description: dto?.description,
      owner: userContextPayload.user,
    });

    await this.workspaceMembersRepository.save({
      workspace: newWorkspace,
      user: userContextPayload.user,
    });
    return { message: 'Workspace created successfully' };
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
  ): Promise<GetManyResponseDto<Workspace>> {
    const { limit, page, sortBy, sortOrder } = query;
    const user = userContextPayload.user;

    const [data, total] = await this.repo.findAndCount({
      where: {
        owner: user,
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
   * Retrieves a workspace by its ID, if the user is a member of the workspace.
   * @param id - The ID of the workspace to be retrieved.
   * @param userContext - The user's context data, which includes the user's ID.
   * @returns The workspace, if found.
   * @throws NotFoundException if the workspace does not exist or the user is not a member.
   */
  public async getWorkspaceById(
    id: string,
    userContext: UserContextPayload,
  ): Promise<Workspace> {
    const userId = userContext.user.id;
    const workspace = await this.repo
      .createQueryBuilder('workspace')
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
   * Updates a workspace by ID.
   * @param id - The ID of the workspace to be updated.
   * @param dto - The updated workspace data.
   * @param userContext - The user's context data, which includes the user's ID.
   * @returns A response indicating the workspace was successfully updated.
   * @throws BadRequestException if the user is not the owner of the workspace.
   */
  public async updateWorkspace(
    id: string,
    dto: UpdateWorkspaceDto,
    userContext: UserContextPayload,
  ) {
    const userId = userContext.user.id;

    const workspaceMember = await this.getWorkspaceMember(id, userId);

    if (workspaceMember.user.id === userContext.user.id) {
      await this.repo.update({ id: id }, { ...dto });

      return { message: 'Workspace updated successfully' };
    }
    throw new BadRequestException('You are not the owner of this workspace');
  }

  /**
   * Deletes a workspace by its ID.
   * @param id - The ID of the workspace to be deleted.
   * @param userContext - The user's context data, which includes the user's ID.
   * @returns A response indicating the workspace was successfully deleted.
   * @throws NotFoundException if the workspace does not exist or the user is not the owner.
   */
  public async deleteWorkspace(
    id: string,
    userContext: UserContextPayload,
  ): Promise<DefaultMessageResponseDto> {
    await this.getWorkspaceById(id, userContext);

    await this.repo.softDelete({ id });
    return {
      message: 'Workspace deleted successfully',
    };
  }
}
