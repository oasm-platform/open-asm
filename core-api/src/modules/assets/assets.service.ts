import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DefaultMessageResponseDto } from 'src/common/dtos/default-message-response.dto';
import { GetManyBaseResponseDto } from 'src/common/dtos/get-many-base.dto';
import { ToolCategory } from 'src/common/enums/enum';
import { getManyResponse } from 'src/utils/getManyResponse';
import { Repository } from 'typeorm';
import { JobsRegistryService } from '../jobs-registry/jobs-registry.service';
import { Target } from '../targets/entities/target.entity';
import { GetAssetsQueryDto, GetAssetsResponseDto } from './dto/assets.dto';
import { Asset } from './entities/assets.entity';
import { HttpResponse } from './entities/http-response.entity';
@Injectable()
export class AssetsService {
  constructor(
    @InjectRepository(Asset)
    public readonly assetRepo: Repository<Asset>,

    @InjectRepository(Target)
    public readonly targetRepo: Repository<Target>,
    private jobRegistryService: JobsRegistryService,
  ) {}

  /**
   * Retrieves a paginated list of assets associated with a specified target.
   *
   * @param id - The ID of the target for which to retrieve assets.
   * @param query - The query parameters to filter and paginate the assets.
   * @returns A promise that resolves to a paginated list of assets, including total count and pagination information.
   */
  public async getAssetsInWorkspace(
    query: GetAssetsQueryDto,
    assetID?: string,
  ): Promise<GetManyBaseResponseDto<GetAssetsResponseDto>> {
    let { limit, page, sortOrder, targetIds, workspaceId, value } = query;

    let sortBy = query.sortBy;
    if (!(sortBy in Asset)) {
      sortBy = 'createdAt';
    }
    const offset = (page - 1) * limit;

    const queryBuilder = this.assetRepo
      .createQueryBuilder('assets')
      .leftJoinAndSelect('assets.httpResponses', 'httpResponses')
      .leftJoinAndSelect('assets.ports', 'ports')
      .leftJoinAndSelect('assets.target', 'targets')
      .leftJoin('targets.workspaceTargets', 'workspaceTargets')
      .where('assets.isErrorPage = false')
      .orderBy(`assets.${sortBy}`, sortOrder);

    if (!!value)
      queryBuilder.andWhere('assets.value ILIKE :value', {
        value: `%${value}%`,
      });

    if (!!targetIds)
      queryBuilder.andWhere('assets.targetId = ANY(:targetID)', {
        targetID: targetIds,
      });

    if (!!workspaceId)
      queryBuilder.andWhere('workspaceTargets.workspaceId = :workspaceId', {
        workspaceId,
      });

    if (!!assetID)
      queryBuilder.andWhere('assets.id = :assetID', {
        assetID,
      });

    const total = await queryBuilder.getCount();

    const assets = (
      await queryBuilder.limit(limit).offset(offset).getMany()
    ).map((item) => {
      const asset = new GetAssetsResponseDto();
      asset.id = item.id;
      asset.value = item.value;
      asset.targetId = item.target.id;
      asset.isPrimary = item.isPrimary;
      asset.createdAt = item.createdAt;
      asset.updatedAt = item.updatedAt;
      asset.dnsRecords = item.dnsRecords;
      asset.isErrorPage = item.isErrorPage;
      asset.httpResponses = item.httpResponses ? item.httpResponses[0] : null;
      asset.ports = item.ports ? item.ports[0] : null;
      return asset;
    });

    return getManyResponse(query, assets, total);
  }

  /**
   * Creates an asset in the database associated with the given target.
   *
   * @param target - The target to which the asset is associated.
   * @returns The created asset.
   */
  public async createPrimaryAsset({
    target,
    value,
  }: {
    target: Target;
    value: string;
    isPrimary?: boolean;
  }): Promise<Asset> {
    const asset = await this.assetRepo.save({
      id: randomUUID(),
      target,
      value,
      isPrimary: true,
    });
    this.jobRegistryService.createJob(asset, ToolCategory.SUBDOMAINS);
    return asset;
  }

  /**
   * Triggers a rescan for a specific asset by creating new jobs for relevant workers.
   *
   * @param assetId - The ID of the asset to rescan.
   * @throws Error if the asset is not found.
   */
  public async reScan(targetId: string): Promise<DefaultMessageResponseDto> {
    const asset = await this.assetRepo.findOne({
      where: {
        target: { id: targetId },
        isPrimary: true,
      },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }
    const target = await this.targetRepo.findOne({
      where: {
        id: targetId,
      },
    });
    if (!target) {
      throw new NotFoundException('Target not found');
    }
    const reScanCount = target.reScanCount + 1;
    this.jobRegistryService.createJob(asset, ToolCategory.SUBDOMAINS);
    this.targetRepo.update(targetId, {
      reScanCount,
      lastDiscoveredAt: new Date(),
    });
    return {
      message: 'Scan started',
    };
  }

  /**
   * Counts the number of assets in a workspace.
   *
   * @param workspaceId - The ID of the workspace.
   * @returns The count of assets in the workspace.
   */
  public async countAssetsInWorkspace(workspaceId: string) {
    return this.assetRepo.count({
      where: {
        target: { workspaceTargets: { workspace: { id: workspaceId } } },
      },
    });
  }

  /**
   * Retrieves a single asset by its ID.
   *
   * @param id - The ID of the asset to retrieve.
   * @returns A promise that resolves to the found asset.
   * @throws NotFoundException if the asset with the given ID is not found.
   */
  public async getAssetById(id: string): Promise<GetAssetsResponseDto> {
    const asset = await this.getAssetsInWorkspace(new GetAssetsQueryDto(), id);
    return asset.data[0];
  }
}
