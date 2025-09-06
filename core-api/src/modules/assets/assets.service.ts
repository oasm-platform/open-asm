import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DefaultMessageResponseDto } from 'src/common/dtos/default-message-response.dto';
import { GetManyBaseResponseDto } from 'src/common/dtos/get-many-base.dto';
import { getManyResponse } from 'src/utils/getManyResponse';
import { DataSource, Repository } from 'typeorm';
import { JobsRegistryService } from '../jobs-registry/jobs-registry.service';
import { Target } from '../targets/entities/target.entity';
import { TechnologyForwarderService } from '../technology/technology-forwarder.service';
import { GetAssetsQueryDto, GetAssetsResponseDto } from './dto/assets.dto';
import { GetIpAssetsDTO } from './dto/get-ip-assets.dto';
import { GetPortAssetsDTO } from './dto/get-port-assets.dto';
import { GetStatusCodeAssetsDTO } from './dto/get-status-code-assets.dto';
import { GetTechnologyAssetsDTO } from './dto/get-technology-assets.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { Asset } from './entities/assets.entity';
import { HttpResponse } from './entities/http-response.entity';
import { Port } from './entities/ports.entity';

@Injectable()
export class AssetsService {
  constructor(
    @InjectRepository(Asset)
    public readonly assetRepo: Repository<Asset>,

    @InjectRepository(Target)
    public readonly targetRepo: Repository<Target>,
    private jobRegistryService: JobsRegistryService,
    private eventEmitter: EventEmitter2,
    private technologyForwarderService: TechnologyForwarderService,

    private dataSource: DataSource,
  ) {}

  /**
   * Retrieves all assets associated with a specified target.
   *
   * @param targetId - The ID of the target for which to retrieve assets.
   * @returns A promise that resolves to an array of assets.
   */
  public getAllAssetsByTargetId(targetId: string): Promise<Asset[]> {
    return this.assetRepo.find({
      where: {
        target: { id: targetId },
      },
    });
  }

  private buildBaseQuery(query: GetAssetsQueryDto, workspaceId?: string) {
    const { targetIds, ipAddresses, ports, techs, statusCodes } = query;

    const whereBuilder = {
      targetIds: {
        value: targetIds,
        whereClause: `"assets"."targetId" = ANY(:param)`,
      },
      workspaceId: {
        value: workspaceId,
        whereClause: `"workspaceTargets"."workspaceId" = :param`,
      },
      techs: {
        value: techs,
        whereClause: `"httpResponses"."tech" && :param`,
      },
      ipAddresses: {
        value: ipAddresses,
        whereClause: '"ipAssets"."ip" = ANY(:param)',
      },
      ports: {
        value: ports,
        whereClause: `"ports"."ports" && :param`,
      },
      statusCodes: {
        value: statusCodes,
        whereClause: `"statusCodeAssets"."statusCode" = ANY(:param)`,
      },
    };

    const queryBuilder = this.assetRepo
      .createQueryBuilder('assets')
      .leftJoin('assets.httpResponses', 'httpResponses')
      .leftJoin('assets.ports', 'ports')
      .leftJoin('assets.target', 'targets')
      .leftJoin('assets.tags', 'tags')
      .leftJoin('targets.workspaceTargets', 'workspaceTargets')
      .leftJoin('assets.ipAssets', 'ipAssets')
      .leftJoin('assets.statusCodeAssets', 'statusCodeAssets')
      .where('assets."isErrorPage" = false');

    for (const [key, value] of Object.entries(whereBuilder)) {
      if (query[key]) {
        const newWhereClause = value.whereClause.replaceAll(
          ':param',
          `:${key}`,
        );
        queryBuilder.andWhere(newWhereClause, {
          [key]: value.value,
        });
      }
    }

    return queryBuilder;
  }

