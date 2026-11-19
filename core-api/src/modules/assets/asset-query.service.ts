import { GetManyBaseResponseDto } from '@/common/dtos/get-many-base.dto';
import { getManyResponse } from '@/common/utils/get-many-response.util';
import { containsLikePattern } from '@/common/utils/like-pattern.util';
import { GeoIpService } from '@/services/geo-ip/geo-ip.service';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { StorageService } from '../storage/storage.service';
import { TechnologyForwarderService } from '../technology/technology-forwarder.service';
import {
  compileAssetFilter,
  legacyParamsToFilter,
  type NewRowsScope,
} from './asset-filter';
import {
  GetAssetsQueryDto,
  GetAssetsResponseDto,
  PickTechnologyDetailDTO,
} from './dto/assets.dto';
import { GetHostAssetsDTO } from './dto/get-host-assets.dto';
import { GetIpAssetsDTO } from './dto/get-ip-assets.dto';
import { GetPortAssetsDTO } from './dto/get-port-assets.dto';
import { GetStatusCodeAssetsDTO } from './dto/get-status-code-assets.dto';
import { GetTagAssetsDTO } from './dto/get-tag-assets.dto';
import { GetTechnologyAssetsDTO } from './dto/get-technology-assets.dto';
import { GetUrlAssetsDTO } from './dto/get-url-assets.dto';
import { AssetService } from './entities/asset-services.entity';
import { AssetTag } from './entities/asset-tags.entity';
import { HttpResponseTechnology } from './entities/http-response-technology.entity';
import {
  IpObservation,
  type IpObservationSource,
} from './entities/ip-observation.entity';
import { TlsCertificate } from './entities/tls-certificate.entity';
import { findFreshRuns, isFresh } from './fresh-runs';

/** IP sources that belong to an asset (its DNS A/AAAA records). */
const DNS_IP_SOURCES: IpObservationSource[] = ['dns_a', 'dns_aaaa'];

/** A tls_certificates row in the legacy HttpResponse.tls payload shape. */
function toLegacyTls(cert: TlsCertificate): Record<string, unknown> {
  return {
    host: cert.host,
    port: cert.port,
    probe_status: cert.probeStatus,
    tls_version: cert.tlsVersion,
    cipher: cert.cipher,
    not_before: cert.notBefore?.toISOString() ?? null,
    not_after: cert.notAfter?.toISOString() ?? null,
    subject_dn: cert.subjectDn,
    subject_cn: cert.subjectCn,
    subject_an: cert.subjectAn ?? [],
    serial: cert.serial,
    issuer_dn: cert.issuerDn,
    issuer_cn: cert.issuerCn,
    issuer_org: cert.issuerOrg ?? [],
    fingerprint_hash: {
      md5: cert.fingerprintMd5,
      sha1: cert.fingerprintSha1,
      sha256: cert.fingerprintSha256,
    },
    wildcard_certificate: cert.wildcardCertificate,
    tls_connection: cert.tlsConnection,
    sni: cert.sni,
  };
}

/**
 * The asset list and its facets: `buildBaseQuery` (tenant scope plus the
 * filter tree, shared by every list, facet, TLS and export query), the
 * service list (`getManyAsssetServices`) with its batch-loaded facets, one
 * service (`getAssetById`), and the IP, host, tag, port, URL, technology and
 * status-code tabs. Read only.
 */
