import { STORAGE_BASE_PATH } from '@/common/constants/app.constants';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { GetManyBaseResponseDto } from '@/common/dtos/get-many-base.dto';
import * as fs from 'fs';
import * as path from 'path';
import * as Mustache from 'mustache';
import { WorkspaceEncryptionService } from '@/services/workspace-encryption/workspace-encryption.service';
import { GeoIpService } from '@/services/geo-ip/geo-ip.service';
import { getManyResponse } from '@/utils/getManyResponse';
import { generateText } from 'ai';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { AgentLLMConfig } from '../agents/entities/agent-llm-config.entity';
import { LLMProvider } from '../agents/enums/agent.enums';
import {
  getLLMProviderConfig,
} from '../agents/llm-provider-supported';
import { Target } from '../targets/entities/target.entity';

import { TechnologyForwarderService } from '../technology/technology-forwarder.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { GetAssetsQueryDto, GetAssetsResponseDto } from './dto/assets.dto';
import { GetHostAssetsDTO } from './dto/get-host-assets.dto';
import { GetIpAssetsDTO } from './dto/get-ip-assets.dto';
import { GetPortAssetsDTO } from './dto/get-port-assets.dto';
import { GetStatusCodeAssetsDTO } from './dto/get-status-code-assets.dto';
import { GetTechnologyAssetsDTO } from './dto/get-technology-assets.dto';
import { GetTlsQueryDto, GetTlsResponseDto } from './dto/tls.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { AssetService } from './entities/asset-services.entity';
import { AssetTag } from './entities/asset-tags.entity';
import { Asset } from './entities/assets.entity';
import { TlsAssetsView } from './entities/tls-assets.entity';

// Type cho raw database response từ TLS query
// interface TlsRawData {
//   host: string;
//   sni: string;
//   subject_dn: string;
//   subject_an: string[];
//   not_after: string;
//   not_before: string;
//   tls_connection: string;
// }

// Type cho item từ raw query result
// interface TlsRawQueryItem {
//   tls: TlsRawData;
// }

