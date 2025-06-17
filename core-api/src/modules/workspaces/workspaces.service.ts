import { Injectable, NotFoundException } from '@nestjs/common';
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
import { CreateWorkspaceDto } from './dto/workspaces.dto';

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
    try {
      const newWorkspace = await this.repo.save({
        name: dto.name,
        description: dto.description,
        owner: userContextPayload.user,
      });

      await this.workspaceMembersRepository.save({
        workspace: newWorkspace,
        user: userContextPayload.user,
      });
      return { message: 'Workspace created successfully' };
    } catch (error) {
      return { message: error.message };
    }
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
   * Retrieves a workspace by ID, but only if the workspace belongs to the user.
   * @param id - The ID of the workspace to retrieve.
   * @param userContext - The user's context data, which includes the user's ID.
   * @returns The workspace if it exists and belongs to the user, otherwise throws a NotFoundException.
   */
  public async getWorkspaceById(
    id: string,
    userContext: UserContextPayload,
  ): Promise<Workspace> {
    const workspace = await this.repo.findOne({
      where: {
        id: id,
        owner: { id: userContext.user.id },
      },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    return workspace;
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

    await this.repo.delete({ id });
    return {
      message: 'Workspace deleted successfully',
    };
  }
}
