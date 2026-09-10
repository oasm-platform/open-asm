import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { BullMQName, CronSchedule, WorkerType } from '@/common/enums/enum';
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
import { In, Repository } from 'typeorm';
import { JobsRegistryService } from '../jobs-registry/jobs-registry.service';
import { Tool } from '../tools/entities/tools.entity';
import {
  encryptInlineConfig,
  getSensitiveFields,
} from '../tools/validators/tool-config-profiles.crypto';
import { ToolsService } from '../tools/tools.service';
import { ConnectorRegistryService } from '../connectors/connector-registry.service';
import { Workflow } from '../workflows/entities/workflow.entity';
import { AssetGroupToolInput, CreateAssetGroupDto } from './dto/create-asset-group.dto';
import { GetAllAssetGroupsQueryDto } from './dto/get-all-asset-groups-dto.dto';
import { UpdateAssetGroupDto } from './dto/update-asset-group.dto';
import { AssetGroupWorkflow } from './entities/asset-groups-workflows.entity';
import { AssetGroup } from './entities/asset-groups.entity';
import { WorkspaceEncryptionService } from '@/services/workspace-encryption/workspace-encryption.service';
import { AssetGroupWorkflowService } from './asset-group-workflow.service';
import { AssetGroupAssetService } from './asset-group-asset.service';

