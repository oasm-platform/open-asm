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
import { In, Repository } from 'typeorm';
import { Asset } from '../assets/entities/assets.entity';
import { Tool } from '../tools/entities/tools.entity';
import { AssetGroupResponseDto } from './dto/asset-group-response.dto';
import { CreateAssetGroupDto } from './dto/create-asset-group.dto';
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
  async getAll(query: GetManyBaseQueryParams, workspaceId: string) {
    try {
      this.logger.log(`Retrieving asset groups for workspace: ${workspaceId}`);
      const { page, limit, sortBy, sortOrder } = query;
      const offset = (page - 1) * limit;

      const [data, total] = await this.assetGroupRepo.findAndCount({
        where: {
          workspace: { id: workspaceId },
        },
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

      this.logger.log(
        `Retrieved ${data.length} asset groups out of ${total} total for workspace: ${workspaceId}`,
      );
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
      this.logger.log(
        `Retrieving asset group with ID: ${id} for workspace: ${workspaceId}`,
      );
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
        this.logger.warn(
          `Asset group with ID "${id}" not found in workspace "${workspaceId}"`,
        );
        throw new NotFoundException(
          `Asset group with ID "${id}" not found in workspace "${workspaceId}"`,
        );
      }

      const response = new AssetGroupResponseDto();
      response.id = assetGroup.id;
      response.name = assetGroup.name;
      response.createdAt = assetGroup.createdAt;
      response.updatedAt = assetGroup.updatedAt;

      // Extract assets and tools from the relationships
      if (assetGroup.assetGroupAssets) {
        response.assets = assetGroup.assetGroupAssets.map((aga) => aga.asset);
      }

      if (assetGroup.assetGroupTools) {
        response.tools = assetGroup.assetGroupTools.map((agt) => agt.tool);
      }

      this.logger.log(`Successfully retrieved asset group with ID: ${id}`);
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
      this.logger.log(
        `Creating new asset group with name: ${createAssetGroupDto.name}`,
      );

      // Validate the workspace exists
      const workspace = await this.assetGroupRepo.manager.findOneBy(Workspace, {
        id: createAssetGroupDto.workspaceId,
      });
      if (!workspace) {
        this.logger.warn(
          `Workspace with ID "${createAssetGroupDto.workspaceId}" not found`,
        );
        throw new NotFoundException(
          `Workspace with ID "${createAssetGroupDto.workspaceId}" not found`,
        );
      }

      const assetGroup = this.assetGroupRepo.create({
        name: createAssetGroupDto.name,
        workspace: { id: createAssetGroupDto.workspaceId },
      });

      const savedAssetGroup = await this.assetGroupRepo.save(assetGroup);
      this.logger.log(
        `Successfully created asset group with ID: ${savedAssetGroup.id}`,
      );
      return savedAssetGroup;
    } catch (error) {
      this.logger.error(`Error creating asset group:`, error);
      throw error;
    }
  }

  /**
   * Associates a tool with the specified asset group
   */
  async addTool(
    groupId: string,
    toolId: string,
  ): Promise<DefaultMessageResponseDto> {
    try {
      this.logger.log(
        `Adding tool with ID: ${toolId} to asset group with ID: ${groupId}`,
      );

      // Verify that both the asset group and tool exist
      const [assetGroup, tool] = await Promise.all([
        this.assetGroupRepo.findOne({ where: { id: groupId } }),
        this.toolRepo.findOne({ where: { id: toolId } }),
      ]);

      if (!assetGroup) {
        this.logger.warn(`Asset group with ID "${groupId}" not found`);
        throw new NotFoundException(
          `Asset group with ID "${groupId}" not found`,
        );
      }

      if (!tool) {
        this.logger.warn(`Tool with ID "${toolId}" not found`);
        throw new NotFoundException(`Tool with ID "${toolId}" not found`);
      }

      // Check if the association already exists
      const existingAssociation = await this.assetGroupToolRepo.findOne({
        where: {
          assetGroup: { id: groupId },
          tool: { id: toolId },
        },
      });

      if (existingAssociation) {
        this.logger.warn(
          `Tool "${toolId}" is already associated with asset group "${groupId}"`,
        );
        throw new BadRequestException(
          `Tool "${toolId}" is already associated with asset group "${groupId}"`,
        );
      }

      // Create the association
      const assetGroupTool = this.assetGroupToolRepo.create({
        assetGroup: { id: groupId },
        tool: { id: toolId },
      });

      await this.assetGroupToolRepo.save(assetGroupTool);

      this.logger.log(
        `Successfully added tool with ID: ${toolId} to asset group with ID: ${groupId}`,
      );
      return {
        message: `Tool "${toolId}" successfully added to asset group "${groupId}"`,
      };
    } catch (error) {
      this.logger.error(
        `Error adding tool with ID ${toolId} to asset group with ID ${groupId}:`,
        error,
      );
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
   * Associates an asset with the specified asset group
   */
  async addAsset(
    groupId: string,
    assetId: string,
  ): Promise<DefaultMessageResponseDto> {
    try {
      this.logger.log(
        `Adding asset with ID: ${assetId} to asset group with ID: ${groupId}`,
      );

      // Verify that both the asset group and asset exist
      const [assetGroup, asset] = await Promise.all([
        this.assetGroupRepo.findOne({ where: { id: groupId } }),
        this.assetRepo.findOne({ where: { id: assetId } }),
      ]);

      if (!assetGroup) {
        this.logger.warn(`Asset group with ID "${groupId}" not found`);
        throw new NotFoundException(
          `Asset group with ID "${groupId}" not found`,
        );
      }

      if (!asset) {
        this.logger.warn(`Asset with ID "${assetId}" not found`);
        throw new NotFoundException(`Asset with ID "${assetId}" not found`);
      }

      // Check if the association already exists
      const existingAssociation = await this.assetGroupAssetRepo.findOne({
        where: {
          assetGroup: { id: groupId },
          asset: { id: assetId },
        },
      });

      if (existingAssociation) {
        this.logger.warn(
          `Asset "${assetId}" is already associated with asset group "${groupId}"`,
        );
        throw new BadRequestException(
          `Asset "${assetId}" is already associated with asset group "${groupId}"`,
        );
      }

      // Create the association
      const assetGroupAsset = this.assetGroupAssetRepo.create({
        assetGroup: { id: groupId },
        asset: { id: assetId },
      });

      await this.assetGroupAssetRepo.save(assetGroupAsset);

      this.logger.log(
        `Successfully added asset with ID: ${assetId} to asset group with ID: ${groupId}`,
      );
      return {
        message: `Asset "${assetId}" successfully added to asset group "${groupId}"`,
      };
    } catch (error) {
      this.logger.error(
        `Error adding asset with ID ${assetId} to asset group with ID ${groupId}:`,
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
      this.logger.log(
        `Adding ${assetIds.length} assets to asset group with ID: ${groupId}`,
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
   * Disassociates a tool from the asset group
   */
  async removeTool(
    groupId: string,
    toolId: string,
  ): Promise<DefaultMessageResponseDto> {
    try {
      this.logger.log(
        `Removing tool with ID: ${toolId} from asset group with ID: ${groupId}`,
      );

      // Verify that the association exists
      const association = await this.assetGroupToolRepo.findOne({
        where: {
          assetGroup: { id: groupId },
          tool: { id: toolId },
        },
      });

      if (!association) {
        this.logger.warn(
          `Tool "${toolId}" is not associated with asset group "${groupId}"`,
        );
        throw new NotFoundException(
          `Tool "${toolId}" is not associated with asset group "${groupId}"`,
        );
      }

      // Remove the association
      await this.assetGroupToolRepo.remove(association);

      this.logger.log(
        `Successfully removed tool with ID: ${toolId} from asset group with ID: ${groupId}`,
      );
      return {
        message: `Tool "${toolId}" successfully removed from asset group "${groupId}"`,
      };
    } catch (error) {
      this.logger.error(
        `Error removing tool with ID ${toolId} from asset group with ID ${groupId}:`,
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
      this.logger.log(
        `Removing ${toolIds.length} tools from asset group with ID: ${groupId}`,
      );

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
        this.logger.warn(
          `Tools with IDs "${missingToolIds.join(', ')}" are not associated with asset group "${groupId}"`,
        );
        throw new NotFoundException(
          `Tools with IDs "${missingToolIds.join(', ')}" are not associated with asset group "${groupId}"`,
        );
      }

      // Remove the associations
      await this.assetGroupToolRepo.remove(associations);

      this.logger.log(
        `Successfully removed ${associations.length} tools from asset group with ID: ${groupId}`,
      );
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
   * Disassociates an asset from the asset group
   */
  async removeAsset(
    groupId: string,
    assetId: string,
  ): Promise<DefaultMessageResponseDto> {
    try {
      this.logger.log(
        `Removing asset with ID: ${assetId} from asset group with ID: ${groupId}`,
      );

      // Verify that the association exists
      const association = await this.assetGroupAssetRepo.findOne({
        where: {
          assetGroup: { id: groupId },
          asset: { id: assetId },
        },
      });

      if (!association) {
        this.logger.warn(
          `Asset "${assetId}" is not associated with asset group "${groupId}"`,
        );
        throw new NotFoundException(
          `Asset "${assetId}" is not associated with asset group "${groupId}"`,
        );
      }

      // Remove the association
      await this.assetGroupAssetRepo.remove(association);

      this.logger.log(
        `Successfully removed asset with ID: ${assetId} from asset group with ID: ${groupId}`,
      );
      return {
        message: `Asset "${assetId}" successfully removed from asset group "${groupId}"`,
      };
    } catch (error) {
      this.logger.error(
        `Error removing asset with ID ${assetId} from asset group with ID ${groupId}:`,
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
      this.logger.log(
        `Removing ${assetIds.length} assets from asset group with ID: ${groupId}`,
      );

      // Find existing associations
      const associations = await this.assetGroupAssetRepo.find({
        where: {
          assetGroup: { id: groupId },
          asset: { id: In(assetIds) },
        },
      });

      if (associations.length === 0) {
        this.logger.warn(
          `No assets with IDs "${assetIds.join(', ')}" are associated with asset group "${groupId}"`,
        );
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
        this.logger.warn(
          `Assets with IDs "${missingAssetIds.join(', ')}" are not associated with asset group "${groupId}"`,
        );
        throw new NotFoundException(
          `Assets with IDs "${missingAssetIds.join(', ')}" are not associated with asset group "${groupId}"`,
        );
      }

      // Remove the associations
      await this.assetGroupAssetRepo.remove(associations);

      this.logger.log(
        `Successfully removed ${associations.length} assets from asset group with ID: ${groupId}`,
      );
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
      this.logger.log(`Deleting asset group with ID: ${id}`);

      const assetGroup = await this.assetGroupRepo.findOne({
        where: { id },
        relations: ['assetGroupAssets', 'assetGroupTools'],
      });

      if (!assetGroup) {
        this.logger.warn(`Asset group with ID "${id}" not found`);
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

      this.logger.log(`Successfully deleted asset group with ID: ${id}`);
      return {
        message: `Asset group "${id}" successfully deleted`,
      };
    } catch (error) {
      this.logger.error(`Error deleting asset group with ID ${id}:`, error);
      throw error;
    }
  }
}
