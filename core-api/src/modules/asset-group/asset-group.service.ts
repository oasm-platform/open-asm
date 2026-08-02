import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { BullMQName, CronSchedule, JobRunType, JobStatus } from '@/common/enums/enum';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { getManyResponse } from '@/utils/getManyResponse';
import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { In, Repository } from 'typeorm';
import { Asset } from '../assets/entities/assets.entity';
import { JobHistory } from '../jobs-registry/entities/job-history.entity';
import { JobsRegistryService } from '../jobs-registry/jobs-registry.service';
import { Tool } from '../tools/entities/tools.entity';
import { ToolsService } from '../tools/tools.service';
import { Workflow } from '../workflows/entities/workflow.entity';
import { AssetGroupLastRunDto } from './dto/asset-group-last-run.dto';
import { CreateAssetGroupDto } from './dto/create-asset-group.dto';
import { GetAllAssetGroupsQueryDto } from './dto/get-all-asset-groups-dto.dto';
import { UpdateAssetGroupDto } from './dto/update-asset-group.dto';
import { AssetGroupAsset } from './entities/asset-groups-assets.entity';
import { AssetGroupWorkflow } from './entities/asset-groups-workflows.entity';
import { AssetGroup } from './entities/asset-groups.entity';

@Injectable()
export class AssetGroupService {
  private readonly logger = new Logger(AssetGroupService.name);
  constructor(
    @InjectRepository(AssetGroup)
    public readonly assetGroupRepo: Repository<AssetGroup>,
    @InjectRepository(AssetGroupAsset)
    public readonly assetGroupAssetRepo: Repository<AssetGroupAsset>,
    @InjectRepository(AssetGroupWorkflow)
    public readonly assetGroupWorkflowRepo: Repository<AssetGroupWorkflow>,
    @InjectRepository(Asset)
    public readonly assetRepo: Repository<Asset>,
    @InjectRepository(Workflow)
    public readonly workflowRepo: Repository<Workflow>,
    @InjectRepository(JobHistory)
    public readonly jobHistoryRepo: Repository<JobHistory>,
    @InjectQueue(BullMQName.ASSET_GROUPS_WORKFLOW_SCHEDULE)
    private scanScheduleQueue: Queue<AssetGroupWorkflow>,
    private toolsService: ToolsService,
    private jobRegistryService: JobsRegistryService,
  ) {}

