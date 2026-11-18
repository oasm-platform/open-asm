import { GetManyBaseResponseDto } from '@/common/dtos/get-many-base.dto';
import * as path from 'path';
import { PromptRegistry } from '@/common/utils/prompt-registry.util';
import { WorkspaceEncryptionService } from '@/services/workspace-encryption/workspace-encryption.service';
import { getManyResponse } from '@/common/utils/get-many-response.util';
import { generateText } from 'ai';
import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { findDefaultLLMConfig } from '../agents/agents.config';
import { AgentConfig } from '../agents/entities/agent-config.entity';
import { AgentLLMConfig } from '../agents/entities/agent-llm-config.entity';
import { LLMProvider } from '../agents/enums/agent.enums';
import {
  getLLMProviderConfig,
} from '../agents/llm-provider-supported';

import { AssetQueryService } from './asset-query.service';
import { GetAssetsQueryDto } from './dto/assets.dto';
import { GetTlsQueryDto, GetTlsResponseDto } from './dto/tls.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { AssetService } from './entities/asset-services.entity';
import { Asset } from './entities/assets.entity';
import { HttpResponseTechnology } from './entities/http-response-technology.entity';
import { TlsCertificate } from './entities/tls-certificate.entity';
import { InvalidInputError, NotFoundError } from '@/common/errors/domain.errors';

