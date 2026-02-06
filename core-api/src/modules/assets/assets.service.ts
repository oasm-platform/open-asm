import { STORAGE_BASE_PATH } from '@/common/constants/app.constants';
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
import { GetHostAssetsDTO } from './dto/get-host-assets.dto';
import { GetIpAssetsDTO } from './dto/get-ip-assets.dto';
import { GetPortAssetsDTO } from './dto/get-port-assets.dto';
import { GetStatusCodeAssetsDTO } from './dto/get-status-code-assets.dto';
import { GetTechnologyAssetsDTO } from './dto/get-technology-assets.dto';
import { GetTlsResponseDto } from './dto/tls.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { AssetService } from './entities/asset-services.entity';
import { AssetTag } from './entities/asset-tags.entity';
import { Asset } from './entities/assets.entity';

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
    const { targetIds, hosts, ipAddresses, ports, techs, statusCodes } = query;

    const whereBuilder = {
      targetIds: {
        value: targetIds,
        whereClause: `"asset"."targetId" = ANY(:param)`,
      },
      techs: {
        value: techs,
        whereClause: `latest_http_response.tech && :param`,
      },
      hosts: {
        value: hosts,
        whereClause: `asset.value = ANY(:param)`,
      },
      ipAddresses: {
        value: ipAddresses,
        whereClause: '"ipAssets"."ip" = ANY(:param)',
      },
      ports: {
        value: ports,
        whereClause: `asset_service.port = ANY(:param)`,
      },
      statusCodes: {
        value: statusCodes,
        whereClause: `"statusCodeAssets"."statusCode" = ANY(:param)`,
      },
    };

    const queryBuilder = this.assetServiceRepo
      .createQueryBuilder('asset_service')
      .leftJoin('asset_service.asset', 'asset')
      .leftJoin('asset.target', 'targets')
      .leftJoinAndSelect(
        'asset_service.httpResponses',
        'latest_http_response',
        'latest_http_response.id = (SELECT hr.id FROM http_responses hr WHERE hr."assetServiceId" = asset_service.id ORDER BY hr."createdAt" DESC LIMIT 1)',
      )
      .leftJoin('targets.workspaceTargets', 'workspaceTargets')
      .leftJoin('asset.ipAssets', 'ipAssets')
      .leftJoin('asset_service.statusCodeAssets', 'statusCodeAssets')
      .where('asset_service."isErrorPage" = false')
      .andWhere('"workspaceTargets"."workspaceId" = :workspaceId', {
        workspaceId,
      })
      .andWhere('"statusCodeAssets"."statusCode" IS NOT NULL')
      .andWhere('"statusCodeAssets"."statusCode" != 0');

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
  public async getManyAsssetServices(
    query: GetAssetsQueryDto,
    workspaceId: string,
  ): Promise<GetManyBaseResponseDto<GetAssetsResponseDto>> {
    if (!(query.sortBy in Asset)) {
      query.sortBy = 'createdAt';
    }

    const offset = (query.page - 1) * query.limit;

    const queryBuilder = this.buildBaseQuery(query, workspaceId);

    if (query.value) {
      queryBuilder.andWhere('asset_service.value ILIKE :value', {
        value: `%${query.value}%`,
      });
    }

    const [list, total] = await queryBuilder
      .orderBy(`asset_service.${query.sortBy}`, query.sortOrder)
      .skip(offset)
      .take(query.limit)
      .getManyAndCount();

    const assets = list.map(async (item) => {
      const asset = new GetAssetsResponseDto();
      asset.id = item.id;
      asset.value = item.value;
      asset.targetId = item.asset?.targetId;
      asset.createdAt = item.createdAt;
      asset.dnsRecords = item.asset?.dnsRecords;
      asset.isEnabled = item.asset?.isEnabled;
      asset.screenshotPath =
        item.screenshotPath && `${STORAGE_BASE_PATH}/${item.screenshotPath}`;

      // asset.tags = item.asset.tags || [];
      asset.ipAddresses = item.asset?.ipAssets
        ? item.asset.ipAssets.map((e) => e.ipAddress)
        : [];

      if (item.httpResponses && item.httpResponses.length > 0) {
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
    // Check if asset already exists
    const existingAsset = await this.assetRepo.findOne({
      where: {
        value,
        target: { id: target.id },
      },
    });

    if (existingAsset) {
      return existingAsset;
    }

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

    this.eventEmitter.emit('target.re-scan', target);

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
      .andWhere('"statusCodeAssets"."statusCode" != 0')
      .andWhere('asset_service.id = :id', { id });

    const item = await queryBuilder.getOneOrFail();

    const asset = new GetAssetsResponseDto();
    asset.id = item.id;
    asset.value = item.value;
    asset.targetId = item.asset?.targetId;
    asset.createdAt = item.createdAt;
    asset.dnsRecords = item.asset?.dnsRecords;
    asset.isEnabled = item.asset?.isEnabled;
    asset.port = item.port;
    asset.screenshotPath = `${STORAGE_BASE_PATH}/${item.screenshotPath}`;

    // Load tags separately - tags belong to AssetService, not Asset
    const tagsResult = await this.dataSource
      .createQueryBuilder()
      .select(['tag', 'id'])
      .from('asset_services_tags', 'asset_services_tags')
      .where('"assetServiceId" = :assetServiceId', { assetServiceId: item.id })
      .getRawMany<{ tag: string; id: string }>();

    asset.tags = tagsResult.map(
      (t) => ({ id: t.id, tag: t.tag }) as Partial<AssetTag>,
    ) as AssetTag[];

    asset.ipAddresses = item.asset?.ipAssets
      ? item.asset.ipAssets.map((e) => e.ipAddress)
      : [];

    if (item.httpResponses && item.httpResponses.length > 0) {
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
        'COUNT(DISTINCT asset_service.id) as "assetCount"',
      ])
      .andWhere('"ipAssets"."ip" IS NOT NULL')
      .groupBy('"ipAssets"."ip"');

    if (query.value) {
      queryBuilder.andWhere('"ipAssets"."ip"::text ILIKE :value', {
        value: `%${query.value}%`,
      });
    }

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
   * Retrieves a list of IP with number of asset
   *
   * @returns A promise that resolves to the list of ip.
   *
   */
  public async getHostAssets(
    query: GetAssetsQueryDto,
    workspaceId: string,
  ): Promise<GetManyBaseResponseDto<GetHostAssetsDTO>> {
    const offset = (query.page - 1) * query.limit;
    if (!(query.sortBy in GetHostAssetsDTO)) {
      query.sortBy = '"assetCount"';
    }

    const queryBuilder = this.buildBaseQuery(query, workspaceId)
      .select([
        'asset.value',
        'COUNT(DISTINCT asset_service.id) as "assetCount"',
      ])
      .andWhere('asset.value IS NOT NULL')
      .groupBy('asset.value');

    if (query.value) {
      queryBuilder.andWhere('asset.value::text ILIKE :value', {
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

    const data = list.map(
      (item: { asset_value: string; assetCount: number }) => {
        const obj = new GetHostAssetsDTO();
        obj.host = item.asset_value;
        obj.assetCount = item.assetCount;
        return obj;
      },
    );

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
        'asset_service.port as port',
        'COUNT(DISTINCT asset_service.id) as "assetCount"',
      ])
      .groupBy('asset_service.port');

    if (query.value) {
      queryBuilder.andWhere('asset_service.port::text ILIKE :value', {
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
    if (!(query.sortBy in GetTechnologyAssetsDTO)) {
      query.sortBy = '"assetCount"';
    }

    const queryBuilder = this.buildBaseQuery(query, workspaceId)
      .leftJoin(
        '(SELECT 1)',
        'dummy',
        'TRUE CROSS JOIN LATERAL unnest("latest_http_response"."tech") AS unnested_tech',
      )
      .select([
        'unnested_tech as "technology"',
        'COUNT(DISTINCT asset_service.id) as "assetCount"',
      ])
      .andWhere('latest_http_response.tech IS NOT NULL')
      .groupBy('unnested_tech');

    if (query.value) {
      queryBuilder.andWhere('unnested_tech ILIKE :value', {
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

    // Extract just the technology names (without version) for enrichment
    const techNames = list.map(
      (item: { technology: string; assetCount: number }) =>
        item.technology.split(':')[0],
    );

    const enrichedTechs =
      await this.technologyForwarderService.enrichTechnologies(techNames);

    const data = list.map(
      (item: { technology: string; assetCount: number }) => {
        const [name, version] = item.technology.split(':');
        const obj = new GetTechnologyAssetsDTO();
        obj.assetCount = item.assetCount;

        const enrichedTech = enrichedTechs.find((tech) => tech?.name === name);
        if (enrichedTech && enrichedTech.name) {
          obj.technology = { ...enrichedTech, version };
        } else {
          // Create a minimal technology object with just the name when enrichment fails
          obj.technology = {
            name: name,
            description: '',
            icon: '',
            website: '',
            iconUrl: '',
            categoryNames: [],
            categories: [],
            version,
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
        'COUNT(DISTINCT asset_service.id) as "assetCount"',
      ])
      .groupBy('"statusCodeAssets"."statusCode"');

    if (query.value) {
      queryBuilder.andWhere(
        '"statusCodeAssets"."statusCode"::text ILIKE :value',
        {
          value: `%${query.value}%`,
        },
      );
    }

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
   * @param workspaceId - The workspace ID to ensure the asset belongs to the user's workspace.
   * @returns A promise that resolves to the updated asset.
   * @throws NotFoundException if the asset with the given ID is not found.
   */
  public async updateAssetById(
    id: string,
    updateAssetDto: UpdateAssetDto,
    workspaceId: string,
  ): Promise<Asset> {
    // ID is actually AssetService ID, not Asset ID (matching getAssetById)
    const assetService = await this.assetServiceRepo
      .createQueryBuilder('assetService')
      .leftJoinAndSelect('assetService.asset', 'asset')
      .innerJoin('asset.target', 'target')
      .innerJoin('target.workspaceTargets', 'workspaceTargets')
      .where('assetService.id = :id', { id })
      .andWhere('workspaceTargets.workspaceId = :workspaceId', { workspaceId })
      .getOne();

    if (!assetService) {
      throw new NotFoundException('Asset service not found');
    }

    // Update tags - tags belong to AssetService
    if (updateAssetDto.tags) {
      // Remove existing tags
      await this.dataSource
        .createQueryBuilder()
        .delete()
        .from('asset_services_tags')
        .where('"assetServiceId" = :assetServiceId', {
          assetServiceId: id, // Use the ID directly since it's AssetService ID
        })
        .execute();

      // Add new tags
      const tagsToInsert = updateAssetDto.tags.map((tag) => ({
        tag,
        assetServiceId: id, // Use the ID directly
      }));

      if (tagsToInsert.length > 0) {
        await this.dataSource
          .createQueryBuilder()
          .insert()
          .into('asset_services_tags')
          .values(tagsToInsert)
          .execute();
      }
    }

    // Return the asset (not assetService)
    return assetService.asset;
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
   * Returns top 10 certificates with earliest expiry dates within ±30 days from now
   */
  public async getManyTls(
    workspaceId: string,
  ): Promise<GetManyBaseResponseDto<GetTlsResponseDto>> {
    // Hard-coded pagination for notification purposes
    const page = 1;
    const limit = 10;

    // Calculate date range: 30 days before and 30 days after current date
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    const thirtyDaysFromNow = new Date(now);
    thirtyDaysFromNow.setDate(now.getDate() + 30);

    // Query to get total count with date range filter
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
      .andWhere(
        '("httpResponses"."tls"->>\'not_after\')::timestamp BETWEEN :thirtyDaysAgo AND :thirtyDaysFromNow',
        { thirtyDaysAgo, thirtyDaysFromNow },
      )
      .getRawOne<{ count: number }>();

    // Main query ordered by expiry date (earliest first) with date range filter
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
      .andWhere(
        '("httpResponses"."tls"->>\'not_after\')::timestamp BETWEEN :thirtyDaysAgo AND :thirtyDaysFromNow',
        { thirtyDaysAgo, thirtyDaysFromNow },
      )
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

  public async exportServicesForCSV(workspaceId: string): Promise<
    {
      value: string;
      ports: number[];
      techs: string[];
      tls: {
        host?: string;
        sni?: string;
        subject_dn?: string;
        not_after?: string;
        not_before?: string;
        tls_connection?: string;
      } | null;
    }[]
  > {
    const queryBuilder = this.buildBaseQuery(
      new GetAssetsQueryDto(),
      workspaceId,
    ).select([
      'asset_service.value',
      'asset_service.port',
      'latest_http_response.tech',
      'latest_http_response.tls',
    ]);

    const services = await queryBuilder.getMany();

    return services.map((service) => {
      return {
        value: service.value,
        ports: service.port ? [service.port] : [],
        techs: service.httpResponses?.[0]?.tech || [],
        tls: service.httpResponses?.[0]?.tls || null,
      };
    });
  }
}