@Injectable()
export class AssetQueryService {
  constructor(
    @InjectRepository(AssetService)
    private readonly assetServiceRepo: Repository<AssetService>,
    @InjectRepository(TlsCertificate)
    private readonly tlsCertificateRepo: Repository<TlsCertificate>,
    @InjectRepository(HttpResponseTechnology)
    private readonly httpResponseTechnologyRepo: Repository<HttpResponseTechnology>,
    @InjectRepository(IpObservation)
    private readonly ipObservationRepo: Repository<IpObservation>,
    private readonly dataSource: DataSource,
    private readonly technologyForwarderService: TechnologyForwarderService,
    private readonly geoIpService: GeoIpService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Batch-loads the facets the asset list renders, one query per facet:
   * asset IPs (DNS A/AAAA, same source as the IP tab and the IP filter),
   * tech strings and TLS of the given http responses.
   */
  private async loadFacets(
    assetIds: string[],
    httpResponseIds: string[],
  ): Promise<{
    ipsByAsset: Map<string, string[]>;
    techByResponse: Map<string, string[]>;
    tlsByResponse: Map<string, Record<string, unknown>>;
  }> {
    const [ipRows, techRows, certs] = await Promise.all([
      assetIds.length
        ? this.ipObservationRepo.find({
            select: ['assetId', 'ip'],
            where: { assetId: In(assetIds), source: In(DNS_IP_SOURCES) },
            order: { ip: 'ASC' },
          })
        : [],
      httpResponseIds.length
        ? this.httpResponseTechnologyRepo.find({
            select: ['httpResponseId', 'name', 'version'],
            where: { httpResponseId: In(httpResponseIds) },
          })
        : [],
      httpResponseIds.length
        ? this.tlsCertificateRepo.find({
            where: { httpResponseId: In(httpResponseIds) },
          })
        : [],
    ]);

    const ipsByAsset = new Map<string, string[]>();
    for (const row of ipRows ?? []) {
      if (!row.assetId) continue;
      const list = ipsByAsset.get(row.assetId) ?? [];
      if (!list.includes(row.ip)) list.push(row.ip);
      ipsByAsset.set(row.assetId, list);
    }
    const techByResponse = new Map<string, string[]>();
    for (const row of techRows ?? []) {
      const list = techByResponse.get(row.httpResponseId) ?? [];
      list.push(row.version ? `${row.name}:${row.version}` : row.name);
      techByResponse.set(row.httpResponseId, list);
    }
    const tlsByResponse = new Map<string, Record<string, unknown>>();
    for (const cert of (certs ?? []) as TlsCertificate[]) {
      tlsByResponse.set(cert.httpResponseId, toLegacyTls(cert));
    }
    return { ipsByAsset, techByResponse, tlsByResponse };
  }

  /** Tech strings ("name" or "name:version") for one http response. */
  async getTechStringsForHttpResponse(
    httpResponseId: string,
  ): Promise<string[]> {
    const { techByResponse } = await this.loadFacets([], [httpResponseId]);
    return techByResponse.get(httpResponseId) ?? [];
  }

  /** TLS payload in the legacy HttpResponse.tls shape for one http response. */
  async getTlsForHttpResponse(
    httpResponseId: string,
  ): Promise<Record<string, unknown> | null> {
    const { tlsByResponse } = await this.loadFacets([], [httpResponseId]);
    return tlsByResponse.get(httpResponseId) ?? null;
  }

  /** Enriches every distinct tech string once; returns tech → details. */
  private async enrichTechStrings(
    techs: string[],
  ): Promise<Map<string, PickTechnologyDetailDTO & { website?: string }>> {
    const unique = [...new Set(techs)];
    const enriched =
      (await this.technologyForwarderService.enrichTechnologies(unique)) ?? [];
    const byTech = new Map<
      string,
      PickTechnologyDetailDTO & { website?: string }
    >();
    unique.forEach((tech, i) => {
      const e = enriched[i];
      if (e?.name === undefined) return;
      byTech.set(tech, {
        name: e.name,
        description: e.description,
        iconUrl: e.iconUrl,
        categoryNames: e.categoryNames,
        website: e.website,
      });
    });
    return byTech;
  }

  /**
   * Maps asset-service rows (from buildBaseQuery) to the list/detail DTO,
   * batching every facet lookup across the page.
   */
  private async toAssetResponses(
    items: AssetService[],
  ): Promise<GetAssetsResponseDto[]> {
    const assetIds = items
      .map((item) => item.asset?.id)
      .filter((id): id is string => !!id);
    const latestIds = items
      .map((item) => item.httpResponses?.[0]?.id)
      .filter((id): id is string => !!id);
    const [{ ipsByAsset, techByResponse, tlsByResponse }, fresh] =
      await Promise.all([
        this.loadFacets(assetIds, latestIds),
        findFreshRuns(
          this.dataSource,
          items.map((item) => ({
            jobHistoryId: item.jobHistoryId,
            targetId: item.asset?.targetId,
          })),
        ),
      ]);
    const techDetails = await this.enrichTechStrings(
      [...techByResponse.values()].flat(),
    );
    // Screenshot signing (storage refactor): one batch call per page, order-
    // preserving; malformed rows resolve to null, falsy rows stay null/''.
    const rawPaths = items.map((item) => item.screenshotPath);
    const signable = rawPaths
      .filter((p): p is string => !!p)
      .map((p) => {
        const slashIndex = p.indexOf('/');
        return {
          bucket: slashIndex > 0 ? p.slice(0, slashIndex) : '',
          path: p,
        };
      });
    const signedUrls = signable.length
      ? ((await this.storageService.signStoragePaths(signable)) ?? [])
      : [];
    let urlCursor = 0;
    const urlByRaw = new Map<string, string | null>();
    for (const raw of rawPaths) {
      if (raw) {
        urlByRaw.set(raw, signedUrls[urlCursor++] ?? null);
      }
    }

    return items.map((item) => {
      const asset = new GetAssetsResponseDto();
      asset.id = item.id;
      asset.value = item.value;
      asset.targetId = item.asset?.targetId;
      asset.createdAt = item.createdAt;
      asset.dnsRecords = item.asset?.dnsRecords;
      asset.isEnabled = item.asset?.isEnabled;
      asset.port = item.port;
      asset.isNew = isFresh(fresh, {
        jobHistoryId: item.jobHistoryId,
        targetId: item.asset?.targetId,
      });
      asset.screenshotPath =
        (item.screenshotPath &&
          (urlByRaw.get(item.screenshotPath) ?? null)) ||
        (item.screenshotPath === '' ? '' : null);
      asset.ipAddresses = item.asset?.id
        ? (ipsByAsset.get(item.asset.id) ?? [])
        : [];

      const latest = item.httpResponses?.[0];
      if (latest) {
        asset.httpResponses = latest;
        latest.tech = techByResponse.get(latest.id) ?? [];
        latest.tls = tlsByResponse.get(latest.id) ?? null;
        if (latest.tech.length) {
          asset.httpResponses.techList = latest.tech
            .map((tech) => techDetails.get(tech))
            .filter((detail) => detail !== undefined);
        }
      }
      return asset;
    });
  }

  /**
   * @param newRows - Which row an `isNew` condition (`?isNew=true` or the
   *   filter tree) is about; see {@link NewRowsScope}. `url` requires the
   *   caller to correlate this query with a `du` (discovered_urls) row.
   */
  buildBaseQuery(
    query: GetAssetsQueryDto,
    workspaceId: string,
    newRows: NewRowsScope = 'service',
  ) {
    const queryBuilder = this.assetServiceRepo
      .createQueryBuilder('asset_service')
      .leftJoinAndSelect('asset_service.asset', 'asset')
      .leftJoin('asset.target', 'targets')
      .leftJoinAndSelect(
        'asset_service.httpResponses',
        'latest_http_response',
        'latest_http_response.id = (SELECT hr.id FROM http_responses hr WHERE hr."assetServiceId" = asset_service.id ORDER BY hr."createdAt" DESC LIMIT 1)',
      )
      .where('targets.workspaceId = :workspaceId', {
        workspaceId,
      });

    if (query.targetIds?.length) {
      queryBuilder.andWhere('"asset"."targetId" = ANY(:targetIds)', {
        targetIds: query.targetIds,
      });
    }

    // Legacy array params (MCP, dashboard links) and the filter tree share one compiler.
    for (const [filter, prefix] of [
      [legacyParamsToFilter(query), 'lf'],
      [query.filter, 'af'],
    ] as const) {
      const compiled = filter && compileAssetFilter(filter, prefix, newRows);
      if (compiled) queryBuilder.andWhere(compiled.sql, compiled.params);
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
        value: containsLikePattern(query.value),
      });
    }

