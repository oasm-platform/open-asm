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
import { WorkspaceTarget } from '../targets/entities/workspace-target.entity';
import { GetAssetsQueryDto, GetAssetsResponseDto } from './dto/assets.dto';
import { GetIpAssetsDTO } from './dto/get-ip-assets.dto';
import { GetPortAssetsDTO } from './dto/get-port-assets.dto';
import { GetTechnologyAssetsDTO } from './dto/get-technology-assets.dto';
import { Asset } from './entities/assets.entity';
import { HttpResponse } from './entities/http-response.entity';
import { Port } from './entities/ports.entity';
import { GetFacetedDataDTO } from './dto/get-faceted-data.dto';

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
    const {
      limit,
      page,
      sortOrder,
      targetIds,
      workspaceId,
      value,
      ipAddresses,
      ports,
      techs,
    } = query;

    let sortBy = query.sortBy;
    if (!(sortBy in Asset)) {
      sortBy = 'createdAt';
    }
    const offset = (page - 1) * limit;

    const ipQb = this.dataSource
      .createQueryBuilder()
      .addCommonTableExpression(
        `SELECT
        a.id AS asset_id,
        a."targetId",
        jsonb_array_elements_text(a."dnsRecords"::jsonb -> 'A') AS ip
    FROM assets a
    WHERE a."targetId" IS NOT NULL

    UNION ALL

    SELECT
        a.id AS asset_id,
        a."targetId",
        jsonb_array_elements_text(a."dnsRecords"::jsonb -> 'AAAA') AS ip
    FROM assets a
    WHERE a."targetId" IS NOT NULL`,
        'cte',
      )
      .select('t.asset_id', 'asset_id')
      .where('t.ip = ANY(:ipAddresses)', {
        ipAddresses,
      })
      .from('cte', 't');

    const whereBuilder = {
      value: {
        value: `%${value}%`,
        whereClause: `"assets"."value" ILIKE :param`,
      },
      targetIds: {
        value: targetIds,
        whereClause: `"assets"."targetId" = ANY(:param)`,
      },
      workspaceId: {
        value: workspaceId,
        whereClause: `workspaceTargets.workspaceId = :param`,
      },
      assetId: {
        value: assetId,
        whereClause: `"assets"."id" = :param`,
      },
      techs: {
        value: techs,
        whereClause: `"httpResponses"."tech" && :param`,
      },
      ipAddresses: {
        value: ipAddresses,
        whereClause: '"assets"."id" IN (' + ipQb.getQuery() + ')',
      },
      ports: {
        value: ports,
        whereClause: `"ports"."ports" && :param`,
      },
    };

    const queryBuilder = this.assetRepo
      .createQueryBuilder('assets')
      .leftJoinAndSelect('assets.httpResponses', 'httpResponses')
      .leftJoinAndSelect('assets.ports', 'ports')
      .leftJoinAndSelect('assets.target', 'targets')
      .leftJoin('targets.workspaceTargets', 'workspaceTargets')
      .where('assets.isErrorPage = false');

    for (const [key, value] of Object.entries(whereBuilder)) {
      if (query[key] || (assetId && key === 'assetId')) {
        const newWhereClause = value.whereClause.replaceAll(
          ':param',
          `:${key}`,
        );
        queryBuilder.andWhere(newWhereClause, {
          [key]: value.value,
        });
      }
    }

    const [list, total] = await queryBuilder
      .orderBy(`assets.${sortBy}`, sortOrder)
      .skip(offset)
      .take(limit)
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
    const {
      limit,
      page,
      sortOrder,
      targetIds,
      workspaceId,
      value,
      ipAddresses,
      ports,
      techs,
    } = query;

    let sortBy = query.sortBy;
    if (!(sortBy in GetIpAssetsDTO)) {
      sortBy = 'assetCount';
    }

    const offset = (page - 1) * limit;

    const whereBuilder = {
      value: {
        value: `%${value}%`,
        whereClause: `"t"."ip" ILIKE :param`,
      },
      targetIds: {
        value: targetIds,
        whereClause: `"t"."targetId" = ANY(:param)`,
      },
      techs: {
        value: techs,
        whereClause: `"httpResponses"."tech" && :param`,
      },
      ipAddresses: {
        value: ipAddresses,
        whereClause: `"t"."ip" = ANY(:param)`,
      },
      ports: {
        value: ports,
        whereClause: `"ports"."ports" && :param`,
      },
    };

    const queryBuilder = this.dataSource
      .createQueryBuilder()
      .addCommonTableExpression(
        `SELECT
        a.id AS asset_id,
        a."targetId",
        jsonb_array_elements_text(a."dnsRecords"::jsonb -> 'A') AS ip
    FROM assets a
    WHERE a."targetId" IS NOT NULL

    UNION ALL

    SELECT
        a.id AS asset_id,
        a."targetId",
        jsonb_array_elements_text(a."dnsRecords"::jsonb -> 'AAAA') AS ip
    FROM assets a
    WHERE a."targetId" IS NOT NULL`,
        'cte',
      )
      .select('t.ip', 'ip')
      .addSelect('COUNT(DISTINCT t.asset_id)', 'assetCount')
      .from('cte', 't')
      .leftJoin(WorkspaceTarget, 'wt', 'wt."targetId" = t."targetId"')
      .leftJoin(
        HttpResponse,
        'httpResponses',
        '"httpResponses"."assetId" = t."asset_id"',
      )
      .leftJoin(Port, 'ports', 'ports."assetId" = t."asset_id"')
      .where('wt.workspaceId = :workspaceId', { workspaceId })
      .groupBy('"ip"');

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

    const total = (await queryBuilder.getRawMany()).length;

    const result = await queryBuilder
      .orderBy(`"${sortBy}"`, sortOrder)
      .offset(offset)
      .limit(limit)
      .getRawMany();

    const list = result.map((item: GetIpAssetsDTO) => {
      const obj = new GetIpAssetsDTO();
      obj.assetCount = item.assetCount;
      obj.ip = item.ip;
      return obj;
    });

    return getManyResponse({ query, data: list, total });
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
    const {
      limit,
      page,
      sortOrder,
      targetIds,
      workspaceId,
      value,
      ipAddresses,
      ports,
      techs,
    } = query;

    const offset = (page - 1) * limit;

    let sortBy = query.sortBy;
    if (!(sortBy in GetPortAssetsDTO)) {
      sortBy = 'assetCount';
    }

    const ipQb = this.dataSource
      .createQueryBuilder()
      .addCommonTableExpression(
        `SELECT
        a.id AS asset_id,
        a."targetId",
        jsonb_array_elements_text(a."dnsRecords"::jsonb -> 'A') AS ip
    FROM assets a
    WHERE a."targetId" IS NOT NULL

    UNION ALL

    SELECT
        a.id AS asset_id,
        a."targetId",
        jsonb_array_elements_text(a."dnsRecords"::jsonb -> 'AAAA') AS ip
    FROM assets a
    WHERE a."targetId" IS NOT NULL`,
        'cte',
      )
      .select('t.asset_id', 'asset_id')
      .where('t.ip = ANY(:ipAddresses)', {
        ipAddresses,
      })
      .from('cte', 't');

    const whereBuilder = {
      value: {
        value: `%${value}%`,
        whereClause: `"portUnnested"."port" ILIKE :param`,
      },
      targetIds: {
        value: targetIds,
        whereClause: `"assets"."targetId" = ANY(:param)`,
      },
      workspaceId: {
        value: workspaceId,
        whereClause: `workspaceTargets.workspaceId = :param`,
      },
      techs: {
        value: techs,
        whereClause: `"httpResponses"."tech" && :param`,
      },
      ipAddresses: {
        value: ipAddresses,
        whereClause: '"assets"."id" IN (' + ipQb.getQuery() + ')',
      },
      ports: {
        value: ports,
        whereClause: `"portUnnested"."port" = ANY(:param)`,
      },
    };

    const queryBuilder = this.assetRepo
      .createQueryBuilder('assets')
      .leftJoin(
        (subQuery) =>
          subQuery
            .select('ports.assetId', 'assetId')
            .addSelect('unnest(ports.ports)', 'port')
            .from(Port, 'ports'),
        'portUnnested',
        '"portUnnested"."assetId" = "assets"."id"',
      )
      .leftJoin('assets.target', 'targets')
      .leftJoin('assets.httpResponses', 'httpResponses')
      .leftJoin('targets.workspaceTargets', 'workspaceTargets')
      .select(`"portUnnested"."port"`, 'port')
      .addSelect('COUNT(assets.id)', 'assetCount')
      .distinct(true)
      .where(`"portUnnested"."port" is not null`)
      .groupBy(`"portUnnested"."port"`);

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

    const total = (await queryBuilder.getRawMany()).length;

    const result = await queryBuilder
      .orderBy(`"${sortBy}"`, sortOrder)
      .offset(offset)
      .limit(limit)
      .getRawMany();

    const list = result.map((item: GetPortAssetsDTO) => {
      const obj = new GetPortAssetsDTO();
      obj.assetCount = item.assetCount;
      obj.port = item.port;
      return obj;
    });

    return getManyResponse({ query, data: list, total });
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
    const {
      limit,
      page,
      sortOrder,
      targetIds,
      workspaceId,
      value,
      ipAddresses,
      ports,
      techs,
    } = query;

    const offset = (page - 1) * limit;

    let sortBy = query.sortBy;
    if (!(sortBy in GetTechnologyAssetsDTO)) {
      sortBy = 'assetCount';
    }

    const ipQb = this.dataSource
      .createQueryBuilder()
      .addCommonTableExpression(
        `SELECT
        a.id AS asset_id,
        a."targetId",
        jsonb_array_elements_text(a."dnsRecords"::jsonb -> 'A') AS ip
    FROM assets a
    WHERE a."targetId" IS NOT NULL

    UNION ALL

    SELECT
        a.id AS asset_id,
        a."targetId",
        jsonb_array_elements_text(a."dnsRecords"::jsonb -> 'AAAA') AS ip
    FROM assets a
    WHERE a."targetId" IS NOT NULL`,
        'cte',
      )
      .select('t.asset_id', 'asset_id')
      .where('t.ip = ANY(:ipAddresses)', {
        ipAddresses,
      })
      .from('cte', 't');

    const whereBuilder = {
      value: {
        value: `%${value}%`,
        whereClause: `"techUnnested"."tech" ILIKE :param`,
      },
      targetIds: {
        value: targetIds,
        whereClause: `"assets"."targetId" = ANY(:param)`,
      },
      workspaceId: {
        value: workspaceId,
        whereClause: `workspaceTargets.workspaceId = :param`,
      },
      techs: {
        value: techs,
        whereClause: `"techUnnested"."tech" = ANY(:param)`,
      },
      ipAddresses: {
        value: ipAddresses,
        whereClause: '"assets"."id" IN (' + ipQb.getQuery() + ')',
      },
      ports: {
        value: ports,
        whereClause: `"ports"."ports" && :param`,
      },
    };
    const queryBuilder = this.assetRepo
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
      .leftJoin('assets.ports', 'ports')
      .select(`"techUnnested"."tech"`, 'technology')
      .addSelect('COUNT(assets.id)', 'assetCount')
      .distinct(true)
      .where(`"techUnnested"."tech" is not null`)
      .groupBy(`"techUnnested"."tech"`);

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

    const total = (await queryBuilder.getRawMany()).length;

    const result = await queryBuilder
      .orderBy(`"${sortBy}"`, sortOrder)
      .offset(offset)
      .limit(limit)
      .getRawMany();

    const list = result.map((item: GetTechnologyAssetsDTO) => {
      const obj = new GetTechnologyAssetsDTO();
      obj.assetCount = item.assetCount;
      obj.technology = item.technology;
      return obj;
    });

    return getManyResponse({ query, data: list, total });
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
    const { workspaceId, targetIds } = query;

    const ipAddressesQb = this.dataSource
      .createQueryBuilder()
      .addCommonTableExpression(
        `SELECT
        a.id AS asset_id,
        a."targetId",
        jsonb_array_elements_text(a."dnsRecords"::jsonb -> 'A') AS ip
    FROM assets a
    WHERE a."targetId" IS NOT NULL

    UNION ALL

    SELECT
        a.id AS asset_id,
        a."targetId",
        jsonb_array_elements_text(a."dnsRecords"::jsonb -> 'AAAA') AS ip
    FROM assets a
    WHERE a."targetId" IS NOT NULL`,
        'cte',
      )
      .select('t.ip', 'ip')
      .from('cte', 't')
      .distinct(true)
      .leftJoin(WorkspaceTarget, 'wt', 'wt."targetId" = t."targetId"')
      .where('wt.workspaceId = :workspaceId', { workspaceId });

    const portsQb = this.assetRepo
      .createQueryBuilder('assets')
      .leftJoin(
        (subQuery) =>
          subQuery
            .select('ports."assetId"', 'assetId')
            .addSelect('unnest(ports.ports)', 'port')
            .from(Port, 'ports'),
        'portUnnested',
        '"portUnnested"."assetId" = "assets"."id"',
      )
      .leftJoin(WorkspaceTarget, 'wt', 'wt."targetId" = "assets"."targetId"')
      .select(`"portUnnested"."port"`, 'port')
      .distinct(true)
      .where(`"portUnnested"."port" is not null`)
      .andWhere('wt.workspaceId = :workspaceId', { workspaceId });

    const techsQb = this.assetRepo
      .createQueryBuilder('assets')
      .leftJoin(
        (subQuery) =>
          subQuery
            .select('"httpResponses"."assetId"', 'assetId')
            .addSelect('unnest(httpResponses.tech)', 'tech')
            .from(HttpResponse, 'httpResponses'),
        'techUnnested',
        '"techUnnested"."assetId" = "assets"."id"',
      )
      .leftJoin(WorkspaceTarget, 'wt', 'wt."targetId" = "assets"."targetId"')
      .select(`"techUnnested"."tech"`, 'technology')
      .distinct(true)
      .where(`"techUnnested"."tech" is not null`)
      .andWhere('wt.workspaceId = :workspaceId', { workspaceId });

    if (targetIds && targetIds.length > 0) {
      ipAddressesQb.andWhere('"t"."targetId" = ANY(:targetIds)', {
        targetIds,
      });
      portsQb.andWhere('"assets"."targetId" = ANY(:targetIds)', { targetIds });
      techsQb.andWhere('"assets"."targetId" = ANY(:targetIds)', { targetIds });
    }

    const ipAddresses = await ipAddressesQb.getRawMany();
    const ports = await portsQb.getRawMany();
    const techs = await techsQb.getRawMany();

    const result = new GetFacetedDataDTO();
    result.techs = techs.map((e: { technology: string }) => e.technology);
    result.ipAddresses = ipAddresses.map((e: { ip: string }) => e.ip);
    result.ports = ports.map((e: { port: string }) => e.port);

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