  /**
   * Retrieves a paginated list of assets associated with a specified target.
   *
   * @param id - The ID of the target for which to retrieve assets.
   * @param query - The query parameters to filter and paginate the assets.
   * @returns A promise that resolves to a paginated list of assets, including total count and pagination information.
   */
  public async getAssetsInWorkspace(
    query: GetAssetsQueryDto,
    workspaceId: string,
  ): Promise<GetManyBaseResponseDto<GetAssetsResponseDto>> {
    if (!(query.sortBy in Asset)) {
      query.sortBy = 'createdAt';
    }

    const offset = (query.page - 1) * query.limit;

    const queryBuilder = this.buildBaseQuery(query, workspaceId).select([
      'assets.value',
      'assets.id',
      'assets.targetId',
      'assets.createdAt',
      'ipAssets.ipAddress',
      'httpResponses.tech',
      'httpResponses.title',
      'httpResponses.tls',
      'ports.ports',
      'tags.tag',
      'httpResponses.chain_status_codes',
      'httpResponses.status_code',
    ]);

    if (query.value) {
      queryBuilder.andWhere('assets.value ILIKE :value', {
        value: `%${query.value}%`,
      });
    }

    const [list, total] = await queryBuilder
      .orderBy(`assets.${query.sortBy}`, query.sortOrder)
      .skip(offset)
      .take(query.limit)
      .getManyAndCount();

    const assets = list.map(async (item) => {
      const asset = new GetAssetsResponseDto();
      asset.id = item.id;
      asset.value = item.value;
      asset.targetId = item.targetId;
      asset.createdAt = item.createdAt;
      asset.dnsRecords = item.dnsRecords;
      asset.tags = item.tags;
      asset.ports = item.ports ? item.ports[0] : undefined;
      asset.ipAddresses = item.ipAssets
        ? item.ipAssets.map((e) => e.ipAddress)
        : [];

      if (item.httpResponses) {
        asset.httpResponses = item.httpResponses[0];
        if (asset.httpResponses.tech) {
          const techList = (
            await this.technologyForwarderService.enrichTechnologies(
              asset.httpResponses.tech,
            )
          ).map((e) => {
            return {
              name: e.name,
              description: e.description,
              iconUrl: e.iconUrl,
              categoryNames: e.categoryNames,
            };
          });

          asset.httpResponses.techList = techList.filter(
            (e) => e.name !== undefined,
          );
        }
      }
      return asset;
    });

    const data = await Promise.all(assets);

    return getManyResponse({ query, data, total });
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
  }): Promise<Asset> {
    return this.assetRepo.save({
      id: randomUUID(),
      target,
      value,
      isPrimary: true,
    });
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
    await this.targetRepo.update(targetId, {
      reScanCount,
      lastDiscoveredAt: new Date(),
    });
    this.eventEmitter.emit('target.re_scan', target);
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
    const queryBuilder = this.buildBaseQuery(new GetAssetsQueryDto())
      .select([
        'assets.value',
        'assets.id',
        'assets.targetId',
        'assets.createdAt',
        'ipAssets.ipAddress',
        'tags',
        'httpResponses.tech',
        'httpResponses.title',
        'httpResponses.tls',
        'ports.ports',
        'httpResponses.chain_status_codes',
        'httpResponses.status_code',
        'httpResponses.raw_header',
      ])
      .andWhere('assets.id = :id', { id });

    const item = await queryBuilder.getOneOrFail();

    const asset = new GetAssetsResponseDto();
    asset.id = item.id;
    asset.value = item.value;
    asset.targetId = item.targetId;
    asset.createdAt = item.createdAt;
    asset.dnsRecords = item.dnsRecords;
    asset.tags = item.tags;
    asset.ports = item.ports ? item.ports[0] : undefined;
    asset.ipAddresses = item.ipAssets
      ? item.ipAssets.map((e) => e.ipAddress)
      : [];

    if (item.httpResponses) {
      asset.httpResponses = item.httpResponses[0];
      const techList = (
        await this.technologyForwarderService.enrichTechnologies(
          asset.httpResponses.tech,
        )
      ).map((e) => ({
        name: e.name,
        description: e.description,
        iconUrl: e.iconUrl,
        categoryNames: e.categoryNames,
      }));

      asset.httpResponses.techList = techList;
    }

    return asset;
  }

  /**
   * Retrieves a list of IP with number of asset
   *
   * @returns A promise that resolves to the list of ip.
   *
   */
  public async getIpAssets(
    query: GetAssetsQueryDto,
    workspaceId: string,
  ): Promise<GetManyBaseResponseDto<GetIpAssetsDTO>> {
    const offset = (query.page - 1) * query.limit;
    if (!(query.sortBy in GetIpAssetsDTO)) {
      query.sortBy = '"assetCount"';
    }

    const queryBuilder = this.buildBaseQuery(query, workspaceId)
      .select([
        '"ipAssets"."ip"',
        'COUNT(DISTINCT "assets"."id") as "assetCount"',
      ])
      .andWhere('"ipAssets"."ip" IS NOT NULL')
      .andWhere('"ipAssets"."ip" ILIKE :value', {
        value: `%${query.value}%`,
      })
      .distinct(true)
      .groupBy('"ipAssets"."ip"');

    if (query.value) {
      queryBuilder.andWhere('"ipAssets"."ip"::text ILIKE :value', {
        value: `%${query.value}%`,
      });
    }

    const totalInDb = await this.dataSource
      .createQueryBuilder()
      .select('COUNT(*)')
      .from('(' + queryBuilder.getQuery() + ')', 't1')
      .setParameters(queryBuilder.getParameters())
      .getRawOne<{ count: number }>();

    const list = await queryBuilder
      .orderBy(query.sortBy, query.sortOrder)
      .limit(query.limit)
      .offset(offset)
      .getRawMany();

    const total = totalInDb?.count ?? 0;

    const data = list.map((item: GetIpAssetsDTO) => {
      const obj = new GetIpAssetsDTO();
      obj.ip = item.ip;
      obj.assetCount = item.assetCount;
      return obj;
    });

    return getManyResponse({ query, data, total });
  }

  /**
   * Retrieves a list of Port with number of asset
   *
   * @returns A promise that resolves to the list of port.
   *
   */
  public async getPortAssets(
    query: GetAssetsQueryDto,
    workspaceId: string,
  ): Promise<GetManyBaseResponseDto<GetPortAssetsDTO>> {
    const offset = (query.page - 1) * query.limit;
    if (!(query.sortBy in GetIpAssetsDTO)) {
      query.sortBy = '"assetCount"';
    }

    const queryBuilder = this.buildBaseQuery(query, workspaceId)
      .innerJoin(
        (subQuery) =>
          subQuery
            .select('"ports"."assetId"', 'assetId')
            .addSelect('unnest("ports"."ports")', 'port')
            .from(Port, 'ports'),
        'sq',
        '"sq"."assetId" = "assets"."id"',
      )
      .select(['"sq"."port"', 'COUNT(DISTINCT "assets"."id") as "assetCount"'])
      .andWhere('"sq"."port" IS NOT NULL')
      .andWhere('"sq"."port"::text ILIKE :value', {
        value: `%${query.value}%`,
      })
      .distinct(true)
      .groupBy('"sq"."port"');

    if (query.value) {
      queryBuilder.andWhere('"sq"."port"::text ILIKE :value', {
        value: `%${query.value}%`,
      });
    }

    const totalInDb = await this.dataSource
      .createQueryBuilder()
      .select('COUNT(*)')
      .from('(' + queryBuilder.getQuery() + ')', 't1')
      .setParameters(queryBuilder.getParameters())
      .getRawOne<{ count: number }>();

    const list = await queryBuilder
      .orderBy(query.sortBy, query.sortOrder)
      .limit(query.limit)
      .offset(offset)
      .getRawMany();

    const total = totalInDb?.count ?? 0;

    const data = list.map((item: GetPortAssetsDTO) => {
      const obj = new GetPortAssetsDTO();
      obj.port = item.port;
      obj.assetCount = item.assetCount;
      return obj;
    });

    return getManyResponse({ query, data, total });
  }

  /**
   * Retrieves a list of Port with number of asset
   *
   * @returns A promise that resolves to the list of port.
   *
   */
  public async getTechnologyAssets(
    query: GetAssetsQueryDto,
    workspaceId: string,
  ): Promise<GetManyBaseResponseDto<GetTechnologyAssetsDTO>> {
    const offset = (query.page - 1) * query.limit;
    if (!(query.sortBy in GetIpAssetsDTO)) {
      query.sortBy = '"assetCount"';
    }

    const queryBuilder = this.buildBaseQuery(query, workspaceId)
      .innerJoin(
        (subQuery) =>
          subQuery
            .select('"httpResponses"."assetId"', 'assetId')
            .addSelect('unnest("httpResponses"."tech")', 'technology')
            .from(HttpResponse, 'httpResponses'),
        'sq',
        '"sq"."assetId" = "assets"."id"',
      )
      .select([
        '"sq"."technology"',
        'COUNT(DISTINCT "assets"."id") as "assetCount"',
      ])
      .andWhere('"sq"."technology" IS NOT NULL')
      .distinct(true)
      .groupBy('"sq"."technology"');

    if (query.value) {
      queryBuilder.andWhere('"sq"."technology"::text ILIKE :value', {
        value: `%${query.value}%`,
      });
    }

    const totalInDb = await this.dataSource
      .createQueryBuilder()
      .select('COUNT(*)')
      .from('(' + queryBuilder.getQuery() + ')', 't1')
      .setParameters(queryBuilder.getParameters())
      .getRawOne<{ count: number }>();

    const list = await queryBuilder
      .orderBy(query.sortBy, query.sortOrder)
      .limit(query.limit)
      .offset(offset)
      .getRawMany();

    const total = totalInDb?.count ?? 0;

    const enrichedTechs =
      await this.technologyForwarderService.enrichTechnologies(
        list.map(
          (item: { technology: string; assetCount: number }) => item.technology,
        ),
      );

    const data = list
      .map((item: { technology: string; assetCount: number }) => {
        const obj = new GetTechnologyAssetsDTO();
        obj.assetCount = item.assetCount;

        const enrichedTech = enrichedTechs.find(
          (tech) => tech?.name === item.technology,
        );

        if (enrichedTech) {
          obj.technology = enrichedTech;
        }

        return obj;
      })
      .filter((e) => e.technology !== undefined);

    return getManyResponse({ query, data, total });
  }

  /**
   * Retrieves a list of Status Code with number of asset
   *
   * @returns A promise that resolves to the list of status code.
   *
   */
  public async getStatusCodeAssets(
    query: GetAssetsQueryDto,
    workspaceId: string,
  ): Promise<GetManyBaseResponseDto<GetStatusCodeAssetsDTO>> {
    const offset = (query.page - 1) * query.limit;
    if (!(query.sortBy in GetIpAssetsDTO)) {
      query.sortBy = '"assetCount"';
    }

    const queryBuilder = this.buildBaseQuery(query, workspaceId)
      .select([
        '"statusCodeAssets"."statusCode"',
        'COUNT(DISTINCT "assets"."id") as "assetCount"',
      ])
      .andWhere('"statusCodeAssets"."statusCode" IS NOT NULL')
      .andWhere('"statusCodeAssets"."statusCode"::text ILIKE :value', {
        value: `%${query.value}%`,
      })
      .distinct(true)
      .groupBy('"statusCodeAssets"."statusCode"');

    if (query.value) {
      queryBuilder.andWhere(
        '"statusCodeAssets"."statusCode"::text ILIKE :value',
        {
          value: `%${query.value}%`,
        },
      );
    }

    const totalInDb = await this.dataSource
      .createQueryBuilder()
      .select('COUNT(*)')
      .from('(' + queryBuilder.getQuery() + ')', 't1')
      .setParameters(queryBuilder.getParameters())
      .getRawOne<{ count: number }>();

    const list = await queryBuilder
      .orderBy(query.sortBy, query.sortOrder)
      .limit(query.limit)
      .offset(offset)
      .getRawMany();

    const total = totalInDb?.count ?? 0;

    const data = list.map((item: GetStatusCodeAssetsDTO) => {
      const obj = new GetStatusCodeAssetsDTO();
      obj.statusCode = item.statusCode;
      obj.assetCount = item.assetCount;
      return obj;
    });

    return getManyResponse({ query, data, total });
  }

  /**
   * Counts the number of unique technologies in a workspace.
   *
   * @param workspaceId - The ID of the workspace.
   * @returns The count of unique technologies in the workspace.
   */
  public async countUniqueTechnologiesInWorkspace(
    workspaceId: string,
  ): Promise<number> {
    const result = await this.assetRepo
      .createQueryBuilder('assets')
      .leftJoin(
        (subQuery) =>
          subQuery
            .select('httpResponses.assetId', 'assetId')
            .addSelect('unnest(httpResponses.tech)', 'tech')
            .from(HttpResponse, 'httpResponses'),
        'techUnnested',
        '"techUnnested"."assetId" = "assets"."id"',
      )
      .leftJoin('assets.target', 'targets')
      .leftJoin('targets.workspaceTargets', 'workspaceTargets')
      .select(`"techUnnested"."tech"`, 'technology')
      .distinct(true)
      .where(`"techUnnested"."tech" is not null`)
      .andWhere('workspaceTargets.workspaceId = :workspaceId', { workspaceId })
      .getRawMany();

    return result.length;
  }

  /**
   * Updates an asset by its ID.
   *
   * @param id - The ID of the asset to update.
   * @param updateAssetDto - The DTO containing the update information.
   * @returns A promise that resolves to the updated asset.
   * @throws NotFoundException if the asset with the given ID is not found.
   */
  public async updateAssetById(
    id: string,
    updateAssetDto: UpdateAssetDto,
  ): Promise<Asset> {
    const asset = await this.assetRepo.findOne({
      where: { id },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    // Update the asset with the provided data
    // Handle tags update
    if (updateAssetDto.tags) {
      // Remove existing tags
      await this.dataSource
        .createQueryBuilder()
        .delete()
        .from('asset_tags')
        .where('assetId = :assetId', { assetId: id })
        .execute();

      // Add new tags
      const tagsToInsert = updateAssetDto.tags.map((tag) => ({
        tag,
        assetId: id,
      }));

      if (tagsToInsert.length > 0) {
        await this.dataSource
          .createQueryBuilder()
          .insert()
          .into('asset_tags')
          .values(tagsToInsert)
          .execute();
      }
    }

    // Save the updated asset
    return this.assetRepo.save(asset);
  }
}