    const sortColumn =
      query.sortBy === 'isEnabled'
        ? `asset.${query.sortBy}`
        : `asset_service.${query.sortBy}`;

    const [list, total] = await queryBuilder
      .orderBy(sortColumn, query.sortOrder)
      // Unique tiebreaker: createdAt alone is not unique (batch-scanned
      // assets share timestamps), so Postgres may order ties differently
      // per query, causing rows to repeat/skip across offset pages.
      .addOrderBy('asset_service.id', query.sortOrder)
      .skip(offset)
      .take(query.limit)
      .getManyAndCount();

    const data = await this.toAssetResponses(list);

    return getManyResponse({ query, data, total });
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

    const [asset] = await this.toAssetResponses([item]);

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

    // Asset IPs are the DNS A/AAAA records of the asset (as in the legacy
    // ip_assets_view); assetCount = distinct filtered services on those
    // assets. httpx/resolver observations are excluded on purpose.
    const filteredServicesQuery = this.buildBaseQuery(query, workspaceId)
      .select('asset_service.id', 'serviceId')
      .addSelect('asset_service."assetId"', 'assetId');

    const params: Record<string, unknown> = {
      ...filteredServicesQuery.getParameters(),
    };
    if (query.value) {
      params.ipValue = `%${query.value}%`;
    }

