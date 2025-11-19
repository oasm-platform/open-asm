import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import {
  GetManyBaseResponseDto,
  SortOrder,
} from '@/common/dtos/get-many-base.dto';
import { getManyResponse } from '@/utils/getManyResponse';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { Target } from '../targets/entities/target.entity';
import { TechnologyDetailDTO } from '../technology/dto/technology-detail.dto';
import { TechnologyForwarderService } from '../technology/technology-forwarder.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { GetAssetsQueryDto, GetAssetsResponseDto } from './dto/assets.dto';
import { GetIpAssetsDTO } from './dto/get-ip-assets.dto';
import { GetPortAssetsDTO } from './dto/get-port-assets.dto';
import { GetStatusCodeAssetsDTO } from './dto/get-status-code-assets.dto';
import { GetTechnologyAssetsDTO } from './dto/get-technology-assets.dto';
import { GetTlsResponseDto } from './dto/tls.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { Asset } from './entities/assets.entity';
import { HttpResponse } from './entities/http-response.entity';
import { AssetService } from './entities/asset-services.entity';

// Type cho raw database response từ TLS query
interface TlsRawData {
  host: string;
  sni: string;
  subject_dn: string;
  subject_an: string[];
  not_after: string;
  not_before: string;
  tls_connection: string;
}

// Type cho item từ raw query result
interface TlsRawQueryItem {
  tls: TlsRawData;
}

@Injectable()
export class AssetsService {
  constructor(
    @InjectRepository(Asset)
    public readonly assetRepo: Repository<Asset>,
    @InjectRepository(AssetService)
    public readonly assetServiceRepo: Repository<AssetService>,
    @InjectRepository(Target)
    public readonly targetRepo: Repository<Target>,
    private eventEmitter: EventEmitter2,
    private technologyForwarderService: TechnologyForwarderService,
    private workspaceService: WorkspacesService,

    private dataSource: DataSource,
  ) {}

