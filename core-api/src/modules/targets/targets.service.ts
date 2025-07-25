import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { GetManyBaseResponseDto } from 'src/common/dtos/get-many-base.dto';
import { JobStatus } from 'src/common/enums/enum';
import { UserContextPayload } from 'src/common/interfaces/app.interface';
import { getManyResponse } from 'src/utils/getManyResponse';
import { Repository } from 'typeorm';
import { AssetsService } from '../assets/assets.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import {
  CreateTargetDto,
  GetManyWorkspaceQueryParamsDto,
} from './dto/targets.dto';
import { Target } from './entities/target.entity';
import { WorkspaceTarget } from './entities/workspace-target.entity';

@Injectable()
export class TargetsService {
  constructor(
    @InjectRepository(Target)
    private readonly repo: Repository<Target>,
    @InjectRepository(WorkspaceTarget)
    private readonly workspaceTargetRepository: Repository<WorkspaceTarget>,
    private readonly workspacesService: WorkspacesService,
    public assetService: AssetsService,
  ) {}

  /**
   * Retrieves a target entity by its ID.
   *
   * @param id - The ID of the target to retrieve.
   * @returns A promise that resolves to the target entity if found, otherwise null.
   */
  public async getTargetById(id: string): Promise<any> {
    const result = await this.repo
      .createQueryBuilder('targets')
      .leftJoin('targets.workspaceTargets', 'workspaceTarget')
      .leftJoin('workspaceTarget.workspace', 'workspace')
      .leftJoin('workspace.workspaceMembers', 'workspaceMember')
      .leftJoin('targets.assets', 'asset')
      .leftJoin('asset.jobs', 'job')
      .where('targets.id = :id', { id })
      .select([
        'targets.id as id',
        'targets.value as value',
        'targets.lastDiscoveredAt as "lastDiscoveredAt"',
        'COALESCE(COUNT(DISTINCT asset.id), 0) AS "totalAssets"',
        `CASE
        WHEN COUNT(CASE WHEN job.status = '${JobStatus.IN_PROGRESS}' THEN 1 END) > 0 THEN '${JobStatus.IN_PROGRESS}'
        WHEN COUNT(CASE WHEN job.status = '${JobStatus.PENDING}' THEN 1 END) > 0 THEN '${JobStatus.PENDING}'
        WHEN COUNT(CASE WHEN job.status = '${JobStatus.COMPLETED}' THEN 1 END) > 0 THEN '${JobStatus.COMPLETED}'
        ELSE '${JobStatus.COMPLETED}'
      END AS status`,
      ])
      .groupBy('targets.id, targets.value, targets.lastDiscoveredAt')
      .getRawOne();

    return result;
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
   * Creates a target entity or associates an existing target with a workspace.
   *
   * @param dto - The data transfer object containing the target details.
   * @param userContextPayload - The user's context data, which includes the user's ID.
   * @returns A promise that resolves to the target entity if created, otherwise a BadRequestException is thrown.
   * @throws BadRequestException if the target already exists in the workspace.
   */
  public async createTarget(
    dto: CreateTargetDto,
    userContext: UserContextPayload,
  ): Promise<Target> {
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

      await this.assetService.createPrimaryAsset({
        target,
        value,
      });
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

    return target;
  }

  /**
   * Retrieves a paginated list of targets associated with a specified workspace.
   *
   * @param id - The ID of the workspace for which to retrieve targets.
   * @param query - The query parameters to filter and paginate the targets.
   * @returns A promise that resolves to a paginated list of targets, including total count and pagination information.
   */
  public async getTargetsInWorkspace(
    query: GetManyWorkspaceQueryParamsDto,
  ): Promise<
    GetManyBaseResponseDto<Target & { totalAssets: number; status: string }>
  > {
    const { limit, page, sortBy, sortOrder, workspaceId, value } = query;

    const offset = (page - 1) * limit;

    const queryBuilder = this.repo
      .createQueryBuilder('targets')
      .innerJoin('targets.workspaceTargets', 'workspaceTarget')
      .innerJoin('workspaceTarget.workspace', 'workspace')
      .innerJoin('workspace.workspaceMembers', 'workspaceMember')
      .leftJoin('targets.assets', 'asset', 'asset.isErrorPage = false')
      .leftJoin('asset.jobs', 'job')
      .where('workspace.id = :workspaceId', { workspaceId })
      .select([
        'targets.id as id',
        'targets.value as value',
        'targets.lastDiscoveredAt as "lastDiscoveredAt"',
        'COUNT(DISTINCT asset.id) AS "totalAssets"',
        `CASE
        WHEN COUNT(CASE WHEN job.status = '${JobStatus.IN_PROGRESS}' THEN 1 END) > 0 THEN '${JobStatus.IN_PROGRESS}'
        WHEN COUNT(CASE WHEN job.status = '${JobStatus.PENDING}' THEN 1 END) > 0 THEN '${JobStatus.PENDING}'
        WHEN COUNT(CASE WHEN job.status = '${JobStatus.COMPLETED}' THEN 1 END) > 0 THEN '${JobStatus.COMPLETED}'
        ELSE '${JobStatus.COMPLETED}'
      END AS status`,
      ])
      .groupBy('targets.id');

    if (value) {
      queryBuilder.andWhere('targets.value LIKE :value', {
        value: `%${value}%`,
      });
    }

    if (sortBy in Target) {
      queryBuilder.orderBy(`targets.${sortBy}`, sortOrder);
    } else {
      queryBuilder.orderBy('targets.createdAt', sortOrder);
    }

    const total = await queryBuilder.getCount();

    const targets = await queryBuilder.limit(limit).offset(offset).getRawMany();

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
