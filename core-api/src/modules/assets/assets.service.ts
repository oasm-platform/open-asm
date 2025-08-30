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
import { GetAssetsQueryDto, GetAssetsResponseDto } from './dto/assets.dto';
import { GetFacetedDataDTO } from './dto/get-faceted-data.dto';
import { GetIpAssetsDTO } from './dto/get-ip-assets.dto';
import { GetPortAssetsDTO } from './dto/get-port-assets.dto';
import { GetStatusCodeAssetsDTO } from './dto/get-status-code-assets.dto';
import { GetTechnologyAssetsDTO } from './dto/get-technology-assets.dto';
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

  private buildBaseQuery(query: GetAssetsQueryDto) {
    const { targetIds, workspaceId, ipAddresses, ports, techs, statusCodes } =
      query;

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
      .innerJoin('assets.httpResponses', 'httpResponses')
      .innerJoin('assets.ports', 'ports')
      .leftJoin('assets.target', 'targets')
      .leftJoin('targets.workspaceTargets', 'workspaceTargets')
      .innerJoin(
        'ip_assets_view',
        'ipAssets',
        '"ipAssets"."assetId" = assets."id"',
      )
      .innerJoin(
        'status_code_assets_view',
        'statusCodeAssets',
        '"statusCodeAssets"."assetId" = assets."id"',
      )
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
    assetId?: string,
  ): Promise<GetManyBaseResponseDto<GetAssetsResponseDto>> {
    if (!(query.sortBy in Asset)) {
      query.sortBy = 'createdAt';
    }

    const offset = (query.page - 1) * query.limit;

    const queryBuilder = this.buildBaseQuery(query).select([
      'assets',
      'httpResponses',
      'ports',
      'targets',
    ]);

    if (assetId && assetId.length > 0) {
      queryBuilder.andWhere('assets.id = :assetId', { assetId });
    } else {
      queryBuilder.andWhere('"assets"."value" ILIKE :value', {
        value: `%${query.value}%`,
      });
    }

    const [list, total] = await queryBuilder
      .orderBy(`assets.${query.sortBy}`, query.sortOrder)
      .skip(offset)
      .take(query.limit)
      .getManyAndCount();

    const assets = list.map((item) => {
      const asset = new GetAssetsResponseDto();
      asset.id = item.id;
      asset.value = item.value;
      asset.targetId = item.target.id;
      asset.isPrimary = item.isPrimary;
      asset.createdAt = item.createdAt;
      asset.updatedAt = item.updatedAt;
      asset.dnsRecords = item.dnsRecords;
      asset.isErrorPage = item.isErrorPage;
      asset.httpResponses = item.httpResponses
        ? item.httpResponses[0]
        : undefined;
      asset.ports = item.ports ? item.ports[0] : undefined;
      return asset;
    });

    return getManyResponse({ query, data: assets, total });
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
    const asset = await this.getAssetsInWorkspace(new GetAssetsQueryDto(), id);
    return asset.data[0];
  }

  /**
   * Retrieves a list of IP with number of asset
   *
   * @returns A promise that resolves to the list of ip.
   *
   */
  public async getIpAssets(
    query: GetAssetsQueryDto,
  ): Promise<GetManyBaseResponseDto<GetIpAssetsDTO>> {
    const offset = (query.page - 1) * query.limit;
    if (!(query.sortBy in GetIpAssetsDTO)) {
      query.sortBy = '"assetCount"';
    }

    const queryBuilder = this.buildBaseQuery(query)
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
  ): Promise<GetManyBaseResponseDto<GetPortAssetsDTO>> {
    const offset = (query.page - 1) * query.limit;
    if (!(query.sortBy in GetIpAssetsDTO)) {
      query.sortBy = '"assetCount"';
    }

    const queryBuilder = this.buildBaseQuery(query)
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
  ): Promise<GetManyBaseResponseDto<GetTechnologyAssetsDTO>> {
    const offset = (query.page - 1) * query.limit;
    if (!(query.sortBy in GetIpAssetsDTO)) {
      query.sortBy = '"assetCount"';
    }

    const queryBuilder = this.buildBaseQuery(query)
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
      .andWhere('"sq"."technology" ILIKE :value', {
        value: `%${query.value}%`,
      })
      .distinct(true)
      .groupBy('"sq"."technology"');

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

    const data = list.map((item: GetTechnologyAssetsDTO) => {
      const obj = new GetTechnologyAssetsDTO();
      obj.technology = item.technology;
      obj.assetCount = item.assetCount;
      return obj;
    });

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
  ): Promise<GetManyBaseResponseDto<GetStatusCodeAssetsDTO>> {
    const offset = (query.page - 1) * query.limit;
    if (!(query.sortBy in GetIpAssetsDTO)) {
      query.sortBy = '"assetCount"';
    }

    const queryBuilder = this.buildBaseQuery(query)
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
   * Retrieves faceted data to display for faceted filter
   *
   * @returns A promise that resolves to faceted data.
   *
   */
  public async getFacetedData(
    query: GetAssetsQueryDto,
  ): Promise<GetFacetedDataDTO> {
    const facetedQuery = new GetAssetsQueryDto();
    facetedQuery.workspaceId = query.workspaceId;
    facetedQuery.targetIds = query.targetIds;

    const ipsQb = this.buildBaseQuery(facetedQuery)
      .select(['"ipAssets"."ip"'])
      .andWhere('"ipAssets"."ip" IS NOT NULL')
      .distinct(true);

    const portsQb = this.buildBaseQuery(query)
      .leftJoin(
        (subQuery) =>
          subQuery
            .select('"ports"."assetId"', 'assetId')
            .addSelect('unnest("ports"."ports")', 'port')
            .from(Port, 'ports'),
        'sq',
        '"sq"."assetId" = "assets"."id"',
      )
      .select(['"sq"."port"'])
      .andWhere('"sq"."port" IS NOT NULL')
      .distinct(true);

    const techsQb = this.buildBaseQuery(query)
      .leftJoin(
        (subQuery) =>
          subQuery
            .select('"httpResponses"."assetId"', 'assetId')
            .addSelect('unnest("httpResponses"."tech")', 'technology')
            .from(HttpResponse, 'httpResponses'),
        'sq',
        '"sq"."assetId" = "assets"."id"',
      )
      .select(['"sq"."technology"'])
      .andWhere('"sq"."technology" IS NOT NULL')
      .distinct(true);

    const statusCodeQb = this.buildBaseQuery(facetedQuery)
      .select(['"statusCodeAssets"."statusCode"'])
      .andWhere('"statusCodeAssets"."statusCode" IS NOT NULL')
      .distinct(true);

    const ipAddresses = await ipsQb.getRawMany();
    const ports = await portsQb.getRawMany();
    const techs = await techsQb.getRawMany();
    const statusCodes = await statusCodeQb.getRawMany();

    const result = new GetFacetedDataDTO();
    result.techs = techs.map((e: { technology: string }) => e.technology);
    result.ipAddresses = ipAddresses.map((e: { ip: string }) => e.ip);
    result.ports = ports.map((e: { port: string }) => e.port);
    result.statusCodes = statusCodes.map(
      (e: { statusCode: string }) => e.statusCode,
    );

    return result;
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
}
