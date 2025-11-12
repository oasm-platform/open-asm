import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { getManyResponse } from '@/utils/getManyResponse';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Repository } from 'typeorm';
import { Asset } from '../assets/entities/assets.entity';
import { Tool } from '../tools/entities/tools.entity';
import { AssetGroupResponseDto } from './dto/asset-group-response.dto';
import { CreateAssetGroupDto } from './dto/create-asset-group.dto';
import { GetAllAssetGroupsQueryDto } from './dto/get-all-asset-groups-dto.dto';
import { AssetGroupAsset } from './entities/asset-groups-assets.entity';
import { AssetGroupTool } from './entities/asset-groups-tools.entity';
import { AssetGroup } from './entities/asset-groups.entity';

@Injectable()
export class AssetGroupService {
  private readonly logger = new Logger(AssetGroupService.name);

  constructor(
    @InjectRepository(AssetGroup)
    public readonly assetGroupRepo: Repository<AssetGroup>,
    @InjectRepository(AssetGroupAsset)
    public readonly assetGroupAssetRepo: Repository<AssetGroupAsset>,
    @InjectRepository(AssetGroupTool)
    public readonly assetGroupToolRepo: Repository<AssetGroupTool>,
    @InjectRepository(Asset)
    public readonly assetRepo: Repository<Asset>,
    @InjectRepository(Tool)
    public readonly toolRepo: Repository<Tool>,
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
          'assetGroupTools',
          'assetGroupTools.tool',
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
  async getById(
    id: string,
    workspaceId: string,
  ): Promise<AssetGroupResponseDto> {
    try {
      const assetGroup = await this.assetGroupRepo.findOne({
        where: { id, workspace: { id: workspaceId } },
        relations: [
          'assetGroupAssets',
          'assetGroupTools',
          'assetGroupTools.tool',
          'assetGroupAssets.asset',
        ],
      });

      if (!assetGroup) {
        throw new NotFoundException(
          `Asset group with ID "${id}" not found in workspace "${workspaceId}"`,
        );
      }

      const response = new AssetGroupResponseDto();
      response.id = assetGroup.id;
      response.name = assetGroup.name;
      response.createdAt = assetGroup.createdAt;
      response.updatedAt = assetGroup.updatedAt;

      // // Extract assets and tools from the relationships
      // if (assetGroup.assetGroupAssets) {
      //   response.assets = assetGroup.assetGroupAssets.map((aga) => aga.asset);
      // }
      //
      // if (assetGroup.assetGroupTools) {
      //   response.tools = assetGroup.assetGroupTools.map((agt) => agt.tool);
      // }

      return response;
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
  async create(createAssetGroupDto: CreateAssetGroupDto) {
    try {
      // Validate the workspace exists
      const workspace = await this.assetGroupRepo.manager.findOneBy(Workspace, {
        id: createAssetGroupDto.workspaceId,
      });
      if (!workspace) {
        throw new NotFoundException(
          `Workspace with ID "${createAssetGroupDto.workspaceId}" not found`,
        );
      }

      // Check if an asset group with the same name already exists in the workspace
      const existingAssetGroup = await this.assetGroupRepo.findOne({
        where: {
          name: createAssetGroupDto.name,
          workspace: { id: createAssetGroupDto.workspaceId },
        },
      });

      if (existingAssetGroup) {
        throw new BadRequestException(
          `An asset group with name "${createAssetGroupDto.name}" already exists in this workspace`,
        );
      }

      const assetGroup = this.assetGroupRepo.create({
        name: createAssetGroupDto.name,
        workspace: { id: createAssetGroupDto.workspaceId },
      });

      const savedAssetGroup = await this.assetGroupRepo.save(assetGroup);
      return savedAssetGroup;
    } catch (error) {
      this.logger.error(`Error creating asset group:`, error);
      throw error;
    }
  }

  /**
   * Associates multiple tools with the specified asset group
   */
  async addManyTools(
    groupId: string,
    toolIds: string[],
  ): Promise<DefaultMessageResponseDto> {
    try {
      this.logger.log(
        `Adding ${toolIds.length} tools to asset group with ID: ${groupId}`,
      );

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

      // Verify that all tools exist
      const tools = await this.toolRepo.findByIds(toolIds);
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

      // Find existing associations to avoid duplicates
      const existingAssociations = await this.assetGroupToolRepo.find({
        where: {
          assetGroup: { id: groupId },
          tool: { id: In(toolIds) },
        },
      });

      const existingToolIds = existingAssociations.map(
        (assoc) => assoc.tool.id,
      );
      if (existingToolIds.length > 0) {
        this.logger.warn(
          `Tools with IDs "${existingToolIds.join(', ')}" are already associated with asset group "${groupId}"`,
        );
        throw new BadRequestException(
          `Tools with IDs "${existingToolIds.join(', ')}" are already associated with asset group "${groupId}"`,
        );
      }

      // Create new associations
      const newAssociations = toolIds.map((toolId) =>
        this.assetGroupToolRepo.create({
          assetGroup: { id: groupId },
          tool: { id: toolId },
        }),
      );

      await this.assetGroupToolRepo.save(newAssociations);

      this.logger.log(
        `Successfully added ${newAssociations.length} tools to asset group with ID: ${groupId}`,
      );
      return {
        message: `${newAssociations.length} tools successfully added to asset group "${groupId}"`,
      };
    } catch (error) {
      this.logger.error(
        `Error adding tools to asset group with ID ${groupId}:`,
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

      this.logger.log(
        `Successfully added ${newAssociations.length} assets to asset group with ID: ${groupId}`,
      );
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
   * Disassociates multiple tools from the asset group
   */
  async removeManyTools(
    groupId: string,
    toolIds: string[],
  ): Promise<DefaultMessageResponseDto> {
    try {
      // Find existing associations
      const associations = await this.assetGroupToolRepo.find({
        where: {
          assetGroup: { id: groupId },
          tool: { id: In(toolIds) },
        },
      });

      if (associations.length === 0) {
        this.logger.warn(
          `No tools with IDs "${toolIds.join(', ')}" are associated with asset group "${groupId}"`,
        );
        throw new NotFoundException(
          `No tools with IDs "${toolIds.join(', ')}" are associated with asset group "${groupId}"`,
        );
      }

      // Check for missing associations
      const associatedToolIds = associations.map((assoc) => assoc.tool.id);
      const missingToolIds = toolIds.filter(
        (id) => !associatedToolIds.includes(id),
      );
      if (missingToolIds.length > 0) {
        throw new NotFoundException(
          `Tools with IDs "${missingToolIds.join(', ')}" are not associated with asset group "${groupId}"`,
        );
      }

      // Remove the associations
      await this.assetGroupToolRepo.remove(associations);

      return {
        message: `${associations.length} tools successfully removed from asset group "${groupId}"`,
      };
    } catch (error) {
      this.logger.error(
        `Error removing tools from asset group with ID ${groupId}:`,
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
        relations: ['assetGroupAssets', 'assetGroupTools'],
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

      if (assetGroup.assetGroupTools && assetGroup.assetGroupTools.length > 0) {
        await this.assetGroupToolRepo.remove(assetGroup.assetGroupTools);
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
        .innerJoin('assets_group_assets', 'aga', 'aga.asset_id = asset.id')
        .innerJoin('asset_groups', 'ag', 'ag.id = aga.asset_group_id')
        .where(
          'aga.asset_group_id = :assetGroupId AND ag.workspace_id = :workspaceId',
          {
            assetGroupId,
            workspaceId,
          },
        );

      const [data, total] = await queryBuilder
        .orderBy(`asset.${sortBy}`, sortOrder)
        .skip(offset)
        .take(limit)
        .leftJoinAndSelect('asset.assetGroupAssets', 'assetGroupAssets')
        .leftJoinAndSelect('asset.target', 'target')
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
   * Retrieves tools associated with a specific asset group with pagination
   */
  async getToolsByAssetGroupsId(
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

      // Build query using query builder to get tools associated with the asset group
      const queryBuilder = this.toolRepo
        .createQueryBuilder('tool')
        .innerJoin('asset_group_tools', 'agt', 'agt.tool_id = tool.id')
        .innerJoin('asset_groups', 'ag', 'ag.id = agt.asset_group_id')
        .where(
          'agt.asset_group_id = :assetGroupId AND ag.workspace_id = :workspaceId',
          {
            assetGroupId,
            workspaceId,
          },
        );

      const [data, total] = await queryBuilder
        .orderBy(`tool.${sortBy}`, sortOrder)
        .skip(offset)
        .take(limit)
        .leftJoinAndSelect('tool.assetGroupTools', 'assetGroupTools')
        .leftJoinAndSelect('tool.workspaceTools', 'workspaceTools')
        .leftJoinAndSelect('tool.provider', 'provider')
        .getManyAndCount();

      return getManyResponse({ query, data, total });
    } catch (error) {
      this.logger.error(
        `Error retrieving tools for asset group with ID ${assetGroupId} in workspace ${workspaceId}:`,
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
          'aga.asset_id = asset.id AND aga.asset_group_id = :assetGroupId',
          { assetGroupId },
        )
        .where(
          'aga.asset_id IS NULL AND asset."targetId" IN (SELECT t.id FROM targets t JOIN workspace_targets wt ON t.id = wt."targetId" WHERE wt."workspaceId" = :workspaceId)',
          {
            assetGroupId,
            workspaceId,
          },
        );

      const [data, total] = await queryBuilder
        .orderBy(`asset.${sortBy}`, sortOrder)
        .skip(offset)
        .take(limit)
        .leftJoinAndSelect('asset.tags', 'tags')
        .leftJoinAndSelect('asset.target', 'target')
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
   * Retrieves tools not associated with a specific asset group but preinstalled in the workspace with pagination
   */
  async getToolsNotInAssetGroup(
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

      // Build query using query builder to get tools that are NOT in the asset group but ARE in the workspace
      const queryBuilder = this.toolRepo
        .createQueryBuilder('tool')
        .innerJoin(
          'workspace_tools',
          'wt',
          'wt."toolId" = tool.id AND wt."workspaceId" = :workspaceId',
          { workspaceId },
        )
        .leftJoin(
          'asset_group_tools',
          'agt',
          'agt."tool_id" = tool.id AND agt."asset_group_id" = :assetGroupId',
          { assetGroupId },
        )
        .where('agt."tool_id" IS NULL'); // Only tools not in the asset group

      const [data, total] = await queryBuilder
        .orderBy(`tool.${sortBy}`, sortOrder)
        .skip(offset)
        .take(limit)
        .leftJoinAndSelect('tool.assetGroupTools', 'assetGroupTools')
        .leftJoinAndSelect('tool.workspaceTools', 'workspaceTools')
        .leftJoinAndSelect('tool.provider', 'provider')
        .getManyAndCount();

      // Add isInstalled flag to each tool
      const toolsWithInstalledFlag = data.map((tool) => {
        tool.isInstalled = true; // All these tools are already in the workspace
        return tool;
      });

      return getManyResponse({ query, data: toolsWithInstalledFlag, total });
    } catch (error) {
      this.logger.error(
        `Error retrieving tools not in asset group with ID ${assetGroupId} in workspace ${workspaceId}:`,
        error,
      );
      throw error;
    }
  }
}