    const groupedSql = `
      SELECT host(io."ip") AS ip, COUNT(DISTINCT fs."serviceId") AS "assetCount"
      FROM (${filteredServicesQuery.getQuery()}) fs
      INNER JOIN ip_observations io
        ON io."assetId" = fs."assetId" AND io.source IN ('dns_a', 'dns_aaaa')${
          query.value ? ' AND host(io."ip") ILIKE :ipValue' : ''
        }
      GROUP BY io."ip"
    `;

    const totalInDb = await this.dataSource
      .createQueryBuilder()
      .select('COUNT(*)')
      .from('(' + groupedSql + ')', 't1')
      .setParameters(params)
      .getRawOne<{ count: number }>();

    const list = await this.dataSource
      .createQueryBuilder()
      .select('t.ip AS ip, t."assetCount" AS "assetCount"')
      .from('(' + groupedSql + ')', 't')
      .setParameters(params)
      // Whitelist: unknown sortBy values fall back to the aggregate column.
      // Addresses sort as inet (numeric, IPv4 before IPv6), not as text
      // where "104.x" < "64.x"; the address is also the unique tiebreaker.
      .orderBy(
        query.sortBy === 'ip' ? 't.ip::inet' : 't."assetCount"',
        query.sortOrder,
      )
      .addOrderBy('t.ip::inet', query.sortOrder)
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
      createdAt: 'asset.createdAt',
    };
    query.sortBy = sortColumnMap[query.sortBy] ?? '"assetCount"';

    // New hosts, not hosts with a new port: the run-completed notification
    // counts hosts the same way.
    const queryBuilder = this.buildBaseQuery(query, workspaceId, 'asset')
      .select([
        'asset.id',
        'asset.value',
        'asset.targetId',
        'asset.isEnabled',
        'asset.createdAt',
        'asset.jobHistoryId',
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

    type HostRow = {
      asset_id: string;
      asset_value: string;
      asset_targetId: string;
      asset_isEnabled: boolean;
      asset_createdAt: string;
      asset_jobHistoryId: string | null;
      assetCount: number;
    };
    const fresh = await findFreshRuns(
      this.dataSource,
      (list as HostRow[]).map((item) => ({
        jobHistoryId: item.asset_jobHistoryId,
        targetId: item.asset_targetId,
      })),
    );

    const data = (list as HostRow[]).map((item) => {
      const obj = new GetHostAssetsDTO();
      obj.id = item.asset_id;
      obj.host = item.asset_value;
      obj.targetId = item.asset_targetId;
      obj.isEnabled = item.asset_isEnabled;
      obj.assetCount = item.assetCount;
      obj.createdAt = new Date(item.asset_createdAt);
      obj.isNew = isFresh(fresh, {
        jobHistoryId: item.asset_jobHistoryId,
        targetId: item.asset_targetId,
      });
      return obj;
    });

    return getManyResponse({ query, data, total });
  }

  /**
   * Retrieves distinct service tags in the workspace with the number of assets carrying each tag.
   */
  public async getTagAssets(
    query: GetAssetsQueryDto,
    workspaceId: string,
  ): Promise<GetManyBaseResponseDto<GetTagAssetsDTO>> {
    const offset = (query.page - 1) * query.limit;
    const sortColumn = query.sortBy === 'tag' ? 'ast.tag' : '"assetCount"';

    const queryBuilder = this.buildBaseQuery(query, workspaceId)
      .innerJoin('asset_service.tags', 'ast')
      .select(['ast.tag AS tag', 'COUNT(DISTINCT asset_service.id) AS "assetCount"'])
      .groupBy('ast.tag');

    if (query.value) {
      queryBuilder.andWhere('ast.tag ILIKE :value', { value: `%${query.value}%` });
    }

    const totalInDb = await this.dataSource
      .createQueryBuilder()
      .select('COUNT(*)')
      .from('(' + queryBuilder.getQuery() + ')', 't1')
      .setParameters(queryBuilder.getParameters())
      .getRawOne<{ count: number }>();

    const list = await queryBuilder
      .orderBy(sortColumn, query.sortOrder)
      .limit(query.limit)
      .offset(offset)
      .getRawMany<{ tag: string; assetCount: string }>();

    const data = list.map((item) => {
      const obj = new GetTagAssetsDTO();
      obj.tag = item.tag;
      obj.assetCount = Number(item.assetCount);
      return obj;
    });

    return getManyResponse({ query, data, total: Number(totalInDb?.count ?? 0) });
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
    // Whitelist: unknown sortBy values fall back to the aggregate column.
    // (`sortBy in SomeDto` is always false: a class has no instance keys.)
    const sortColumn =
      query.sortBy === 'port' ? 'asset_service.port' : '"assetCount"';

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
      .orderBy(sortColumn, query.sortOrder)
      // Unique tiebreaker: equal counts must not shuffle between pages.
      .addOrderBy('asset_service.port', query.sortOrder)
      .limit(query.limit)
      .offset(offset)
      .getRawMany();

    const total = totalInDb?.count ?? 0;

    // A port row is an aggregate with no run of its own: count, for the page's
    // ports only, how many of its services the latest finished scans found.
    const pagePorts = (list as GetPortAssetsDTO[]).map((item) => item.port);
    const provenance = pagePorts.length
      ? await this.buildBaseQuery(query, workspaceId)
          .select('asset_service.port', 'port')
          .addSelect('asset_service.jobHistoryId', 'jobHistoryId')
          .addSelect('asset.targetId', 'targetId')
          .addSelect('COUNT(DISTINCT asset_service.id)', 'count')
          .andWhere('asset_service.port IN (:...pagePorts)', { pagePorts })
          .groupBy('asset_service.port')
          .addGroupBy('asset_service.jobHistoryId')
          .addGroupBy('asset.targetId')
          .getRawMany<{
            port: number | string;
            jobHistoryId: string | null;
            targetId: string;
            count: string;
          }>()
      : [];
    const fresh = await findFreshRuns(this.dataSource, provenance);
    const newCountByPort = new Map<string, number>();
    for (const row of provenance) {
      if (!isFresh(fresh, row)) continue;
      const port = String(row.port);
      newCountByPort.set(port, (newCountByPort.get(port) ?? 0) + Number(row.count));
    }

    const data = (list as GetPortAssetsDTO[]).map((item) => {
      const obj = new GetPortAssetsDTO();
      obj.port = item.port;
      obj.assetCount = item.assetCount;
      obj.newCount = newCountByPort.get(String(item.port)) ?? 0;
      obj.isNew =
        obj.newCount > 0 && obj.newCount === Number(item.assetCount);
      return obj;
    });

    return getManyResponse({ query, data, total });
  }

  /**
   * Retrieves a list of discovered urls with number of asset services
   *
   * Single source: `discovered_urls` (the gau `url_discovery` connector).
   * Rows are grouped by url with COUNT(DISTINCT assetServiceId).
   * `http_responses` (httpx probe targets) are deliberately excluded — they
   * are probe endpoints, not discovered urls.
   *
   * @returns A promise that resolves to the list of discovered urls.
   *
   */
  public async getUrlAssets(
    query: GetAssetsQueryDto,
    workspaceId: string,
  ): Promise<GetManyBaseResponseDto<GetUrlAssetsDTO>> {
    const offset = (query.page - 1) * query.limit;

    // Whitelist: unknown sortBy values fall back to the aggregate column.
    const sortColumn =
      query.sortBy === 'url' ? 't.url' : 't."assetCount"';

    // The filtered asset-service scope: reusing buildBaseQuery keeps every
    // filter (targetIds/hosts/ip/ports/techs/statusCodes/tls/dates) intact.
    // Correlated with the outer `du` row (EXISTS, which Postgres runs as a
    // semi-join) so an `isNew` condition can judge the URL's own run: a URL
    // is new when the latest URL discovery found it, whatever its service's age.
    const filteredServicesQuery = this.buildBaseQuery(query, workspaceId, 'url')
      .select('asset_service.id')
      .andWhere('asset_service.id = du."assetServiceId"');
    const inFilteredServices = `EXISTS (${filteredServicesQuery.getQuery()})`;

    const parameters: Record<string, unknown> = {
      ...filteredServicesQuery.getParameters(),
    };
    if (query.value) {
      parameters.urlValue = `%${query.value}%`;
    }

    const groupedSql = `
      SELECT du.url AS url, COUNT(DISTINCT du."assetServiceId") AS "assetCount"
      FROM discovered_urls du
      WHERE du.url IS NOT NULL AND du.url <> ''
        AND ${inFilteredServices}${
          query.value ? ' AND du.url ILIKE :urlValue' : ''
        }
      GROUP BY du.url
    `;

    const totalInDb = await this.dataSource
      .createQueryBuilder()
      .select('COUNT(*)')
      .from('(' + groupedSql + ')', 't1')
      .setParameters(parameters)
      .getRawOne<{ count: number }>();

    const list = await this.dataSource
      .createQueryBuilder()
      .select('t.url AS url, t."assetCount" AS "assetCount"')
      .from('(' + groupedSql + ')', 't')
      .setParameters(parameters)
      .orderBy(sortColumn, query.sortOrder)
      // Unique tiebreaker: "assetCount" is not unique (nearly every url has
      // a count of 1), so Postgres may order ties differently per query,
      // causing rows to repeat/skip across offset pages.
      .addOrderBy('t.url', query.sortOrder)
      .limit(query.limit)
      .offset(offset)
      .getRawMany<GetUrlAssetsDTO>();

    const total = totalInDb?.count ?? 0;

    // Provenance of the page's URLs only: a URL is new when any of its
    // services got it from the latest finished URL discovery.
    const pageUrls = list.map((item) => item.url);
    const provenance = pageUrls.length
      ? await this.dataSource
          .createQueryBuilder()
          .select('du.url', 'url')
          .addSelect('du."jobHistoryId"', 'jobHistoryId')
          .addSelect('a."targetId"', 'targetId')
          .distinct(true)
          .from('discovered_urls', 'du')
          .innerJoin('asset_services', 's', 's.id = du."assetServiceId"')
          .innerJoin('assets', 'a', 'a.id = s."assetId"')
          .where(inFilteredServices)
          .andWhere('du.url IN (:...pageUrls)')
          .andWhere('du."jobHistoryId" IS NOT NULL')
          .setParameters({ ...parameters, pageUrls })
          .getRawMany<{ url: string; jobHistoryId: string; targetId: string }>()
      : [];
    const fresh = await findFreshRuns(this.dataSource, provenance);
    const newUrls = new Set(
      provenance.filter((row) => isFresh(fresh, row)).map((row) => row.url),
    );

    const data = list.map((item: GetUrlAssetsDTO) => {
      const obj = new GetUrlAssetsDTO();
      obj.url = item.url;
      obj.assetCount = item.assetCount;
      obj.isNew = newUrls.has(item.url);
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
    // Whitelist: unknown sortBy values fall back to the aggregate column.
    // Description/category come from enrichment after the query, so they
    // are not sortable here.
    const sortColumn =
      query.sortBy === 'technology' ? '"technology"' : '"assetCount"';

    const queryBuilder = this.buildBaseQuery(query, workspaceId)
      .innerJoin(
        'http_response_technologies',
        'hrt',
        'hrt."httpResponseId" = latest_http_response.id',
      )
      .select([
        `hrt.name || CASE WHEN hrt.version IS NULL THEN '' ELSE ':' || hrt.version END as "technology"`,
        'COUNT(DISTINCT asset_service.id) as "assetCount"',
      ])
      .groupBy('hrt.name')
      .addGroupBy('hrt.version');

    if (query.value) {
      queryBuilder.andWhere(
        `(hrt.name || CASE WHEN hrt.version IS NULL THEN '' ELSE ':' || hrt.version END) ILIKE :value`,
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
      .orderBy(sortColumn, query.sortOrder)
      // Unique tiebreaker (group key): equal counts keep a stable page order.
      .addOrderBy('hrt.name', query.sortOrder)
      .addOrderBy('hrt.version', query.sortOrder)
      .limit(query.limit)
      .offset(offset)
      .getRawMany();

    // Tech names are stored split (name + version); enrichment needs the
    // bare name only.
    const techNames = list.map(
      (item: { technology: string; assetCount: number }) =>
        item.technology.split(':')[0],
    );

    const enrichedTechs =
      await this.technologyForwarderService.enrichTechnologies(techNames);

    const data = list.map(
      (item: { technology: string; assetCount: number }) => {
        const idx = item.technology.indexOf(':');
        const name = idx < 0 ? item.technology : item.technology.slice(0, idx);
        const version =
          idx < 0 ? undefined : item.technology.slice(idx + 1) || undefined;
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
    // Whitelist: unknown sortBy values fall back to the aggregate column.
    const sortColumn =
      query.sortBy === 'statusCode' ? 'hsc."statusCode"' : '"assetCount"';

    const queryBuilder = this.buildBaseQuery(query, workspaceId)
      .innerJoin(
        'http_status_codes',
        'hsc',
        'hsc."httpResponseId" = latest_http_response.id',
      )
      .select([
        'hsc."statusCode" AS "statusCode"',
        'COUNT(DISTINCT asset_service.id) as "assetCount"',
      ])
      .groupBy('hsc."statusCode"')
      .andWhere('hsc."statusCode" IS NOT NULL')
      .andWhere('hsc."statusCode" != 0');

    if (query.value) {
      queryBuilder.andWhere('hsc."statusCode"::text ILIKE :value', {
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
      .orderBy(sortColumn, query.sortOrder)
      // Unique tiebreaker: equal counts must not shuffle between pages.
      .addOrderBy('hsc."statusCode"', query.sortOrder)
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
}