@Injectable()
export class AssetGroupService {
  private readonly logger = new Logger(AssetGroupService.name);
  constructor(
    @InjectRepository(AssetGroup)
    private readonly assetGroupRepo: Repository<AssetGroup>,
    @InjectRepository(AssetGroupWorkflow)
    private readonly assetGroupWorkflowRepo: Repository<AssetGroupWorkflow>,
    @InjectRepository(Workflow)
    private readonly workflowRepo: Repository<Workflow>,
    @InjectQueue(BullMQName.ASSET_GROUPS_WORKFLOW_SCHEDULE)
    private scanScheduleQueue: Queue<AssetGroupWorkflow>,
    private toolsService: ToolsService,
    private jobRegistryService: JobsRegistryService,
    private connectorRegistry: ConnectorRegistryService,
    private encryptionService: WorkspaceEncryptionService,
    private readonly workflowService: AssetGroupWorkflowService,
    private readonly assetAssetService: AssetGroupAssetService,
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

      // Get count from the same query builder (sharing all WHERE clauses)
      const total = await queryBuilder.getCount();

      // Add asset count subquery
      queryBuilder.addSelect(
        (subQuery) =>
          subQuery
            .select('COUNT(aga_sub.id)', 'count')
            .from('assets_group_assets', 'aga_sub')
            .where('aga_sub."assetGroupId" = assetGroup.id'),
        'totalAssets',
      );

      // Add latest job history run time subquery so the list can both
      // return lastRunAt and sort by it (via the select alias).
      queryBuilder.addSelect(
        (subQuery) =>
          subQuery
            .select('MAX(jh."createdAt")', 'lastRunAt')
            .from('job_histories', 'jh')
            .innerJoin(
              'asset_group_workflows',
              'agw_sub',
              'agw_sub."workflowId" = jh."workflowId"',
            )
            .where('agw_sub."assetGroupId" = assetGroup.id'),
        'lastRunAt',
      );

      // Apply ordering, pagination to main query. lastRunAt/totalAssets are
      // select aliases (not entity columns), so order by the alias directly.
      const orderColumn =
        sortBy === 'lastRunAt'
          ? '"lastRunAt"'
          : sortBy === 'totalAssets'
            ? '"totalAssets"'
            : `assetGroup.${sortBy}`;
      queryBuilder
        .orderBy(orderColumn, sortOrder)
        .offset(offset)
        .limit(limit);

      const results: {
        entities: AssetGroup[];
        raw: Array<{ totalAssets: string; lastRunAt: Date | null }>;
      } = await queryBuilder.getRawAndEntities();

      // Map results to include totalAssets and lastRunAt in the entity
      const assetGroupsWithTotalAssets = results.entities.map(
        (assetGroup, index) => {
          const rawResult = results.raw[index];
          return {
            ...assetGroup,
            totalAssets: parseInt(rawResult.totalAssets) || 0,
            lastRunAt: rawResult.lastRunAt
              ? new Date(rawResult.lastRunAt)
              : null,
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

      // A workflow can be missing if its join row outlived the workflow
      // (orphaned association), so guard every dereference.
      const workflowIds =
        assetGroup.assetGroupWorkflows
          ?.map((agw) => agw.workflow?.id)
          .filter((workflowId): workflowId is string => Boolean(workflowId)) ??
        [];
      const lastRunByWorkflow =
        await this.workflowService.getLastRunForWorkflows(workflowIds);

      for (const agw of assetGroup.assetGroupWorkflows ?? []) {
        agw.lastRun = agw.workflow
          ? (lastRunByWorkflow.get(agw.workflow.id) ?? null)
          : null;
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

      // The schedule only makes sense when a workflow is created from tools
      const toolInputs =
        createAssetGroupDto.tools ??
        createAssetGroupDto.toolIds?.map((toolId) => ({ toolId })) ??
        [];
      if (createAssetGroupDto.schedule && toolInputs.length === 0) {
        throw new BadRequestException(
          'schedule can only be provided together with toolIds or tools',
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
          await this.assetAssetService.addManyAssets(
            savedAssetGroup.id,
            createAssetGroupDto.hostIds,
          );
        }

        // Create a workflow from the provided tools and assign it to the group
        if (toolInputs.length > 0) {
          await this.createAndAssignGroupWorkflow(
            savedAssetGroup.id,
            toolInputs,
            createAssetGroupDto.schedule ?? CronSchedule.EVERY_3_DAYS,
            workspaceId,
          );
        }
      } catch (error) {
        // Roll back the group so a failed request does not leave a
        // half-created group: remove any workflows (and their BullMQ
        // schedulers) created before the failure, then the group itself.
        // The DB-level FKs cascade the join rows and asset rows.
        await this.rollbackCreatedGroup(savedAssetGroup.id);
        throw error;
      }

      return savedAssetGroup;
    } catch (error) {
      this.logger.error(`Error creating asset group:`, error);
      throw error;
    }
  }

  /**
   * Removes everything a failed {@link create} call may have persisted:
   * group workflows (with their repeat schedulers), the workflows that
   * were created for the group, and finally the group itself. Join rows
   * and asset associations are removed by the DB-level cascades.
   */
  private async rollbackCreatedGroup(groupId: string): Promise<void> {
    try {
      const groupWorkflows = await this.assetGroupWorkflowRepo.find({
        where: { assetGroup: { id: groupId } },
        relations: ['workflow'],
      });

      await Promise.all(
        groupWorkflows
          .map((agw) => agw.jobId)
          .filter((jobId): jobId is string => Boolean(jobId))
          .map((jobId) => this.scanScheduleQueue.removeJobScheduler(jobId)),
      );

      const workflowIds = groupWorkflows
        .map((agw) => agw.workflow?.id)
        .filter((workflowId): workflowId is string => Boolean(workflowId));
      if (workflowIds.length > 0) {
        await this.workflowRepo.delete(workflowIds);
      }

      const savedAssetGroup = await this.assetGroupRepo.findOne({
        where: { id: groupId },
      });
      if (savedAssetGroup) {
        await this.assetGroupRepo.remove(savedAssetGroup);
      }
    } catch (rollbackError) {
      this.logger.error(
        `Failed to rollback asset group creation: ${rollbackError.message}`,
        rollbackError.stack,
      );
    }
  }

  /**
   * Creates a workflow whose jobs run the given tools, then associates it
   * with the asset group using the provided schedule.
   */
  private async createAndAssignGroupWorkflow(
    groupId: string,
    inputs: AssetGroupToolInput[],
    schedule: string,
    workspaceId: string,
  ): Promise<void> {
    const toolIds = inputs.map((i) => i.toolId);
    const inputByToolId = new Map(inputs.map((i) => [i.toolId, i]));

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

    // Validate connector tools: each must have inline config OR a profile.
    const connectorTools = tools.filter(
      (tool) => tool.type === WorkerType.CONNECTOR,
    );
    if (connectorTools.length > 0) {
      const connectorIds = connectorTools
        .map((tool) => tool.id)
        .filter((id): id is string => Boolean(id));
      const profileToolIds = await this.toolsService.getProfileToolIds(
        workspaceId,
        connectorIds,
      );

      for (const tool of connectorTools) {
        const input = inputByToolId.get(tool.id!);
        const hasInlineConfig =
          !!input?.config && Object.keys(input.config).length > 0;
        const hasProfile = profileToolIds.has(tool.id!);
        if (!hasInlineConfig && !hasProfile) {
          throw new BadRequestException(
            `Tool "${tool.name}" requires a configuration profile or inline config.`,
          );
        }
      }
    }

    // Resolve DEK + sensitive-fields schema once for all connector tools
    const dek = await this.encryptionService.getDEK(workspaceId);

    const workflowName = `Group Workflow - ${groupId}`;
    const workflow = this.workflowRepo.create({
      name: workflowName,
      content: {
        on: { schedule, target: [] },
        jobs: tools.map((tool) => {
          const input = inputByToolId.get(tool.id!);
          let config = input?.config;
          if (config && tool.type === WorkerType.CONNECTOR) {
            const entry = this.connectorRegistry.getConnector(tool.name);
            const schema = entry?.configSchema ?? entry?.inputsSchema;
            const sensitiveFields = getSensitiveFields(schema);
            config = encryptInlineConfig(config, sensitiveFields, dek);
          }
          return {
            name: tool.name,
            run: tool.name,
            ...(config ? { config } : {}),
            ...(input?.configProfileId
              ? { configProfileId: input.configProfileId }
              : {}),
          };
        }),
        name: workflowName,
      },
      filePath: `group-${groupId}.yaml`,
      workspace: { id: workspaceId },
    });

    const savedWorkflow = await this.workflowRepo.save(workflow);

    await this.workflowService.addManyWorkflows(groupId, [savedWorkflow.id], schedule, workspaceId);
  }

  /**
   * Permanently removes an asset group
   */
  async delete(id: string): Promise<DefaultMessageResponseDto> {
    try {
      const assetGroup = await this.assetGroupRepo.findOne({
        where: { id },
        relations: { assetGroupWorkflows: { workflow: true } },
      });

      if (!assetGroup) {
        throw new NotFoundException(`Asset group with ID "${id}" not found`);
      }

      // Cancel the BullMQ repeat schedulers so no new runs are queued
      // for the group's workflows while the group is being deleted.
      const groupWorkflows = assetGroup.assetGroupWorkflows ?? [];
      await Promise.all(
        groupWorkflows
          .map((agw) => agw.jobId)
          .filter((jobId): jobId is string => Boolean(jobId))
          .map((jobId) => this.scanScheduleQueue.removeJobScheduler(jobId)),
      );

      // Delete the group's workflows. The DB-level FK cascades remove the
      // asset_group_workflows join rows and every job history + job that
      // was created for this group (job_histories -> jobs -> job_error_log).
      const workflowIds = groupWorkflows
        .map((agw) => agw.workflow?.id)
        .filter((workflowId): workflowId is string => Boolean(workflowId));
      if (workflowIds.length > 0) {
        await this.workflowRepo.delete(workflowIds);
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