  /**
   * Retrieves all assets services associated with a specified target.
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

  private buildBaseQuery(query: GetAssetsQueryDto, workspaceId: string) {
    const { targetIds, ipAddresses, ports, techs, statusCodes } = query;

    const whereBuilder = {
      targetIds: {
        value: targetIds,
        whereClause: `"asset"."targetId" = ANY(:param)`,
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
        whereClause: `"assetServices"."port" = ANY(:param)`,
      },
      statusCodes: {
        value: statusCodes,
        whereClause: `"statusCodeAssets"."statusCode" = ANY(:param)`,
      },
    };

    const queryBuilder = this.assetServiceRepo
      .createQueryBuilder('assetServices')
      .leftJoin('assetServices.asset', 'asset')
      .leftJoin('asset.target', 'targets')
      .leftJoin(
        'assetServices.httpResponses',
        'httpResponses',
        'httpResponses.createdAt = (SELECT MAX(hr."createdAt") FROM http_responses hr WHERE hr."assetServiceId" = assetServices.id)',
      )
      .leftJoin('targets.workspaceTargets', 'workspaceTargets')
      .leftJoin('asset.ipAssets', 'ipAssets')
      .leftJoin('assetServices.statusCodeAssets', 'statusCodeAssets')
      .where('"assetServices"."isErrorPage" = false')
      .where('"workspaceTargets"."workspaceId" = :workspaceId', {
        workspaceId,
      });

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
  public async getManyAsssets(
    query: GetAssetsQueryDto,
    workspaceId: string,
  ): Promise<GetManyBaseResponseDto<GetAssetsResponseDto>> {
    if (!(query.sortBy in Asset)) {
      query.sortBy = 'createdAt';
    }

    const offset = (query.page - 1) * query.limit;

    const queryBuilder = this.buildBaseQuery(query, workspaceId).select([
      'assetServices.value',
      'assetServices.port',
      'assetServices.id',
      'asset.isEnabled',
      'asset.targetId',
      'assetServices.createdAt',
      'ipAssets.ipAddress',
      'httpResponses.tech',
      'httpResponses.title',
      'httpResponses.tls',
      'httpResponses.chain_status_codes',
      'httpResponses.status_code',
    ]);

    if (query.value) {
      queryBuilder.andWhere('assetServices.value ILIKE :value', {
        value: `%${query.value}%`,
      });
    }

    const [list, total] = await queryBuilder
      .orderBy(`assetServices.${query.sortBy}`, query.sortOrder)
      .skip(offset)
      .take(query.limit)
      .getManyAndCount();

    const assets = list.map(async (item) => {
      const asset = new GetAssetsResponseDto();
      asset.id = item.id;
      asset.value = item.value;
      asset.targetId = item.asset.targetId;
      asset.createdAt = item.createdAt;
      asset.dnsRecords = item.asset.dnsRecords;
      asset.isEnabled = item.asset.isEnabled;

      // asset.tags = item.asset.tags || [];
      asset.ipAddresses = item.asset.ipAssets
        ? item.asset.ipAssets.map((e) => e.ipAddress)
        : [];

      if (item.httpResponses) {
        asset.httpResponses = item.httpResponses[0];
        if (asset.httpResponses?.tech) {
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
    const workspaceId =
      await this.workspaceService.getWorkspaceIdByTargetId(targetId);

    if (!workspaceId) {
      throw new NotFoundException('Workspace not found');
    }

    const workspaceConfigs =
      await this.workspaceService.getWorkspaceConfigValue(workspaceId);

    if (!workspaceConfigs.isAssetsDiscovery) {
      throw new BadRequestException(
        'Asset discovery is disabled for this workspace',
      );
    }

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
   * Retrieves a single asset by its ID.
   *
   * @param id - The ID of the asset to retrieve.
   * @returns A promise that resolves to the found asset.
   * @throws NotFoundException if the asset with the given ID is not found.
   */
  public async getAssetById(
    id: string,
    workspaceId: string,
  ): Promise<GetAssetsResponseDto> {
    const queryBuilder = this.buildBaseQuery(
      new GetAssetsQueryDto(),
      workspaceId,
    )
      .select([
        'assetServices.value',
        'assetServices.port',
        'assetServices.id',
        'asset.isEnabled',
        'asset.targetId',
        'assetServices.createdAt',
        'ipAssets.ipAddress',
        'httpResponses.tech',
        'httpResponses.title',
        'httpResponses.tls',
        'httpResponses.chain_status_codes',
        'httpResponses.status_code',
        'asset.targetId',
        'httpResponses.raw_header',
      ])
      .andWhere('assetServices.id = :id', { id });

    const item = await queryBuilder.getOneOrFail();

    const asset = new GetAssetsResponseDto();
    asset.id = item.id;
    asset.value = item.value;
    asset.targetId = item.asset.targetId;
    asset.createdAt = item.createdAt;
    asset.dnsRecords = item.asset.dnsRecords;
    asset.isEnabled = item.asset.isEnabled;
    asset.port = item.port;

    // asset.tags = item.asset.tags || [];

    asset.ipAddresses = item.asset.ipAssets
      ? item.asset.ipAssets.map((e) => e.ipAddress)
      : [];

    if (item.httpResponses) {
      asset.httpResponses = item.httpResponses[0];
      if (asset.httpResponses?.tech) {
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
        'COUNT(DISTINCT "asset"."id") as "assetCount"',
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
      .select([
        'assetServices.port as port',
        'COUNT(DISTINCT "asset"."id") as "assetCount"',
      ])
      .distinct(true)
      .groupBy('assetServices.port');

    if (query.value) {
      queryBuilder.andWhere('"assetServices".port::text ILIKE :value', {
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
            .select('"httpResponses"."assetServiceId"', 'assetId')
            .addSelect('unnest("httpResponses"."tech")', 'technology')
            .from(HttpResponse, 'httpResponses'),
        'sq',
        '"sq"."assetId" = "assetServices"."id"',
      )
      .select([
        '"sq"."technology"',
        'COUNT(DISTINCT "assetServices"."id") as "assetCount"',
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

    const enrichedTechs =
      await this.technologyForwarderService.enrichTechnologies(
        list.map(
          (item: { technology: string; assetCount: number }) => item.technology,
        ),
      );

    const data = list.map(
      (item: { technology: string; assetCount: number }) => {
        const obj = new GetTechnologyAssetsDTO();
        obj.assetCount = item.assetCount;

        const enrichedTech = enrichedTechs.find(
          (tech) => tech?.name === item.technology,
        );

        if (enrichedTech && enrichedTech.name) {
          obj.technology = enrichedTech;
        } else {
          // Create a minimal technology object with just the name when enrichment fails
          obj.technology = {
            name: item.technology,
            description: '',
            icon: '',
            website: '',
            iconUrl: '',
            categoryNames: [],
            categories: [],
          } as TechnologyDetailDTO;
        }

        return obj;
      },
    );

    // Use the database total since we want to show the actual count of distinct technologies
    // even if some have missing enrichment data
    const total = totalInDb?.count ?? 0;

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
        'COUNT(DISTINCT "assetServices"."id") as "assetCount"',
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

  /**
   * Toggle the enabled/disabled status of an asset
   *
   * @param assetId - The ID of the asset to toggle
   * @param isEnabled - The new enabled status
   * @returns A promise that resolves to the updated asset
   * @throws NotFoundException if the asset with the given ID is not found
   */
  /**
   * Retrieves TLS certificates expiring soonest (for warning notifications)
   * Returns top 10 certificates with earliest expiry dates
   */
  public async getManyTls(
    workspaceId: string,
  ): Promise<GetManyBaseResponseDto<GetTlsResponseDto>> {
    // Hard-coded pagination for notification purposes
    const page = 1;
    const limit = 10;

    // Query to get total count

    const totalResult = await this.dataSource
      .createQueryBuilder()
      .select('COUNT(DISTINCT("httpResponses"."tls"))', 'count')
      .from('http_responses', 'httpResponses')
      .innerJoin(
        'asset_services',
        'assetServices',
        '"httpResponses"."assetServiceId" = "assetServices"."id"',
      )
      .innerJoin(
        'assets',
        'assets',
        '"assetServices"."assetId" = "assets"."id"',
      )
      .innerJoin('targets', 'targets', '"assets"."targetId" = "targets"."id"')
      .innerJoin(
        'workspace_targets',
        'workspaceTargets',
        '"targets"."id" = "workspaceTargets"."targetId"',
      )
      .where('"httpResponses"."tls" IS NOT NULL')
      .andWhere('"workspaceTargets"."workspaceId" = :workspaceId', {
        workspaceId,
      })
      .getRawOne<{ count: number }>();

    // Main query ordered by expiry date (earliest first)

    const queryResult = await this.dataSource
      .createQueryBuilder()
      .select(['"httpResponses"."tls"'])
      .from('http_responses', 'httpResponses')
      .innerJoin(
        'asset_services',
        'assetServices',
        '"httpResponses"."assetServiceId" = "assetServices"."id"',
      )
      .innerJoin(
        'assets',
        'assets',
        '"assetServices"."assetId" = "assets"."id"',
      )
      .innerJoin('targets', 'targets', '"assets"."targetId" = "targets"."id"')
      .innerJoin(
        'workspace_targets',
        'workspaceTargets',
        '"targets"."id" = "workspaceTargets"."targetId"',
      )
      .where('"httpResponses"."tls" IS NOT NULL')
      .andWhere('"workspaceTargets"."workspaceId" = :workspaceId', {
        workspaceId,
      })
      .groupBy('"httpResponses"."tls"')
      .orderBy('("httpResponses"."tls"->>\'not_after\')::timestamp', 'ASC')
      .limit(limit)
      .getRawMany<TlsRawQueryItem>();

    const data = queryResult.map((item): GetTlsResponseDto => {
      const obj = new GetTlsResponseDto();

      if (item.tls) {
        obj.host = item.tls.host;
        obj.sni = item.tls.sni;
        obj.subject_dn = item.tls.subject_dn;
        obj.subject_an = item.tls.subject_an;
        obj.not_after = item.tls.not_after;
        obj.not_before = item.tls.not_before;
        obj.tls_connection = item.tls.tls_connection;
      }
      return obj;
    });

    // Create query object with proper typing
    const queryObj = {
      page,
      limit,
      sortBy: 'not_after',
      sortOrder: SortOrder.ASC,
    };

    return getManyResponse({
      query: queryObj,
      data,
      total: totalResult?.count ?? 0,
    });
  }

  public async switchAsset(
    assetId: string,
    isEnabled: boolean,
  ): Promise<Asset> {
    const asset = await this.assetRepo.findOne({
      where: { id: assetId },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    // Update the asset's enabled status
    asset.isEnabled = isEnabled;

    // Save and return the updated asset
    return this.assetRepo.save(asset);
  }
}
