import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { BullMQName, CronSchedule } from '@/common/enums/enum';
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
import { FindOptionsWhere, In, Repository } from 'typeorm';
import { Asset } from '../assets/entities/assets.entity';
import { JobsRegistryService } from '../jobs-registry/jobs-registry.service';
import { ToolsService } from '../tools/tools.service';
import { Workflow } from '../workflows/entities/workflow.entity';
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
    @InjectQueue(BullMQName.ASSET_GROUPS_WORKFLOW_SCHEDULE)
    private scanScheduleQueue: Queue<AssetGroupWorkflow>,
    private toolsService: ToolsService,
    private jobRegistryService: JobsRegistryService,
  ) {}

  /**
   * Retrieves all asset groups with optional filtering and pagination
   */
  async getAll(query: GetAllAssetGroupsQueryDto, workspaceId: string) {
    try {
      const { page, limit, sortBy, sortOrder } = query;
      const offset = (page - 1) * limit;

      const whereConditions:
        | FindOptionsWhere<AssetGroup>
        | FindOptionsWhere<AssetGroup>[]
        | undefined = {
        workspace: { id: workspaceId },
      };

      if (query.targetIds && query.targetIds.length > 0) {
        whereConditions.assetGroupAssets = {
          asset: {
            targetId: In(query.targetIds || []),
          },
        };
      }

      const [data, total] = await this.assetGroupRepo.findAndCount({
        where: whereConditions,
        order: { [sortBy]: sortOrder },
        skip: offset,
        take: limit,
        relations: [
          'assetGroupAssets',
          'assetGroupWorkflows',
          'assetGroupWorkflows.workflow',
          'assetGroupAssets.asset',
        ],
      });

      return getManyResponse({ query, data, total });
    } catch (error) {
      this.logger.error(
        `Error retrieving asset groups for workspace ${workspaceId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Fetches a specific asset group by its unique identifier
   */
  async getAssetGroupById(
    id: string,
    workspaceId: string,
  ): Promise<AssetGroup> {
    try {
      const assetGroup = await this.assetGroupRepo.findOne({
        where: { id, workspace: { id: workspaceId } },
      });

      if (!assetGroup) {
        throw new NotFoundException(
          `Asset group with ID "${id}" not found in workspace "${workspaceId}"`,
        );
      }

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

      const assetGroup = this.assetGroupRepo.create({
        name: createAssetGroupDto.name,
        workspace: { id: workspaceId },
      });

      const savedAssetGroup = await this.assetGroupRepo.save(assetGroup);
      return savedAssetGroup;
    } catch (error) {
      this.logger.error(`Error creating asset group:`, error);
      throw error;
    }
  }

  /**
   * Associates multiple workflows with the specified asset group
   */
  async addManyWorkflows(
    groupId: string,
    workflowIds: string[],
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
      const defaultCron = CronSchedule.EVERY_3_DAYS;

      const assetGroupWorkflowRecords: AssetGroupWorkflow[] = [];

      for (const workflowId of workflowIds) {
        const assetGroupWorkflowId = randomUUID();
        const job = await this.scanScheduleQueue.add(
          assetGroupWorkflowId,
          { id: assetGroupWorkflowId } as AssetGroupWorkflow,
          {
            repeat: {
              pattern: defaultCron,
            },
          },
        );

        const record = this.assetGroupWorkflowRepo.create({
          id: assetGroupWorkflowId,
          assetGroup: { id: groupId },
          workflow: { id: workflowId },
          schedule: defaultCron,
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
   * Retrieves workflows associated with a specific asset group with pagination
   */
  async getWorkflowsByAssetGroupsId(
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

      const queryBuilder = this.assetGroupWorkflowRepo
        .createQueryBuilder('assetGroupWorkflow')
        .innerJoinAndSelect('assetGroupWorkflow.workflow', 'workflow')
        .innerJoin('assetGroupWorkflow.assetGroup', 'ag')
        .where(
          'assetGroupWorkflow.assetGroupId = :assetGroupId AND ag.workspaceId = :workspaceId',
          {
            assetGroupId,
            workspaceId,
          },
        );

      const [data, total] = await queryBuilder
        .orderBy(`workflow.${sortBy}`, sortOrder)
        .skip(offset)
        .take(limit)
        .getManyAndCount();

      return getManyResponse({ query, data, total });
    } catch (error) {
      this.logger.error(
        `Error retrieving workflows for asset group with ID ${assetGroupId} in workspace ${workspaceId}:`,
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
          'aga.assetId IS NULL AND asset."targetId" IN (SELECT t.id FROM targets t JOIN workspace_targets wt ON t.id = wt."targetId" WHERE wt."workspaceId" = :workspaceId)',
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
        `Error retrieving assets not in asset group with ID ${assetGroupId} in workspace ${workspaceId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Retrieves workflows not associated with a specific asset group but preinstalled in the workspace with pagination
   */
  async getWorkflowsNotInAssetGroup(
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

      // Build query using query builder to get workflows that are NOT in the asset group but ARE in the workspace
      const queryBuilder = this.workflowRepo
        .createQueryBuilder('workflow')
        .leftJoin(
          'asset_group_workflows',
          'agt',
          'agt.workflowId = workflow.id AND agt.assetGroupId = :assetGroupId',
          { assetGroupId },
        )
        .where(
          'agt.workflowId IS NULL AND workflow.workspaceId = :workspaceId',
          { workspaceId },
        );

      const [data, total] = await queryBuilder
        .orderBy(`workflow.${sortBy}`, sortOrder)
        .skip(offset)
        .take(limit)
        .leftJoinAndSelect(
          'workflow.assetGroupWorkflows',
          'assetGroupWorkflows',
        )
        .getManyAndCount();

      return getManyResponse({
        query,
        data,
        total,
      });
    } catch (error) {
      this.logger.error(
        `Error retrieving workflows not in asset group with ID ${assetGroupId} in workspace ${workspaceId}:`,
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
  ): Promise<DefaultMessageResponseDto> {
    // Get the asset group workflow to access the workflow
    const assetGroupWorkflow = await this.assetGroupWorkflowRepo
      .createQueryBuilder('assetGroupWorkflow')
      .innerJoinAndSelect('assetGroupWorkflow.workflow', 'workflow')
      .innerJoin('assetGroupWorkflow.assetGroup', 'assetGroup')
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

    const firstJobs = workflow.content.jobs.map((j) => j.run)[0];
    const tools = await this.toolsService.getToolByNames([firstJobs]);
    await Promise.all(
      tools.map((tool) =>
        this.jobRegistryService.createNewJob({
          tool,
          assetIds: assets.map((a) => a.id),
          workflow: workflow,
          priority: tool.priority,
        }),
      ),
    );
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
