import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  GetManyBaseQueryParams,
  GetManyResponseDto,
} from 'src/common/dtos/get-many-base.dto';
import { UserContextPayload } from 'src/common/interfaces/app.interface';
import { Repository } from 'typeorm';
import { WorkspaceMembers } from './entities/workspace-members.entity';
import { Workspace } from './entities/workspace.entity';

@Injectable()
export class WorkspacesService {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
    @InjectRepository(WorkspaceMembers)
    private readonly workspaceMembersRepository: Repository<WorkspaceMembers>,
  ) {}

  public async getWorkspaces(
    query: GetManyBaseQueryParams,
    userContextPayload: UserContextPayload,
  ): Promise<GetManyResponseDto<Workspace>> {
    const { limit, page, sortBy, sortOrder } = query;
    const {
      user: { id },
    } = userContextPayload;
    const [data, total] = await this.workspaceRepository.findAndCount({
      where: {
        ownerId: { id: id },
      },
      take: query.limit,
      skip: (page - 1) * limit,
      order: {
        [sortBy]: sortOrder,
      },
    });
    return {
      data,
      total,
      page,
      limit,
      pageCount: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
    };
  }
}
