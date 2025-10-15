import { GetManyBaseResponseDto } from '@/common/dtos/get-many-base.dto';
import { BullMQName, JobStatus } from '@/common/enums/enum';
import { UserContextPayload } from '@/common/interfaces/app.interface';
import { getManyResponse } from '@/utils/getManyResponse';
import { InjectQueue } from '@nestjs/bullmq';
import {
  Injectable,
  NotFoundException,
  OnModuleInit
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { AssetsService } from '../assets/assets.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import {
  CreateTargetDto,
  GetManyWorkspaceQueryParamsDto,
  UpdateTargetDto,
} from './dto/targets.dto';
import { Target } from './entities/target.entity';
import { WorkspaceTarget } from './entities/workspace-target.entity';

@Injectable()
export class TargetsService implements OnModuleInit {
  constructor(
    @InjectRepository(Target)
    private readonly repo: Repository<Target>,
    @InjectRepository(WorkspaceTarget)
    private readonly workspaceTargetRepository: Repository<WorkspaceTarget>,
    private readonly workspacesService: WorkspacesService,
    public assetService: AssetsService,
    private eventEmitter: EventEmitter2,
    @InjectQueue(BullMQName.SCAN_SCHEDULE) private scanScheduleQueue: Queue<Target>
  ) { }

  async onModuleInit() {
    await this.handleUpdateScanSchedule();
  }
  /**
   * Retrieves a target entity by its ID.
   *
   * @param id - The ID of the target to retrieve.
   * @returns A promise that resolves to the target entity if found, otherwise null.
   */
  public async getTargetById(id: string): Promise<Target> {
    const result = (await this.repo
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
        'targets.scanSchedule as "scanSchedule"',
        `CASE
        WHEN COUNT(CASE WHEN job.status = '${JobStatus.IN_PROGRESS}' THEN 1 END) > 0 THEN '${JobStatus.IN_PROGRESS}'
        WHEN COUNT(CASE WHEN job.status = '${JobStatus.PENDING}' THEN 1 END) > 0 THEN '${JobStatus.PENDING}'
        WHEN COUNT(CASE WHEN job.status = '${JobStatus.COMPLETED}' THEN 1 END) > 0 THEN '${JobStatus.COMPLETED}'
        ELSE '${JobStatus.COMPLETED}'
      END AS status`,
      ])
      .groupBy(
        'targets.id, targets.value, targets.lastDiscoveredAt, targets.scanSchedule',
      )
      .getRawOne()) as Target;

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

    const target = await this.repo.save({ value });

    await this.workspaceTargetRepository.save({
      workspace,
      target,
    });

    await this.assetService.createPrimaryAsset({
      target,
      value,
    });

    // Trigger workflow run assets discovery
    const workspaceConfigs = await this.workspacesService.getWorkspaceConfigValue(workspaceId);

    if (workspaceConfigs.isAssetsDiscovery) {
      this.eventEmitter.emit('target.create', target);
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
    workspaceId: string,
  ): Promise<
    GetManyBaseResponseDto<
      Target & { totalAssets: number; status: string; duration: number }
    >
  > {
    const { limit, page, sortBy, sortOrder, value } = query;

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
        'targets.reScanCount as "reScanCount"',
        'targets.scanSchedule as "scanSchedule"',
        'CAST(COUNT(DISTINCT asset.id) AS INTEGER) AS "totalAssets"',
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

    if (sortBy === 'totalAssets' || sortBy === 'duration') {
      queryBuilder.orderBy(`"${sortBy}"`, sortOrder);
    } else if (sortBy in Target) {
      queryBuilder.orderBy(`targets.${sortBy}`, sortOrder);
    } else {
      queryBuilder.orderBy('targets.createdAt', sortOrder);
    }

    const total = await queryBuilder.getCount();

    const targets = await queryBuilder.limit(limit).offset(offset).getRawMany();

    return getManyResponse({ query, data: targets, total });
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

  /**
   * Updates a target.
   *
   * @param id - The ID of the target to be updated.
   * @param dto - The data transfer object containing the target details to be updated.
   * @throws NotFoundException if the target is not found.
   * @returns The updated target entity.
   */
  public async updateTarget(id: string, dto: UpdateTargetDto) {
    const target = await this.repo.findOneBy({ id });
    if (!target) {
      throw new NotFoundException('Target not found');
    }

    // Update the target in the database
    const result = await this.repo.update(id, dto);

    // If scanSchedule was updated, also update the job in BullMQ
    if (dto.scanSchedule !== undefined) {
      await this.updateTargetScanScheduleJob(id, dto.scanSchedule);
    }

    return result;
  }

  /**
   * Handles scheduling of targets for rescan based on their scan schedules.
   *
   * This function is scheduled to run every day at 00:00.
   * It retrieves all targets with a scan schedule, and adds a new BullMQ job for each target.
   * The BullMQ job will trigger a rescan of the target every time it runs according to its cron schedule.
   */

  /**
   * Updates the scan schedule job for a specific target in BullMQ.
   * If the target has a scan schedule, a new job will be added to the queue.
   * If the target previously had a scan schedule but now doesn't, the job will be removed.
   *
   * @param targetId - The ID of the target to update the scan schedule job for
   * @param scanSchedule - The new scan schedule for the target (can be null/undefined)
   */
  private async updateTargetScanScheduleJob(targetId: string, scanSchedule: string | null | undefined): Promise<void> {
    // Remove any existing jobs for this target
    await this.scanScheduleQueue.remove(targetId);

    // If there's a new scan schedule, add a new job
    if (scanSchedule) {
      await this.scanScheduleQueue.add(
        targetId, // Job name is the target ID
        { id: targetId } as Target, // No data needed for this job
        {
          repeat: {
            pattern: scanSchedule,
          },
        },
      );
    }
  }

  /**
   * Updates all scan schedule jobs for all targets.
   * This function is scheduled to run every day at 00:00.
   * It retrieves all targets with a scan schedule, and adds a new BullMQ job for each target.
   * The BullMQ job will trigger a rescan of the target every time it runs according to its cron schedule.
   */
  @Cron('0 0 */1 * * *')
  async handleUpdateScanSchedule(): Promise<void> {
    const targetSchedules = await this.repo
      .createQueryBuilder('target')
      .select(['target.value', 'target.id', 'target.scanSchedule'])
      .where('target.scanSchedule IS NOT NULL')
      .getMany();

    if (targetSchedules.length === 0) return;

    // Remove existing jobs from the queue before adding new ones
    await this.scanScheduleQueue.obliterate({ force: true });

    // Add new jobs to the queue with targetId as job name and cron schedule
    for (const target of targetSchedules) {
      await this.scanScheduleQueue.add(
        target.id,
        target,
        {
          repeat: {
            pattern: target.scanSchedule,
          },
        },
      );
    }
  }
}