  /**
   * Retrieves all asset groups with optional filtering and pagination
   */
  async getManyAssetGroups(
    query: GetAllAssetGroupsQueryDto,
    workspaceId: string,
  ) {
    try {
      const { page, limit, sortBy, sortOrder } = query;
      const offset = (page - 1) * limit;

      // Build query using query builder to get asset groups with asset counts
      const queryBuilder = this.assetGroupRepo
        .createQueryBuilder('assetGroup')
        .leftJoin('assetGroup.workspace', 'workspace')
        .where('workspace.id = :workspaceId', { workspaceId });

      // Add search filter if provided
      if (query.search && query.search.trim() !== '') {
        queryBuilder.andWhere('assetGroup.name ILIKE :search', {
          search: `%${query.search.trim()}%`,
        });
      }

      // Add targetIds filter if provided
      if (query.targetIds && query.targetIds.length > 0) {
        queryBuilder
          .leftJoin('assetGroup.assetGroupAssets', 'aga')
          .leftJoin('aga.asset', 'asset')
          .andWhere('asset.targetId IN (:...targetIds)', {
            targetIds: query.targetIds,
          });
      }

      // Add asset count subquery
      queryBuilder.addSelect(
        (subQuery) =>
          subQuery
            .select('COUNT(aga_sub.id)', 'count')
            .from('assets_group_assets', 'aga_sub')
            .where('aga_sub."assetGroupId" = assetGroup.id'),
        'totalAssets',
      );

      // Get total count with the same base conditions (without pagination)
      const countQueryBuilder = this.assetGroupRepo
        .createQueryBuilder('assetGroup')
        .leftJoin('assetGroup.workspace', 'workspace')
        .where('workspace.id = :workspaceId', { workspaceId });

      if (query.search && query.search.trim() !== '') {
        countQueryBuilder.andWhere('assetGroup.name ILIKE :search', {
          search: `%${query.search.trim()}%`,
        });
      }

      if (query.targetIds && query.targetIds.length > 0) {
        countQueryBuilder
          .leftJoin('assetGroup.assetGroupAssets', 'aga')
          .leftJoin('aga.asset', 'asset')
          .andWhere('asset.targetId IN (:...targetIds)', {
            targetIds: query.targetIds,
          });
      }

      const total = await countQueryBuilder.getCount();

      // Apply ordering, pagination to main query
      queryBuilder
        .orderBy(`assetGroup.${sortBy}`, sortOrder)
        .offset(offset)
        .limit(limit);

      const results: {
        entities: AssetGroup[];
        raw: Array<{ totalAssets: string }>;
      } = await queryBuilder.getRawAndEntities();

      // Map results to include totalAssets in the entity
      const assetGroupsWithTotalAssets = results.entities.map(
        (assetGroup, index) => {
          const rawResult = results.raw[index];
          return {
            ...assetGroup,
            totalAssets: parseInt(rawResult.totalAssets) || 0,
          };
        },
      );

      return getManyResponse({
        query,
        data: assetGroupsWithTotalAssets,
        total,
      });
    } catch (error) {
      this.logger.error(
        `Error retrieving asset groups for workspace ${workspaceId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Fetches a specific asset group by its unique identifier,
   * including the workflows assigned to it and the latest run
   * so the detail view does not need additional requests.
   */
  async getAssetGroupById(
    id: string,
    workspaceId: string,
  ): Promise<AssetGroup> {
    try {
      const assetGroup = await this.assetGroupRepo.findOne({
        where: { id, workspace: { id: workspaceId } },
        relations: { assetGroupWorkflows: { workflow: true } },
      });

      if (!assetGroup) {
        throw new NotFoundException(
          `Asset group with ID "${id}" not found in workspace "${workspaceId}"`,
        );
      }

      const workflowIds =
        assetGroup.assetGroupWorkflows?.map((agw) => agw.workflow.id) ?? [];

      assetGroup.lastRun =
        workflowIds.length === 0
          ? null
          : await this.getLastRunForWorkflows(workflowIds);

      return assetGroup;
    } catch (error) {
      this.logger.error(
        `Error retrieving asset group with ID ${id} for workspace ${workspaceId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Resolves the most recent job history across the given workflows,
   * deriving its status from the individual job statuses.
   */
  private async getLastRunForWorkflows(
    workflowIds: string[],
  ): Promise<AssetGroupLastRunDto | null> {
    interface RawJobHistoryRow {
      id: string;
      createdAt: Date;
      updatedAt: Date;
      totalJobs: string;
      status: JobStatus;
      workflowName: string;
      jobHistoryName: string;
      jobRunType: JobRunType;
    }

    const raw = await this.jobHistoryRepo
      .createQueryBuilder('jobHistory')
      .leftJoin('jobHistory.workflow', 'workflow')
      .where('jobHistory.workflowId IN (:...workflowIds)', { workflowIds })
      .select([
        '"jobHistory".id as "id"',
        '"jobHistory"."createdAt" as "createdAt"',
        '"jobHistory"."updatedAt" as "updatedAt"',
        '"jobHistory"."jobHistoryName" as "jobHistoryName"',
        '"jobHistory"."jobRunType" as "jobRunType"',
        '"workflow"."name" as "workflowName"',
        // Subquery to count total jobs for this job history
        '(SELECT COUNT(*) FROM jobs WHERE "jobHistoryId" = "jobHistory".id) as "totalJobs"',
        // Subquery with CASE to calculate status based on job statuses
        `(
          SELECT
            CASE
              WHEN COUNT(*) FILTER (WHERE status = '${JobStatus.FAILED}') > 0 THEN '${JobStatus.FAILED}'
              WHEN COUNT(*) FILTER (WHERE status = '${JobStatus.IN_PROGRESS}') > 0 THEN '${JobStatus.IN_PROGRESS}'
              WHEN COUNT(*) FILTER (WHERE status = '${JobStatus.COMPLETED}') = COUNT(*) AND COUNT(*) > 0 THEN '${JobStatus.COMPLETED}'
              ELSE '${JobStatus.PENDING}'
            END
          FROM jobs
          WHERE "jobHistoryId" = "jobHistory".id
        ) as "status"`,
      ])
      .orderBy('jobHistory.createdAt', 'DESC')
      .limit(1)
      .getRawOne<RawJobHistoryRow>();

    if (!raw) {
      return null;
    }

    return {
      id: raw.id,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      totalJobs: parseInt(raw.totalJobs, 10),
      status: raw.status,
      workflowName: raw.workflowName,
      jobHistoryName: raw.jobHistoryName,
      jobRunType: raw.jobRunType,
    };
  }

  /**
   * Creates a new asset group
   */
  async create(createAssetGroupDto: CreateAssetGroupDto, workspaceId: string) {
    try {
      // Validate the workspace exists
      const workspace = await this.assetGroupRepo.manager.findOneBy(Workspace, {
        id: workspaceId,
      });
      if (!workspace) {
        throw new NotFoundException(
          `Workspace with ID "${workspaceId}" not found`,
        );
      }

      // Check if an asset group with the same name already exists in the workspace
      const existingAssetGroup = await this.assetGroupRepo.findOne({
        where: {
          name: createAssetGroupDto.name,
          workspace: { id: workspaceId },
        },
      });

      if (existingAssetGroup) {
        throw new BadRequestException(
          `An asset group with name "${createAssetGroupDto.name}" already exists in this workspace`,
        );
      }

      // The schedule only makes sense when a workflow is created from tools
      if (
        createAssetGroupDto.schedule &&
        !createAssetGroupDto.toolIds?.length
      ) {
        throw new BadRequestException(
          'schedule can only be provided together with toolIds',
        );
      }

      const assetGroup = this.assetGroupRepo.create({
        name: createAssetGroupDto.name,
        hexColor: createAssetGroupDto.hexColor,
        workspace: { id: workspaceId },
      });

      const savedAssetGroup = await this.assetGroupRepo.save(assetGroup);

      try {
        // Attach the provided hosts to the group
        if (createAssetGroupDto.hostIds?.length) {
          await this.addManyAssets(
            savedAssetGroup.id,
            createAssetGroupDto.hostIds,
          );
        }

        // Create a workflow from the provided tools and assign it to the group
        if (createAssetGroupDto.toolIds?.length) {
          await this.createAndAssignGroupWorkflow(
            savedAssetGroup.id,
            createAssetGroupDto.toolIds,
            createAssetGroupDto.schedule ?? CronSchedule.EVERY_3_DAYS,
            workspaceId,
          );
        }
      } catch (error) {
        // Roll back the group so a failed request does not leave a half-created group
        await this.assetGroupRepo.remove(savedAssetGroup);
        throw error;
      }

      return savedAssetGroup;
    } catch (error) {
      this.logger.error(`Error creating asset group:`, error);
      throw error;
    }
  }

  /**
   * Creates a workflow whose jobs run the given tools, then associates it
   * with the asset group using the provided schedule.
   */
  private async createAndAssignGroupWorkflow(
    groupId: string,
    toolIds: string[],
    schedule: string,
    workspaceId: string,
  ): Promise<void> {
    // Verify that all tools exist
    const tools = await this.assetGroupRepo.manager.find(Tool, {
      where: { id: In(toolIds) },
    });
    if (tools.length !== toolIds.length) {
      const foundToolIds = tools.map((tool) => tool.id);
      const missingToolIds = toolIds.filter(
        (id) => !foundToolIds.includes(id),
      );
      this.logger.warn(
        `Tools with IDs "${missingToolIds.join(', ')}" not found`,
      );
      throw new NotFoundException(
        `One or more tools with IDs "${missingToolIds.join(', ')}" not found`,
      );
    }

    const workflowName = `Group Workflow - ${groupId}`;
    const workflow = this.workflowRepo.create({
      name: workflowName,
      content: {
        // ponytail: entity types schedule as CronSchedule but the column is
        // varchar and the BullMQ repeat pattern accepts any cron string
        on: { schedule: schedule as CronSchedule, target: [] },
        jobs: tools.map((tool) => ({ name: tool.name, run: tool.name })),
        name: workflowName,
      },
      filePath: `group-${groupId}.yaml`,
      workspace: { id: workspaceId },
    });

    const savedWorkflow = await this.workflowRepo.save(workflow);

    await this.addManyWorkflows(groupId, [savedWorkflow.id], schedule);
  }

  /**
   * Associates multiple workflows with the specified asset group
   */
  async addManyWorkflows(
    groupId: string,
    workflowIds: string[],
    schedule: string = CronSchedule.EVERY_3_DAYS,
  ): Promise<DefaultMessageResponseDto> {
    try {
      const assetGroup = await this.assetGroupRepo.findOne({
        where: { id: groupId },
      });
      if (!assetGroup) {
        this.logger.warn(`Asset group with ID "${groupId}" not found`);
        throw new NotFoundException(
          `Asset group with ID "${groupId}" not found`,
        );
      }

      // Verify that all workflows exist
      const workflows = await this.workflowRepo.findByIds(workflowIds);
      if (workflows.length !== workflowIds.length) {
        const foundWorkflowIds = workflows.map((workflow) => workflow.id);
        const missingWorkflowIds = workflowIds.filter(
          (id) => !foundWorkflowIds.includes(id),
        );
        this.logger.warn(
          `Workflows with IDs "${missingWorkflowIds.join(', ')}" not found`,
        );
        throw new NotFoundException(
          `One or more workflows with IDs "${missingWorkflowIds.join(', ')}" not found`,
        );
      }

      // Find existing associations to avoid duplicates
      const existingAssociations = await this.assetGroupWorkflowRepo.find({
        where: {
          assetGroup: { id: groupId },
          workflow: { id: In(workflowIds) },
        },
      });

      const existingWorkflowIds = existingAssociations.map(
        (assoc) => assoc.workflow.id,
      );
      if (existingWorkflowIds.length > 0) {
        this.logger.warn(
          `Workflows with IDs "${existingWorkflowIds.join(', ')}" are already associated with asset group "${groupId}"`,
        );
        throw new BadRequestException(
          `Workflows with IDs "${existingWorkflowIds.join(', ')}" are already associated with asset group "${groupId}"`,
        );
      }
      const assetGroupWorkflowRecords: AssetGroupWorkflow[] = [];

      for (const workflowId of workflowIds) {
        const assetGroupWorkflowId = randomUUID();
        const job = await this.scanScheduleQueue.add(
          assetGroupWorkflowId,
          { id: assetGroupWorkflowId } as AssetGroupWorkflow,
          {
            repeat: {
              pattern: schedule,
            },
          },
        );

        const record = this.assetGroupWorkflowRepo.create({
          id: assetGroupWorkflowId,
          assetGroup: { id: groupId },
          workflow: { id: workflowId },
          schedule: schedule as CronSchedule,
          jobId: job.repeatJobKey,
        });

        assetGroupWorkflowRecords.push(record);
      }

      await this.assetGroupWorkflowRepo.save(assetGroupWorkflowRecords);

      return {
        message: `${assetGroupWorkflowRecords.length} workflows successfully added to asset group "${groupId}"`,
      };
    } catch (error) {
      this.logger.error(
        `Error adding workflows to asset group with ID ${groupId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Associates multiple assets with the specified asset group
   */
  async addManyAssets(
    groupId: string,
    assetIds: string[],
  ): Promise<DefaultMessageResponseDto> {
    try {
      // Verify that the asset group exists
      const assetGroup = await this.assetGroupRepo.findOne({
        where: { id: groupId },
      });
      if (!assetGroup) {
        this.logger.warn(`Asset group with ID "${groupId}" not found`);
        throw new NotFoundException(
          `Asset group with ID "${groupId}" not found`,
        );
      }

      // Verify that all assets exist
      const assets = await this.assetRepo.findByIds(assetIds);
      if (assets.length !== assetIds.length) {
        const foundAssetIds = assets.map((asset) => asset.id);
        const missingAssetIds = assetIds.filter(
          (id) => !foundAssetIds.includes(id),
        );
        this.logger.warn(
          `Assets with IDs "${missingAssetIds.join(', ')}" not found`,
        );
        throw new NotFoundException(
          `One or more assets with IDs "${missingAssetIds.join(', ')}" not found`,
        );
      }

      // Find existing associations to avoid duplicates
      const existingAssociations = await this.assetGroupAssetRepo.find({
        where: {
          assetGroup: { id: groupId },
          asset: { id: In(assetIds) },
        },
      });

      const existingAssetIds = existingAssociations.map(
        (assoc) => assoc.asset.id,
      );
      if (existingAssetIds.length > 0) {
        this.logger.warn(
          `Assets with IDs "${existingAssetIds.join(', ')}" are already associated with asset group "${groupId}"`,
        );
        throw new BadRequestException(
          `Assets with IDs "${existingAssetIds.join(', ')}" are already associated with asset group "${groupId}"`,
        );
      }

      // Create new associations
      const newAssociations = assetIds.map((assetId) =>
        this.assetGroupAssetRepo.create({
          assetGroup: { id: groupId },
          asset: { id: assetId },
        }),
      );

      await this.assetGroupAssetRepo.save(newAssociations);

      return {
        message: `${newAssociations.length} assets successfully added to asset group "${groupId}"`,
      };
    } catch (error) {
      this.logger.error(
        `Error adding assets to asset group with ID ${groupId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Disassociates multiple workflows from the asset group
   */
  async removeManyWorkflows(
    groupId: string,
    workflowIds: string[],
  ): Promise<DefaultMessageResponseDto> {
    try {
      // Find existing associations
      const associations = await this.assetGroupWorkflowRepo.find({
        where: {
          assetGroup: { id: groupId },
          workflow: { id: In(workflowIds) },
        },
        relations: ['workflow', 'assetGroup'],
      });

      if (associations.length === 0) {
        this.logger.warn(
          `No workflows with IDs "${workflowIds.join(', ')}" are associated with asset group "${groupId}"`,
        );
        throw new NotFoundException(
          `No workflows with IDs "${workflowIds.join(', ')}" are associated with asset group "${groupId}"`,
        );
      }

      // Check for missing associations
      const associatedWorkflowIds = associations.map(
        (assoc) => assoc.workflow.id,
      );
      const missingWorkflowIds = workflowIds.filter(
        (id) => !associatedWorkflowIds.includes(id),
      );
      if (missingWorkflowIds.length > 0) {
        throw new NotFoundException(
          `Workflows with IDs "${missingWorkflowIds.join(', ')}" are not associated with asset group "${groupId}"`,
        );
      }

      await Promise.all(
        associations.map((a) =>
          this.scanScheduleQueue.removeJobScheduler(a.jobId),
        ),
      );
      // Remove the associations
      await this.assetGroupWorkflowRepo.remove(associations);

      return {
        message: `${associations.length} workflows successfully removed from asset group "${groupId}"`,
      };
    } catch (error) {
      this.logger.error(
        `Error removing workflows from asset group with ID ${groupId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Disassociates multiple assets from the asset group
   */
  async removeManyAssets(
    groupId: string,
    assetIds: string[],
  ): Promise<DefaultMessageResponseDto> {
    try {
      // Find existing associations
      const associations = await this.assetGroupAssetRepo.find({
        where: {
          assetGroup: { id: groupId },
          asset: { id: In(assetIds) },
        },
        relations: ['asset', 'assetGroup'],
      });

      if (associations.length === 0) {
        throw new NotFoundException(
          `No assets with IDs "${assetIds.join(', ')}" are associated with asset group "${groupId}"`,
        );
      }

      // Check for missing associations
      const associatedAssetIds = associations.map((assoc) => assoc.asset.id);
      const missingAssetIds = assetIds.filter(
        (id) => !associatedAssetIds.includes(id),
      );
      if (missingAssetIds.length > 0) {
        throw new NotFoundException(
          `Assets with IDs "${missingAssetIds.join(', ')}" are not associated with asset group "${groupId}"`,
        );
      }

      // Remove the associations
      await this.assetGroupAssetRepo.remove(associations);

      return {
        message: `${associations.length} assets successfully removed from asset group "${groupId}"`,
      };
    } catch (error) {
      this.logger.error(
        `Error removing assets from asset group with ID ${groupId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Permanently removes an asset group
   */
  async delete(id: string): Promise<DefaultMessageResponseDto> {
    try {
      const assetGroup = await this.assetGroupRepo.findOne({
        where: { id },
        relations: ['assetGroupAssets', 'assetGroupWorkflows'],
      });

      if (!assetGroup) {
        throw new NotFoundException(`Asset group with ID "${id}" not found`);
      }

      // Delete all related associations first
      if (
        assetGroup.assetGroupAssets &&
        assetGroup.assetGroupAssets.length > 0
      ) {
        await this.assetGroupAssetRepo.remove(assetGroup.assetGroupAssets);
      }

      if (
        assetGroup.assetGroupWorkflows &&
        assetGroup.assetGroupWorkflows.length > 0
      ) {
        await this.assetGroupWorkflowRepo.remove(
          assetGroup.assetGroupWorkflows,
        );
      }

      // Delete the asset group itself
      await this.assetGroupRepo.remove(assetGroup);

      return {
        message: `Asset group "${id}" successfully deleted`,
      };
    } catch (error) {
      this.logger.error(`Error deleting asset group with ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * Retrieves assets associated with a specific asset group with pagination
   */
  async getAssetsByAssetGroupsId(
    assetGroupId: string,
    query: GetManyBaseQueryParams,
    workspaceId: string,
  ) {
    try {
      const { page, limit, sortBy, sortOrder } = query;
      const offset = (page - 1) * limit;

      // Find the asset group to ensure it exists and belongs to the workspace
      const assetGroup = await this.assetGroupRepo.findOne({
        where: { id: assetGroupId, workspace: { id: workspaceId } },
      });

      if (!assetGroup) {
        throw new NotFoundException(
          `Asset group with ID "${assetGroupId}" not found in workspace "${workspaceId}"`,
        );
      }

      // Build query using query builder to get assets associated with the asset group
      const queryBuilder = this.assetRepo
        .createQueryBuilder('asset')
        .innerJoin('assets_group_assets', 'aga', 'aga.assetId = asset.id')
        .innerJoin('asset_groups', 'ag', 'ag.id = aga.assetGroupId')
        .where(
          'aga.assetGroupId = :assetGroupId AND ag.workspaceId = :workspaceId',
          {
            assetGroupId,
            workspaceId,
          },
        );

      const [data, total] = await queryBuilder
        .orderBy(`asset.${sortBy}`, sortOrder)
        .skip(offset)
        .take(limit)
        .getManyAndCount();

      return getManyResponse({ query, data, total });
    } catch (error) {
      this.logger.error(
        `Error retrieving assets for asset group with ID ${assetGroupId} in workspace ${workspaceId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Retrieves assets not associated with a specific asset group with pagination
   */
  async getAssetsNotInAssetGroup(
    assetGroupId: string,
    query: GetManyBaseQueryParams,
    workspaceId: string,
  ) {
    try {
      const { page, limit, sortBy, sortOrder, search } = query;
      const offset = (page - 1) * limit;

      // Find the asset group to ensure it exists and belongs to the workspace
      const assetGroup = await this.assetGroupRepo.findOne({
        where: { id: assetGroupId, workspace: { id: workspaceId } },
      });

      if (!assetGroup) {
        throw new NotFoundException(
          `Asset group with ID "${assetGroupId}" not found in workspace "${workspaceId}"`,
        );
      }

      // Build query using query builder to get assets NOT associated with the asset group
      const queryBuilder = this.assetRepo
        .createQueryBuilder('asset')
        .leftJoin(
          'assets_group_assets',
          'aga',
          'aga.assetId = asset.id AND aga.assetGroupId = :assetGroupId',
          { assetGroupId },
        )
        .where(
          'aga.assetId IS NULL AND asset."targetId" IN (SELECT t.id FROM targets t WHERE t."workspaceId" = :workspaceId)',
          {
            assetGroupId,
            workspaceId,
          },
        );

      if (search) {
        queryBuilder.andWhere('asset.value ILIKE :search', {
          search: `%${search}%`,
        });
      }

      const [data, total] = await queryBuilder
        .orderBy(`asset.${sortBy}`, sortOrder)
        .skip(offset)
        .take(limit)
        .getManyAndCount();

      return getManyResponse({ query, data, total });
    } catch (error) {
      this.logger.error(
        `Error retrieving assets not in asset group with ID ${assetGroupId} in workspace ${workspaceId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Updates an asset group workflow relationship (schedule, job, etc.)
   */
  async updateAssetGroupWorkflow(
    assetGroupWorkflowId: string,
    updateData: Partial<{
      schedule?: CronSchedule;
      jobId?: string;
    }>,
  ): Promise<AssetGroupWorkflow> {
    try {
      // Find the existing relationship by ID
      const assetGroupWorkspace = await this.assetGroupWorkflowRepo.findOne({
        where: { id: assetGroupWorkflowId },
        relations: ['assetGroup', 'workflow'],
      });

      if (!assetGroupWorkspace) {
        throw new NotFoundException(
          `Asset group workflow relationship with ID "${assetGroupWorkflowId}" not found`,
        );
      }

      // Update the relationship with provided data
      if (updateData.schedule !== undefined) {
        assetGroupWorkspace.schedule = updateData.schedule;

        await this.scanScheduleQueue.removeJobScheduler(
          assetGroupWorkspace.jobId,
        );

        if (updateData.schedule !== CronSchedule.DISABLED) {
          const newJob = await this.scanScheduleQueue.add(
            assetGroupWorkspace.id,
            { id: assetGroupWorkspace.id } as AssetGroupWorkflow,
            {
              repeat: {
                pattern: assetGroupWorkspace.schedule,
              },
            },
          );
          if (newJob.repeatJobKey) {
            assetGroupWorkspace.jobId = newJob.repeatJobKey;
          }
        }
      }

      // Save the updated relationship
      const updatedRelationship =
        await this.assetGroupWorkflowRepo.save(assetGroupWorkspace);

      return updatedRelationship;
    } catch (error) {
      this.logger.error(
        `Error updating asset group workflow relationship with ID ${assetGroupWorkflowId}:`,
        error,
      );
      throw error;
    }
  }

  public async runGroupWorkflowScheduler(
    assetGroupWorkflowId: string,
    jobRunType: JobRunType,
  ): Promise<DefaultMessageResponseDto> {
    // Get the asset group workflow to access the workflow and asset group
    const assetGroupWorkflow = await this.assetGroupWorkflowRepo
      .createQueryBuilder('assetGroupWorkflow')
      .innerJoinAndSelect('assetGroupWorkflow.workflow', 'workflow')
      .leftJoinAndSelect('workflow.workspace', 'workspace')
      .innerJoinAndSelect('assetGroupWorkflow.assetGroup', 'assetGroup')
      .where('assetGroupWorkflow.id = :assetGroupWorkflowId', {
        assetGroupWorkflowId,
      })
      .getOne();

    if (!assetGroupWorkflow) {
      throw new NotFoundException(
        `Asset group workflow with ID "${assetGroupWorkflowId}" not found`,
      );
    }

    const workflow = assetGroupWorkflow.workflow;
    const assetGroupName = assetGroupWorkflow.assetGroup.name;

    // Get all assets associated with the specific asset group workflow
    const assets = await this.assetRepo
      .createQueryBuilder('assets')
      .innerJoin('assets_group_assets', 'aga', 'aga."assetId" = assets.id')
      .innerJoin('asset_groups', 'ag', 'ag.id = aga."assetGroupId"')
      .innerJoin('asset_group_workflows', 'agw', 'agw."assetGroupId" = ag.id')
      .where('agw.id = :assetGroupWorkflowId', { assetGroupWorkflowId })
      .getMany();

    if (assets.length === 0) {
      throw new BadRequestException(
        'Asset group workflow does not have any assets associated with it.',
      );
    }

    // Get the first job's tool name
    const firstJobToolName = workflow.content.jobs[0]?.run;

    if (!firstJobToolName) {
      throw new BadRequestException('Workflow does not have any jobs defined.');
    }

    // Require tool to be installed
    const tools = await this.toolsService.getToolByNames({
      names: [firstJobToolName],
      isInstalled: true,
    });

    if (!tools || tools.length === 0) {
      throw new BadRequestException(
        `Tool "${firstJobToolName}" is not installed in the workspace.`,
      );
    }

    // Only use the first tool found (should be exactly one)
    const tool = tools[0];

    await this.jobRegistryService.createNewJob({
      tool,
      assetIds: assets.map((a) => a.id),
      workflow: workflow,
      priority: tool.priority,
      workspaceId: workflow.workspace.id,
      jobName: assetGroupName,
      jobRunType,
    });
    return {
      message: `Run scheduler for asset group workflow with ID ${assetGroupWorkflowId}`,
    };
  }

  /**
   * Updates an existing asset group
   */
  async updateAssetGroupById(
    id: string,
    updateAssetGroupDto: UpdateAssetGroupDto,
    workspaceId: string,
  ): Promise<AssetGroup> {
    try {
      // Find the asset group
      const assetGroup = await this.assetGroupRepo.findOne({
        where: { id, workspace: { id: workspaceId } },
      });

      if (!assetGroup) {
        throw new NotFoundException(
          `Asset group with ID "${id}" not found in workspace "${workspaceId}"`,
        );
      }

      // Update fields if provided
      if (updateAssetGroupDto.name !== undefined) {
        assetGroup.name = updateAssetGroupDto.name;
      }
      if (updateAssetGroupDto.hexColor !== undefined) {
        assetGroup.hexColor = updateAssetGroupDto.hexColor;
      }

      // Save the updated asset group
      const updatedAssetGroup = await this.assetGroupRepo.save(assetGroup);

      return updatedAssetGroup;
    } catch (error) {
      this.logger.error(
        `Error updating asset group with ID ${id} in workspace ${workspaceId}:`,
        error,
      );
      throw error;
    }
  }
}
