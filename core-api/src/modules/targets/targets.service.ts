import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { WorkspaceTarget } from './entities/workspace-target.entity';
import { Target } from './entities/target.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateTargetDto } from './dto/targets.dto';
import { UserContextPayload } from 'src/common/interfaces/app.interface';
import {
  GetManyBaseQueryParams,
  GetManyResponseDto,
} from 'src/common/dtos/get-many-base.dto';
import { getManyResponse } from 'src/utils/getManyResponse';
import { Asset } from '../assets/entities/assets.entity';
import { AssetsService } from '../assets/assets.service';

@Injectable()
export class TargetsService {
  constructor(
    @InjectRepository(Target)
    private readonly repo: Repository<Target>,
    @InjectRepository(WorkspaceTarget)
    private readonly workspaceTargetRepository: Repository<WorkspaceTarget>,
    private readonly workspacesService: WorkspacesService,
    private assetService: AssetsService,
  ) {}

  /**
   * Retrieves a target entity by its ID.
   *
   * @param id - The ID of the target to retrieve.
   * @returns A promise that resolves to the target entity if found, otherwise null.
   */
  public async getTargetById(id: string): Promise<Target | null> {
    return this.repo.findOneBy({ id });
  }

  /**
   * Retrieves a target entity by its value.
   *
   * @param value - The unique value of the target to retrieve.
   * @returns A promise that resolves to the target entity if found, otherwise null.
   */
  private async getTargetByValue(value: string): Promise<Target | null> {
    return this.repo.findOneBy({ value });
  }

  /**
   * Creates a target and associates it with a workspace.
   * If the target does not exist, it will be created.
   * Only the owner of the workspace can create a target.
   *
   * @param dto - The data transfer object containing target details.
   * @param userContext - The user's context data, which includes the user's ID.
   * @throws NotFoundException if the workspace does not exist.
   * @throws BadRequestException if the user is not the owner of the workspace.
   * @returns A response indicating the target was successfully created.
   */
  public async createTarget(
    dto: CreateTargetDto,
    userContext: UserContextPayload,
  ) {
    const { workspaceId, value } = dto;

    // Check if the workspace exists and the user is the owner
    const workspace = await this.workspacesService.getWorkspaceByIdAndOwner(
      workspaceId,
      userContext,
    );

    let target = await this.getTargetByValue(value);

    // If the target does not exist, create it
    if (!target) {
      target = await this.repo.save({ value });

      await this.workspaceTargetRepository.save({
        workspace,
        target,
      });

      await this.assetService.createAssets(target);
    }
    // If the target exists, check if it is already associated with the workspace
    else {
      const workspaceTarget = await this.workspaceTargetRepository.findOne({
        where: {
          workspace: { id: workspace.id },
          target: { id: target.id },
        },
        relations: ['workspace', 'target'],
      });

      if (workspaceTarget) {
        throw new BadRequestException(
          'Targer has field "value" existed in workspace',
        );
      }
      await this.workspaceTargetRepository.save({
        workspace,
        target,
      });
    }

    return { message: 'Target created successfully' };
  }

  /**
   * Retrieves a paginated list of targets associated with a specified workspace.
   *
   * @param id - The ID of the workspace for which to retrieve targets.
   * @param query - The query parameters to filter and paginate the targets.
   * @returns A promise that resolves to a paginated list of targets, including total count and pagination information.
   */
  public async getTargetsInWorkspace(
    id: string,
    query: GetManyBaseQueryParams,
  ): Promise<GetManyResponseDto<Target>> {
    const { limit, page, sortBy, sortOrder } = query;

    // Create query builder from repository and join tables
    const queryBuilder = this.repo
      .createQueryBuilder('target')
      .innerJoin('target.workspaceTargets', 'workspaceTarget')
      .innerJoin('workspaceTarget.workspace', 'workspace')
      .innerJoin('workspace.workspaceMembers', 'workspaceMember')
      .where('workspace.id = :workspaceId', { workspaceId: id });

    if (query.sortBy in Target) {
      queryBuilder.orderBy(`target.${sortBy}`, sortOrder);
    } else {
      queryBuilder.orderBy('target.createdAt', sortOrder);
    }

    const total = await queryBuilder.getCount();

    const offset = (page - 1) * limit;

    queryBuilder.limit(limit).offset(offset);

    const targets = await queryBuilder.getMany();

    return getManyResponse(query, targets, total);
  }

  /**
   * Deletes a target from a workspace, but only if the requesting user is the owner of the workspace.
   *
   * @param id - The ID of the target to be deleted.
   * @param workspaceId - The ID of the workspace from which the target will be deleted.
   * @param userContext - The user's context data, which includes the user's ID.
   * @throws NotFoundException if the target is not found in the workspace.
   * @returns A response indicating the target was successfully deleted.
   */
  public async deleteTargetFromWorkspace(
    id: string,
    workspaceId: string,
    userContext: UserContextPayload,
  ) {
    await this.workspacesService.getWorkspaceByIdAndOwner(
      workspaceId,
      userContext,
    );

    const workspaceTarget = await this.workspaceTargetRepository.findOneBy({
      target: { id },
      workspace: { id: workspaceId },
    });

    if (!workspaceTarget) {
      throw new NotFoundException('Target not found in workspace');
    }

    await this.workspaceTargetRepository.delete({
      target: { id },
      workspace: { id: workspaceId },
    });

    return { message: 'Target deleted successfully' };
  }
}