@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);
  // GENERATE_SERVICE_TAGS.md lives with the agent prompts
  private readonly prompts = PromptRegistry.forDirectory(
    path.join(__dirname, '../agents/prompts'),
  );

  constructor(
    @InjectRepository(Asset)
    public readonly assetRepo: Repository<Asset>,
    @InjectRepository(AssetService)
    public readonly assetServiceRepo: Repository<AssetService>,
    @InjectRepository(TlsCertificate)
    public readonly tlsCertificateRepo: Repository<TlsCertificate>,
    @InjectRepository(HttpResponseTechnology)
    public readonly httpResponseTechnologyRepo: Repository<HttpResponseTechnology>,
    @InjectRepository(AgentLLMConfig)
    private readonly llmConfigRepository: Repository<AgentLLMConfig>,
    @InjectRepository(AgentConfig)
    private readonly agentConfigRepository: Repository<AgentConfig>,
    private workspaceEncryption: WorkspaceEncryptionService,
    private dataSource: DataSource,
    private readonly assetQuery: AssetQueryService,
  ) {}

  private async generateTagsWithAI(
    serviceData: string,
    workspaceId: string,
    userId: string,
  ): Promise<string[]> {
    const llmConfig = await findDefaultLLMConfig(
      {
        llmConfigs: this.llmConfigRepository,
        agentConfigs: this.agentConfigRepository,
      },
      workspaceId,
      userId,
    );

    if (!llmConfig) {
      throw new InvalidInputError(
        'No LLM provider connected. Please connect a provider first.',
      );
    }

    const providerConfig = getLLMProviderConfig(llmConfig.provider);
    if (!providerConfig) {
      throw new InvalidInputError(
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

    const prompt = this.prompts.render('GENERATE_SERVICE_TAGS.md', {
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

  // Queries other modules (agents tools, search) still ask this service for
  getManyAsssetServices(
    ...args: Parameters<AssetQueryService['getManyAsssetServices']>
  ): ReturnType<AssetQueryService['getManyAsssetServices']> {
    return this.assetQuery.getManyAsssetServices(...args);
  }

  getAssetById(
    ...args: Parameters<AssetQueryService['getAssetById']>
  ): ReturnType<AssetQueryService['getAssetById']> {
    return this.assetQuery.getAssetById(...args);
  }

  getPortAssets(
    ...args: Parameters<AssetQueryService['getPortAssets']>
  ): ReturnType<AssetQueryService['getPortAssets']> {
    return this.assetQuery.getPortAssets(...args);
  }

  getTechnologyAssets(
    ...args: Parameters<AssetQueryService['getTechnologyAssets']>
  ): ReturnType<AssetQueryService['getTechnologyAssets']> {
    return this.assetQuery.getTechnologyAssets(...args);
  }

  /** Whether the target still has its primary (own host) asset. */
  public hasPrimaryAsset(targetId: string): Promise<boolean> {
    return this.assetRepo.exists({
      where: { target: { id: targetId }, isPrimary: true },
    });
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
      throw new NotFoundError('Asset service not found');
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
   * Reads `tls_certificates` directly, scoped to the workspace via the
   * asset_service → asset → target chain so all standard filters
   * (targetIds, hosts, …) still apply.
   */
  public async getManyTls(
    query: GetTlsQueryDto,
    workspaceId: string,
  ): Promise<GetManyBaseResponseDto<GetTlsResponseDto>> {
    const sortByMap: Record<string, string> = {
      host: 'host',
      sni: 'sni',
      not_after: 'notAfter',
      not_before: 'notBefore',
      subject_dn: 'subjectDn',
      tls_version: 'tlsVersion',
    };
    const sortColumn = sortByMap[query.sortBy] ?? 'notAfter';

    const offset = (query.page - 1) * query.limit;

    // `hosts` is a cert-host filter, applied once on tc."host" below — not
    // a service filter (that would also constrain on the latest response).
    const baseQuery: GetAssetsQueryDto = {
      ...query,
      hosts: undefined,
      startDate: undefined,
      endDate: undefined,
    };
    const filteredServicesQuery = this.assetQuery.buildBaseQuery(
      baseQuery,
      workspaceId,
    ).select('asset_service.id');

    const params: Record<string, unknown> = {
      ...filteredServicesQuery.getParameters(),
    };
    if (query.search) {
      params.tlsSearch = `%${query.search}%`;
    }
    if (query.hosts && query.hosts.length > 0) {
      params.tlsHostFilter = query.hosts;
    }
    if (query.startDate) {
      params.tlsStartDate = query.startDate;
    }
    if (query.endDate) {
      params.tlsEndDate = `${query.endDate} 23:59:59.999`;
    }

    const certSql = `
      SELECT DISTINCT ON (tc."host", tc."assetServiceId")
        tc."host" AS host,
        tc."sni" AS sni,
        tc."subjectDn" AS subject_dn,
        tc."subjectCn" AS subject_cn,
        tc."issuerDn" AS issuer_dn,
        tc."notBefore" AS not_before,
        tc."notAfter" AS not_after,
        tc."tlsVersion" AS tls_version,
        tc."cipher" AS cipher,
        tc."tlsConnection" AS tls_connection,
        tc."subjectAn" AS subject_an
      FROM tls_certificates tc
      WHERE tc."host" IS NOT NULL
        AND tc."assetServiceId" IN (${filteredServicesQuery.getQuery()})${
          query.search ? ' AND tc."host" ILIKE :tlsSearch' : ''
        }${
          query.hosts && query.hosts.length > 0
            ? ' AND tc."host" = ANY(:tlsHostFilter)'
            : ''
        }${query.startDate ? ' AND tc."notAfter" >= :tlsStartDate' : ''}${
          query.endDate ? ' AND tc."notAfter" <= :tlsEndDate' : ''
        }
      ORDER BY tc."host", tc."assetServiceId", tc."createdAt" DESC
    `;

    const totalResult = await this.dataSource
      .createQueryBuilder()
      .select('COUNT(*)')
      .from('(' + certSql + ')', 'cnt_sub')
      .setParameters(params)
      .getRawOne<{ count: string }>();
    const total = Number(totalResult?.count ?? 0);

    type TlsRaw = {
      host: string;
      sni: string;
      subject_dn: string;
      subject_cn: string;
      issuer_dn: string;
      not_before: Date;
      not_after: Date;
      tls_version: string;
      cipher: string;
      tls_connection: string;
      subject_an: string[] | null;
    };

    const sortKeyMap: Record<string, string> = {
      host: 't.host',
      sni: 't.sni',
      notAfter: 't.not_after',
      notBefore: 't.not_before',
      subjectDn: 't.subject_dn',
      tlsVersion: 't.tls_version',
    };

    const list = await this.dataSource
      .createQueryBuilder()
      .select('t.*')
      .from('(' + certSql + ')', 't')
      .setParameters(params)
      .orderBy(sortKeyMap[sortColumn] ?? 't.not_after', query.sortOrder)
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
      obj.not_after =
        item.not_after instanceof Date
          ? item.not_after.toISOString()
          : (item.not_after);
      obj.not_before =
        item.not_before instanceof Date
          ? item.not_before.toISOString()
          : (item.not_before);
      obj.tls_version = item.tls_version;
      obj.cipher = item.cipher;
      obj.tls_connection = item.tls_connection;
      obj.subject_an = Array.isArray(item.subject_an) ? item.subject_an : [];
      return obj;
    });

    return getManyResponse({ query, data, total });
  }

  public async generateServiceTags(
    assetServiceId: string,
    workspaceId: string,
    userId: string,
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
      throw new NotFoundError('Asset service not found');
    }

    const latestHttpResponse = assetService.httpResponses?.[0];
    const latestTechs = latestHttpResponse
      ? await this.assetQuery.getTechStringsForHttpResponse(latestHttpResponse.id)
      : [];
    const latestTls = latestHttpResponse
      ? await this.assetQuery.getTlsForHttpResponse(latestHttpResponse.id)
      : null;

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
          tech: latestTechs,
          status_code: latestHttpResponse.status_code,
          scheme: latestHttpResponse.scheme,
          host: latestHttpResponse.host,
          path: latestHttpResponse.path,
          content_type: latestHttpResponse.content_type,
          words: latestHttpResponse.words,
          lines: latestHttpResponse.lines,
          tls: latestTls,
        },
      }),
    };

    const tags = await this.generateTagsWithAI(
      JSON.stringify(serviceContext, null, 2),
      workspaceId,
      userId,
    );

    if (tags.length === 0) {
      throw new InvalidInputError(
        'AI model did not generate any tags. Ensure an LLM config is set up for your account.',
      );
    }

    return tags;
  }

  public async toggleAsset(
    assetId: string,
    isEnabled: boolean,
    workspaceId: string,
  ): Promise<Asset> {
    const asset = await this.assetRepo.findOne({
      where: { id: assetId, target: { workspaceId } },
    });

    if (!asset) {
      throw new NotFoundError('Asset not found');
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
    const queryBuilder = this.assetQuery.buildBaseQuery(
      new GetAssetsQueryDto(),
      workspaceId,
    ).select(['asset_service.value', 'asset_service.port']);

    const services = await queryBuilder.getMany();
    const serviceIds = services.map((s) => s.id);

    const [techAgg, tlsAgg] = await Promise.all([
      serviceIds.length > 0
        ? this.httpResponseTechnologyRepo
            .createQueryBuilder('hrt')
            .select(
              `hrt."assetServiceId" AS "assetServiceId", array_agg(hrt.name || CASE WHEN hrt.version IS NULL THEN '' ELSE ':' || hrt.version END) AS "techs"`,
            )
            .where('hrt."assetServiceId" IN (:...serviceIds)', { serviceIds })
            .groupBy('hrt."assetServiceId"')
            .getRawMany<{ assetServiceId: string; techs: string[] }>()
        : Promise.resolve([]),
      serviceIds.length > 0
        ? this.tlsCertificateRepo
            .createQueryBuilder('tc')
            .select(
              `tc."assetServiceId" AS "assetServiceId", tc."host" AS "host", tc."sni" AS "sni", tc."subjectDn" AS "subject_dn", tc."notAfter" AS "not_after", tc."notBefore" AS "not_before", tc."tlsConnection" AS "tls_connection"`,
            )
            .distinctOn(['tc."host"', 'tc."assetServiceId"'])
            .where('tc."assetServiceId" IN (:...serviceIds)', { serviceIds })
            .andWhere('tc."host" IS NOT NULL')
            .orderBy('tc."host"')
            .addOrderBy('tc."assetServiceId"')
            .addOrderBy('tc."createdAt"', 'DESC')
            .getRawMany<
              Record<string, string | null> & { assetServiceId: string }
            >()
        : Promise.resolve([]),
    ]);
    const techByService = new Map(techAgg.map((r) => [r.assetServiceId, r.techs ?? []]));
    const tlsByService = new Map(tlsAgg.map((r) => [r.assetServiceId, r]));

    return services.map((service) => {
      return {
        value: service.value,
        ports: service.port ? [service.port] : [],
        techs: techByService.get(service.id) ?? [],
        tls: (tlsByService.get(service.id) as {
          host?: string;
          sni?: string;
          subject_dn?: string;
          not_after?: string;
          not_before?: string;
          tls_connection?: string;
        }) ?? null,
      };
    });
  }
}
