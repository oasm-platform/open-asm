import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { getManyResponse } from '@/utils/getManyResponse';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Asset } from '../assets/entities/assets.entity';
import { AssetGroupAsset } from './entities/asset-groups-assets.entity';
import { AssetGroup } from './entities/asset-groups.entity';

const ALLOWED_ASSET_SORT_FIELDS = ['createdAt', 'updatedAt', 'value'] as const;

@Injectable()
export class AssetGroupAssetService {
  private readonly logger = new Logger(AssetGroupAssetService.name);
  constructor(
    @InjectRepository(AssetGroup)
    private readonly assetGroupRepo: Repository<AssetGroup>,
    @InjectRepository(AssetGroupAsset)
    private readonly assetGroupAssetRepo: Repository<AssetGroupAsset>,
    @InjectRepository(Asset)
    private readonly assetRepo: Repository<Asset>,
  ) {}

  /**
   * Associates multiple assets with the specified asset group
   */
  async addManyAssets(
    groupId: string,
    assetIds: string[],
    workspaceId?: string,
  ): Promise<DefaultMessageResponseDto> {
    try {
      // Verify that the asset group exists
      const assetGroup = await this.assetGroupRepo.findOne({
        where: { id: groupId },
        relations: ['workspace'],
      });
      if (!assetGroup) {
        this.logger.warn(`Asset group with ID "${groupId}" not found`);
        throw new NotFoundException(
          `Asset group with ID "${groupId}" not found`,
        );
      }
      if (workspaceId && assetGroup.workspace?.id !== workspaceId) {
        throw new ForbiddenException(
          'Group does not belong to this workspace',
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
   * Disassociates multiple assets from the asset group
   */
  async removeManyAssets(
    groupId: string,
    assetIds: string[],
    workspaceId?: string,
  ): Promise<DefaultMessageResponseDto> {
    try {
      // Validate group exists and belongs to the workspace
      const assetGroup = await this.assetGroupRepo.findOne({
        where: { id: groupId },
        relations: ['workspace'],
      });
      if (!assetGroup) {
        throw new NotFoundException(
          `Asset group with ID "${groupId}" not found`,
        );
      }
      if (workspaceId && assetGroup.workspace?.id !== workspaceId) {
        throw new ForbiddenException(
          'Group does not belong to this workspace',
        );
      }

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
   * Retrieves assets associated with a specific asset group with pagination
   */
  async getAssetsByAssetGroupsId(
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

      if (search) {
        queryBuilder.andWhere('asset.value ILIKE :search', {
          search: `%${search}%`,
        });
      }

      const safeSortBy = (ALLOWED_ASSET_SORT_FIELDS as readonly string[]).includes(sortBy)
        ? sortBy
        : 'createdAt';
      const [data, total] = await queryBuilder
        .orderBy(`asset.${safeSortBy}`, sortOrder)
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
        .innerJoin(
          'targets',
          'target',
          'target.id = asset."targetId" AND target."workspaceId" = :workspaceId',
          { workspaceId },
        )
        .where('aga.assetId IS NULL');

      if (search) {
        queryBuilder.andWhere('asset.value ILIKE :search', {
          search: `%${search}%`,
        });
      }

      const safeSortBy = (ALLOWED_ASSET_SORT_FIELDS as readonly string[]).includes(sortBy)
        ? sortBy
        : 'createdAt';
      const [data, total] = await queryBuilder
        .orderBy(`asset.${safeSortBy}`, sortOrder)
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
}
