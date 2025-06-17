import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
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
    private readonly workspaceRepository: Repository<Workspace>,
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
      const newWorkspace = await this.workspaceRepository.save({
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

    const [data, total] = await this.workspaceRepository.findAndCount({
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
}