@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);
  private readonly prompts = new Map<string, string>();

  constructor(
    @InjectRepository(Asset)
    public readonly assetRepo: Repository<Asset>,
    @InjectRepository(AssetService)
    public readonly assetServiceRepo: Repository<AssetService>,
    @InjectRepository(Target)
    public readonly targetRepo: Repository<Target>,
    @InjectRepository(TlsAssetsView)
    public readonly tlsAssetsViewRepo: Repository<TlsAssetsView>,
    @InjectRepository(AgentLLMConfig)
    private readonly llmConfigRepository: Repository<AgentLLMConfig>,
    private eventEmitter: EventEmitter2,
    private technologyForwarderService: TechnologyForwarderService,
    private workspaceService: WorkspacesService,
    private workspaceEncryption: WorkspaceEncryptionService,
    private geoIpService: GeoIpService,
    private dataSource: DataSource,
  ) {
    this.loadPrompts();
  }

  private loadPrompts(): void {
    const promptsDir = path.join(__dirname, '../agents/prompts');
    try {
      const entries = fs.readdirSync(promptsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.endsWith('.md')) {
          const key = entry.name.toLowerCase();
          const content = fs.readFileSync(
            path.join(promptsDir, entry.name),
            'utf-8',
          );
          this.prompts.set(key, content);
        }
      }
    } catch (error) {
      this.logger.error('Failed to load prompts directory', error);
    }
  }

  private getPrompt(fileName: string, data?: Record<string, unknown>): string {
    const key = fileName.toLowerCase();
    const template = this.prompts.get(key) ?? '';
    if (!template) {
      this.logger.warn(`Prompt not found: ${fileName}`);
    }
    if (data) {
      return Mustache.render(template, data);
    }
    return template;
  }

  private async generateTagsWithAI(
    serviceData: string,
    workspaceId: string,
  ): Promise<string[]> {
    const llmConfig = await this.llmConfigRepository.findOne({
      where: { workspaceId, isPreferred: true },
    });

    if (!llmConfig) {
      throw new BadRequestException(
        'No preferred LLM config found. Please create and set a preferred LLM config first.',
      );
    }

    const providerConfig = getLLMProviderConfig(llmConfig.provider);
    if (!providerConfig) {
      throw new BadRequestException(
        `Unsupported LLM provider: ${String(llmConfig.provider)}`,
      );
    }

    const apiKey = llmConfig.apiKey
      ? await this.workspaceEncryption.decrypt(workspaceId, llmConfig.apiKey)
      : '';
    const baseURL =
      llmConfig.provider === LLMProvider.CUSTOM
        ? llmConfig.apiUrl
        : undefined;
    const model = providerConfig.handler(apiKey, llmConfig.model, baseURL);

    const prompt = this.getPrompt('GENERATE_SERVICE_TAGS.md', {
      SERVICE_DATA: serviceData,
    });

    const result = await generateText({
      model,
      messages: [{ role: 'user', content: prompt }],
    });

    let textContent = '';
    if (typeof result.content === 'string') {
      textContent = result.content;
    } else if (Array.isArray(result.content)) {
      const textPart = result.content.find((part) => part.type === 'text');
      textContent = textPart?.type === 'text' ? textPart.text : '';
    }

    this.logger.log(`AI response: ${textContent.slice(0, 500)}`);

    const jsonMatch = textContent.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
      this.logger.warn(
        `Failed to parse tags from AI response: ${textContent.slice(0, 200)}`,
      );
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is string => typeof item === 'string')
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag.length > 0 && tag.length <= 100);
  }

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
    const {
      targetIds,
      hosts,
      ipAddresses,
      ports,
      techs,
      statusCodes,
      tlsHosts,
    } = query;

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
      tlsHosts: {
        value: tlsHosts,
        whereClause: `"tlsAssets"."host" = ANY(:param)`,
      },
    };

    const queryBuilder = this.assetServiceRepo
      .createQueryBuilder('asset_service')
      .leftJoinAndSelect('asset_service.asset', 'asset')
      .leftJoin('asset.target', 'targets')
      .leftJoinAndSelect(
        'asset_service.httpResponses',
        'latest_http_response',
        'latest_http_response.id = (SELECT hr.id FROM http_responses hr WHERE hr."assetServiceId" = asset_service.id ORDER BY hr."createdAt" DESC LIMIT 1)',
      )
      .leftJoinAndSelect('asset.ipAssets', 'ipAssets')
      .leftJoin('asset_service.statusCodeAssets', 'statusCodeAssets')
      .leftJoin('asset_service.tlsAssets', 'tlsAssets')
      .where('targets.workspaceId = :workspaceId', {
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

    if (query.startDate) {
      queryBuilder.andWhere('asset_service."createdAt" >= :startDate', {
        startDate: query.startDate,
      });
    }

    if (query.endDate) {
      queryBuilder.andWhere('asset_service."createdAt" <= :endDate', {
        endDate: `${query.endDate} 23:59:59.999`,
      });
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
    const assetServiceColumns = this.assetServiceRepo.metadata.columns.map(
      (col) => col.propertyName,
    );
    // Allow sorting by 'isEnabled' from the related asset table
    if (!assetServiceColumns.includes(query.sortBy) && query.sortBy !== 'isEnabled') {
      query.sortBy = 'createdAt';
    }

    const offset = (query.page - 1) * query.limit;

    const queryBuilder = this.buildBaseQuery(query, workspaceId);

    if (query.value) {
      queryBuilder.andWhere('asset_service.value ILIKE :value', {
        value: `%${query.value}%`,
      });
    }

    const sortColumn =
      query.sortBy === 'isEnabled'
        ? `asset.${query.sortBy}`
        : `asset_service.${query.sortBy}`;

    const [list, total] = await queryBuilder
      .orderBy(sortColumn, query.sortOrder)
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
              website: e.website,
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

    if (!target) {
      throw new NotFoundException('Target not found');
    }
    const reScanCount = target.reScanCount + 1;
    await this.targetRepo.update(targetId, {
      reScanCount,
      lastDiscoveredAt: new Date(),
    });

    this.eventEmitter.emit('target.domain.re-scan', target);

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
    ).andWhere('asset_service.id = :id', { id });

    const item = await queryBuilder.getOneOrFail();

    const asset = new GetAssetsResponseDto();
    asset.id = item.id;
    asset.value = item.value;
    asset.targetId = item.asset?.targetId;
    asset.createdAt = item.createdAt;
    asset.dnsRecords = item.asset?.dnsRecords;
    asset.isEnabled = item.asset?.isEnabled;
    asset.port = item.port;
    asset.screenshotPath = item.screenshotPath
      ? `${STORAGE_BASE_PATH}/${item.screenshotPath}`
      : null;

    // Load tags separately - tags belong to AssetService, not Asset
    const tagsResult = await this.dataSource
      .createQueryBuilder()
      .select(['tag', 'id'])
      .from('asset_services_tags', 'asset_services_tags')
      .where('"assetServiceId" = :assetServiceId', { assetServiceId: item.id })
      .getRawMany<{ tag: string; id: string }>();

    asset.tags = tagsResult.map(
      (t) => ({ id: t.id, tag: t.tag }),
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

    const ips = list.map((item: { ip: string }) => item.ip);
    const geoIps = ips.length > 0 ? await this.geoIpService.getGeoIp(ips) : [];
    const geoIpMap = new Map(geoIps.map((geoIp) => [geoIp.query, geoIp]));

    const data = list.map((item: { ip: string; assetCount: number }) => {
      const obj = new GetIpAssetsDTO();
      obj.ip = item.ip;
      obj.assetCount = item.assetCount;
      obj.geoIp = geoIpMap.get(item.ip) ?? null;
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

    // Map DTO property names to raw SQL column aliases
    const sortColumnMap: Record<string, string> = {
      host: 'asset_value',
      assetCount: '"assetCount"',
      isEnabled: 'asset.isEnabled',
    };
    query.sortBy = sortColumnMap[query.sortBy] ?? '"assetCount"';

    const queryBuilder = this.buildBaseQuery(query, workspaceId)
      .select([
        'asset.id',
        'asset.value',
        'asset.targetId',
        'asset.isEnabled',
        'COUNT(DISTINCT asset_service.id) as "assetCount"',
      ])
      .andWhere('asset.value IS NOT NULL')
      .groupBy('asset.id');

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
      (item: {
        asset_id: string;
        asset_value: string;
        asset_targetId: string;
        asset_isEnabled: boolean;
        assetCount: number;
      }) => {
        const obj = new GetHostAssetsDTO();
        obj.id = item.asset_id;
        obj.host = item.asset_value;
        obj.targetId = item.asset_targetId;
        obj.isEnabled = item.asset_isEnabled;
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
          };
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
      .groupBy('"statusCodeAssets"."statusCode"')
      .andWhere('"statusCodeAssets"."statusCode" IS NOT NULL')
      .andWhere('"statusCodeAssets"."statusCode" != 0');

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
      .where('assetService.id = :id', { id })
      .andWhere('target.workspaceId = :workspaceId', { workspaceId })
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
   * Retrieves a paginated list of TLS certificates.
   * Built on top of buildBaseQuery so workspace isolation, and all other
   * filters (targetIds, hosts, …) come for free via the tlsAssets left-join
   * that is already wired into the base query.
   */
  public async getManyTls(
    query: GetTlsQueryDto,
    workspaceId: string,
  ): Promise<GetManyBaseResponseDto<GetTlsResponseDto>> {
    const allowedSortColumns = [
      'host',
      'sni',
      'not_after',
      'not_before',
      'subject_dn',
      'tls_version',
    ];
    if (!allowedSortColumns.includes(query.sortBy)) {
      query.sortBy = 'not_after';
    }

    const offset = (query.page - 1) * query.limit;

    // Re-use the base query (workspace isolation + all standard filters).
    // Cast to GetAssetsQueryDto so we can forward targetIds / hosts filters.
    const baseQuery: GetAssetsQueryDto = { ...query, tlsHosts: query.hosts };
    const qb = this.buildBaseQuery(baseQuery, workspaceId).select([
      '"tlsAssets"."host"              AS host',
      '"tlsAssets"."sni"               AS sni',
      '"tlsAssets"."subject_dn"        AS subject_dn',
      '"tlsAssets"."subject_cn"        AS subject_cn',
      '"tlsAssets"."issuer_dn"         AS issuer_dn',
      '"tlsAssets"."not_before"        AS not_before',
      '"tlsAssets"."not_after"         AS not_after',
      '"tlsAssets"."tls_version"       AS tls_version',
      '"tlsAssets"."cipher"            AS cipher',
      '"tlsAssets"."tls_connection"    AS tls_connection',
      '"tlsAssets"."subject_an"        AS subject_an',
    ]);

    // Only rows that actually have TLS data
    qb.andWhere('"tlsAssets"."host" IS NOT NULL');

    // Deduplicate: same TLS cert can be joined via multiple asset_service rows
    // (e.g. same host on different ports). Group by all TLS columns so each
    // distinct certificate appears only once.
    qb.groupBy('"tlsAssets"."host"')
      .addGroupBy('"tlsAssets"."sni"')
      .addGroupBy('"tlsAssets"."subject_dn"')
      .addGroupBy('"tlsAssets"."subject_cn"')
      .addGroupBy('"tlsAssets"."issuer_dn"')
      .addGroupBy('"tlsAssets"."not_before"')
      .addGroupBy('"tlsAssets"."not_after"')
      .addGroupBy('"tlsAssets"."tls_version"')
      .addGroupBy('"tlsAssets"."cipher"')
      .addGroupBy('"tlsAssets"."tls_connection"')
      .addGroupBy('"tlsAssets"."subject_an"');

    // Text search on host
    if (query.search) {
      qb.andWhere('"tlsAssets"."host" ILIKE :tlsSearch', {
        tlsSearch: `%${query.search}%`,
      });
    }

    // Faceted host filter (query.hosts maps to tlsHosts in buildBaseQuery
    // via the whereBuilder, but GetTlsQueryDto uses `hosts` directly)
    if (query.hosts && query.hosts.length > 0) {
      qb.andWhere('"tlsAssets"."host" = ANY(:tlsHostFilter)', {
        tlsHostFilter: query.hosts,
      });
    }

    // Date filtering on not_after field
    if (query.startDate) {
      qb.andWhere('"tlsAssets"."not_after"::timestamp >= :startDate', {
        startDate: query.startDate,
      });
    }
    if (query.endDate) {
      qb.andWhere('"tlsAssets"."not_after"::timestamp <= :endDate', {
        endDate: `${query.endDate} 23:59:59.999`,
      });
    }

    const totalResult = await this.dataSource
      .createQueryBuilder()
      .select('COUNT(*)')
      .from('(' + qb.getQuery() + ')', 'cnt_sub')
      .setParameters(qb.getParameters())
      .getRawOne<{ count: string }>();
    const total = Number(totalResult?.count ?? 0);

    type TlsRaw = {
      host: string;
      sni: string;
      subject_dn: string;
      subject_cn: string;
      issuer_dn: string;
      not_before: string;
      not_after: string;
      tls_version: string;
      cipher: string;
      tls_connection: string;
      subject_an: string;
    };

    const list = await qb
      .orderBy(`"tlsAssets"."${query.sortBy}"`, query.sortOrder)
      .limit(query.limit)
      .offset(offset)
      .getRawMany<TlsRaw>();

    const data = list.map((item): GetTlsResponseDto => {
      const obj = new GetTlsResponseDto();
      obj.host = item.host;
      obj.sni = item.sni;
      obj.subject_dn = item.subject_dn;
      obj.subject_cn = item.subject_cn;
      obj.issuer_dn = item.issuer_dn;
      obj.not_after = item.not_after;
      obj.not_before = item.not_before;
      obj.tls_version = item.tls_version;
      obj.cipher = item.cipher;
      obj.tls_connection = item.tls_connection;
      try {
        obj.subject_an = item.subject_an
          ? (JSON.parse(item.subject_an) as string[])
          : [];
      } catch {
        obj.subject_an = [];
      }
      return obj;
    });

    return getManyResponse({ query, data, total });
  }

  public async generateServiceTags(
    assetServiceId: string,
    workspaceId: string,
  ): Promise<string[]> {
    const assetService = await this.assetServiceRepo
      .createQueryBuilder('assetService')
      .leftJoinAndSelect('assetService.asset', 'asset')
      .leftJoinAndSelect('assetService.httpResponses', 'httpResponse')
      .innerJoin('asset.target', 'target')
      .where('assetService.id = :assetServiceId', { assetServiceId })
      .andWhere('target.workspaceId = :workspaceId', { workspaceId })
      .getOne();

    if (!assetService) {
      throw new NotFoundException('Asset service not found');
    }

    const latestHttpResponse = assetService.httpResponses?.[0];

    const serviceContext = {
      service: {
        value: assetService.value,
        port: assetService.port,
      },
      host: assetService.asset?.value,
      ...(latestHttpResponse && {
        http: {
          title: latestHttpResponse.title,
          webserver: latestHttpResponse.webserver,
          tech: latestHttpResponse.tech,
          status_code: latestHttpResponse.status_code,
          scheme: latestHttpResponse.scheme,
          host: latestHttpResponse.host,
          path: latestHttpResponse.path,
          content_type: latestHttpResponse.content_type,
          words: latestHttpResponse.words,
          lines: latestHttpResponse.lines,
          tls: latestHttpResponse.tls,
        },
      }),
    };

    const tags = await this.generateTagsWithAI(
      JSON.stringify(serviceContext, null, 2),
      workspaceId,
    );

    if (tags.length === 0) {
      throw new BadRequestException(
        'AI model did not generate any tags. Ensure an LLM config is set up in your workspace.',
      );
    }

    return tags;
  }

  public async toggleAsset(
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
