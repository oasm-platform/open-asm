import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DefaultMessageResponseDto } from 'src/common/dtos/default-message-response.dto';
import {
  GetManyBaseQueryParams,
  GetManyBaseResponseDto,
} from 'src/common/dtos/get-many-base.dto';
import { WorkerName } from 'src/common/enums/enum';
import { getManyResponse, GetManyResponseDto } from 'src/utils/getManyResponse';
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
    private jobRegistryService: JobsRegistryService,
  ) {}

  /**
   * Retrieves a paginated list of assets associated with a specified workspace.
   *
   * @param query - The query parameters to filter and paginate the assets.
   * @returns A promise that resolves to a paginated list of assets, including total count and pagination information.
   */
  public async getAssetsInWorkspace(
    query: GetAssetsQueryDto,
  ): Promise<GetManyBaseResponseDto<GetAssetsResponseDto>> {
    const {
      limit,
      page,
      sortOrder,
      workspaceId,
      targetId,
      port,
      tech,
      statusCode,
    } = query;
    let { sortBy } = query;

    const validAssetFields = Object.keys(new Asset());
    if (!validAssetFields.includes(sortBy)) {
      sortBy = 'createdAt';
    }

    const queryBuilder = this.repo
      .createQueryBuilder('asset')
      .leftJoinAndSelect('asset.jobs', 'job')
      .leftJoinAndSelect('asset.target', 'target')
      .leftJoinAndSelect('target.workspaceTargets', 'workspaceTarget')
      .where('workspaceTarget.workspaceId = :workspaceId', { workspaceId });

    if (targetId?.length) {
      queryBuilder.andWhere('target.id IN (:...targetId)', { targetId });
    }

    // Create list of workerNames to filter
    const workerNames: WorkerName[] = [];
    if (port?.length) workerNames.push(WorkerName.PORTS);
    if (tech?.length || statusCode?.length) workerNames.push(WorkerName.HTTPX);

    if (workerNames.length > 0) {
      queryBuilder.andWhere('job.workerName IN (:...workerNames)', {
        workerNames,
      });
    }
    // Apply filter for port
    if (port?.length) {
      queryBuilder.andWhere(
        `
        (job.workerName != :portWorkerName OR 
         EXISTS (SELECT 1 FROM jsonb_array_elements_text(job."rawResult"::jsonb) as p WHERE p = ANY(:port)))
      `,
        {
          portWorkerName: WorkerName.PORTS,
          port: port.map(String),
        },
      );
    }

    // Apply filter for tech
    if (tech?.length) {
      queryBuilder.andWhere(
        `
        (job.workerName != :techWorkerName OR 
         job."rawResult"::jsonb->'tech' ?| array[:...tech]::text[])
      `,
        {
          techWorkerName: WorkerName.HTTPX,
          tech: tech.map(String),
        },
      );
    }

    // Apply filter for status code
    if (statusCode?.length) {
      queryBuilder.andWhere(
        `
        (job.workerName != :statusWorkerName OR 
         job."rawResult"::jsonb->>'status_code' IN (:...statusCode))
      `,
        {
          statusWorkerName: WorkerName.HTTPX,
          statusCode: statusCode.map(Number),
        },
      );
    }

    const [data, total] = await queryBuilder
      .orderBy(`asset.${sortBy}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const assets: GetAssetsResponseDto[] = data.map((item) => {
      const asset = new GetAssetsResponseDto();
      asset.id = item.id;
      asset.value = item.value;
      asset.targetId = item.target.id;
      asset.isPrimary = item.isPrimary;
      asset.createdAt = item.createdAt;
      asset.updatedAt = item.updatedAt;
      asset.dnsRecords = item.dnsRecords;
      return asset;
    });

    return getManyResponse(query, assets, total);
  }

  /**
   * Retrieves a paginated list of assets associated with a specified target.
   *
   * @param id - The ID of the target for which to retrieve assets.
   * @param query - The query parameters to filter and paginate the assets.
   * @returns A promise that resolves to a paginated list of assets, including total count and pagination information.
   */
  public async getAllAssetsInTarget(
    id: string,
    query: GetManyBaseQueryParams,
  ): Promise<GetManyBaseResponseDto<GetAssetsResponseDto>> {
    const { limit, page, sortOrder } = query;

    let sortBy = query.sortBy;
    if (!(sortBy in Asset)) {
      sortBy = 'createdAt';
    }

    const rawData = await this.repo.query(
      `
      WITH latest_jobs AS (
        SELECT DISTINCT ON ("assetId", "workerName")
          "assetId",
          "workerName",
          "rawResult",
          "createdAt"
        FROM jobs
        WHERE "rawResult" IS NOT NULL
        ORDER BY "assetId", "workerName", "createdAt" DESC
      )
      SELECT
        a.id,
        a.value,
        a."targetId",
        a."isPrimary",
        a."createdAt",
        a."updatedAt",
        a."dnsRecords",
        COALESCE(json_object_agg(j."workerName", j."rawResult") FILTER (WHERE j."workerName" IS NOT NULL), '{}') AS "workerResults"
      FROM assets a
      LEFT JOIN latest_jobs j ON j."assetId" = a.id
      WHERE a."targetId" = $1
      GROUP BY a.id
      ORDER BY a."${sortBy}" ${sortOrder}
      LIMIT $2 OFFSET $3
      `,
      [id, limit, (page - 1) * limit],
    );

    const total = await this.repo.count({ where: { target: { id } } });

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
      asset.workerResults =
        typeof item.workerResults === 'string'
          ? JSON.parse(item.workerResults)
          : item.workerResults || {};
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
    this.jobRegistryService.createJob(asset, WorkerName.SUBDOMAINS);
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

    this.jobRegistryService.createJob(asset, WorkerName.SUBDOMAINS);
    return {
      message: 'Rescan started',
    };
  }
}
