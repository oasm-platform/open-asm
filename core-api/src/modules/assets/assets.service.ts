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
@Injectable()
export class AssetsService {
  constructor(
    @InjectRepository(Asset)
    public readonly repo: Repository<Asset>,

    @InjectRepository(Target)
    public readonly targetRepo: Repository<Target>,
    private jobRegistryService: JobsRegistryService,
  ) {}

  // /**
  //  * Retrieves a paginated list of assets associated with a specified workspace.
  //  *
  //  * @param query - The query parameters to filter and paginate the assets.
  //  * @returns A promise that resolves to a paginated list of assets, including total count and pagination information.
  //  */
  // public async getAssetsInWorkspace(
  //   query: GetAssetsQueryDto,
  // ): Promise<GetManyBaseResponseDto<GetAssetsResponseDto>> {
  //   const {
  //     limit,
  //     page,
  //     sortOrder,
  //     workspaceId,
  //     targetId,
  //     port,
  //     tech,
  //     statusCode,
  //   } = query;
  //   let { sortBy } = query;

  //   const validAssetFields = Object.keys(new Asset());
  //   if (!validAssetFields.includes(sortBy)) {
  //     sortBy = 'createdAt';
  //   }

  //   const queryBuilder = this.repo
  //     .createQueryBuilder('asset')
  //     .leftJoinAndSelect('asset.jobs', 'job')
  //     .leftJoinAndSelect('asset.target', 'target')
  //     .leftJoinAndSelect('target.workspaceTargets', 'workspaceTarget')
  //     .where('workspaceTarget.workspaceId = :workspaceId', { workspaceId });

  //   if (targetId?.length) {
  //     queryBuilder.andWhere('target.id IN (:...targetId)', { targetId });
  //   }

  //   // Create list of categorys to filter
  //   const categorys: category[] = [];
  //   if (port?.length) categorys.push(category.PORTS);
  //   if (tech?.length || statusCode?.length) categorys.push(category.HTTPX);

  //   if (categorys.length > 0) {
  //     queryBuilder.andWhere('job.category IN (:...categorys)', {
  //       categorys,
  //     });
  //   }
  //   // Apply filter for port
  //   if (port?.length) {
  //     queryBuilder.andWhere(
  //       `
  //       (job.category != :portcategory OR
  //        EXISTS (SELECT 1 FROM jsonb_array_elements_text(job."rawResult"::jsonb) as p WHERE p = ANY(:port)))
  //     `,
  //       {
  //         portcategory: category.PORTS,
  //         port: port.map(String),
  //       },
  //     );
  //   }

  //   // Apply filter for tech
  //   if (tech?.length) {
  //     queryBuilder.andWhere(
  //       `
  //       (job.category != :techcategory OR
  //        job."rawResult"::jsonb->'tech' ?| array[:...tech]::text[])
  //     `,
  //       {
  //         techcategory: category.HTTPX,
  //         tech: tech.map(String),
  //       },
  //     );
  //   }

  //   // Apply filter for status code
  //   if (statusCode?.length) {
  //     queryBuilder.andWhere(
  //       `
  //       (job.category != :statuscategory OR
  //        job."rawResult"::jsonb->>'status_code' IN (:...statusCode))
  //     `,
  //       {
  //         statuscategory: category.HTTPX,
  //         statusCode: statusCode.map(Number),
  //       },
  //     );
  //   }

  //   const [data, total] = await queryBuilder
  //     .orderBy(`asset.${sortBy}`, sortOrder)
  //     .skip((page - 1) * limit)
  //     .take(limit)
  //     .getManyAndCount();

  //   const assets: GetAssetsResponseDto[] = data.map((item) => {
  //     const asset = new GetAssetsResponseDto();
  //     asset.id = item.id;
  //     asset.value = item.value;
  //     asset.targetId = item.target.id;
  //     asset.isPrimary = item.isPrimary;
  //     asset.createdAt = item.createdAt;
  //     asset.updatedAt = item.updatedAt;
  //     asset.dnsRecords = item.dnsRecords;
  //     return asset;
  //   });

  //   return getManyResponse(query, assets, total);
  // }

  /**
   * Retrieves a paginated list of assets associated with a specified target.
   *
   * @param id - The ID of the target for which to retrieve assets.
   * @param query - The query parameters to filter and paginate the assets.
   * @returns A promise that resolves to a paginated list of assets, including total count and pagination information.
   */
  public async getAssets(
    query: GetAssetsQueryDto,
  ): Promise<GetManyBaseResponseDto<GetAssetsResponseDto>> {
    let { limit, page, sortOrder, targetIds, workspaceId, value } = query;

    let sortBy = query.sortBy;
    if (!(sortBy in Asset)) {
      sortBy = 'createdAt';
    }
    const offset = (page - 1) * limit;
    const sqlParams: any[] = [workspaceId];

    let whereClosure = 'wt."workspaceId" = $1 AND a."isErrorPage" = false ';

    const whereBuilder = {
      targetIds: (paramIndex: number) => ({
        sql: `a."targetId" = ANY($${paramIndex})`,
        params: [targetIds],
      }),
      value: (paramIndex: number) => ({
        sql: `a."value" ILIKE $${paramIndex}`,
        params: [`%${value}%`],
      }),
    };

    for (const key in whereBuilder) {
      if (query[key]) {
        whereClosure += ` AND ${whereBuilder[key](sqlParams.length + 1).sql}`;
        sqlParams.push(...whereBuilder[key](sqlParams.length + 1).params);
      }
    }

    const sql = ` WITH latest_jobs AS (
        SELECT DISTINCT ON ("assetId", "category")
          "assetId",
          "category",
          "rawResult",
          "createdAt"
        FROM jobs
        WHERE "rawResult" IS NOT NULL
        ORDER BY "assetId", "category", "createdAt" DESC
      )
      SELECT
        a.id,
        a.value,
        a."targetId",
        a."isPrimary",
        a."createdAt",
        a."updatedAt",
        a."dnsRecords",
        a."isErrorPage",
        COALESCE(json_object_agg(j."category", j."rawResult") FILTER (WHERE j."category" IS NOT NULL), '{}') AS "metadata"
      FROM assets a
      LEFT JOIN latest_jobs j ON j."assetId" = a.id
      LEFT JOIN targets t ON t.id = a."targetId"
      LEFT JOIN workspace_targets wt ON wt."targetId" = t.id

      WHERE ${whereClosure}
      GROUP BY a.id
       `;

    const rawData = await this.repo.query(
      `${sql} ORDER BY a."${sortBy}" ${sortOrder} LIMIT ${limit} OFFSET ${offset}`,
      sqlParams,
    );

    const total = await this.repo
      .query(`SELECT COUNT(*) FROM (${sql}) AS sub`, sqlParams)
      .then((res) => res[0].count);

    // Map raw data to GetAssetsResponseDto
    const data: GetAssetsResponseDto[] = rawData.map((item: any) => {
      const asset = new GetAssetsResponseDto();
      asset.id = item.id;
      asset.value = item.value;
      asset.targetId = item.targetId;
      asset.isPrimary = item.isPrimary;
      asset.createdAt = item.createdAt;
      asset.updatedAt = item.updatedAt;
      asset.dnsRecords = item.dnsRecords;
      asset.isErrorPage = item.isErrorPage;
      asset.metadata =
        typeof item.metadata === 'string'
          ? JSON.parse(item.metadata)
          : item.metadata || {};
      return asset;
    });

    return getManyResponse(query, data, total);
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
    const asset = await this.repo.save({
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
    const asset = await this.repo.findOne({
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
}
