import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import {
  GetManyBaseQueryParams,
  GetManyResponseDto,
} from 'src/common/dtos/get-many-base.dto';
import { WorkerName } from 'src/common/enums/enum';
import { getManyResponse } from 'src/utils/getManyResponse';
import { Repository } from 'typeorm';
import { JobsRegistryService } from '../jobs-registry/jobs-registry.service';
import { Target } from '../targets/entities/target.entity';
import { Asset } from './entities/assets.entity';
import { GetAssetsResponseDto } from './dto/assets.dto';

@Injectable()
export class AssetsService {
  constructor(
    @InjectRepository(Asset)
    public readonly repo: Repository<Asset>,
    private jobRegistryService: JobsRegistryService,
  ) {}

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
  ): Promise<GetManyResponseDto<GetAssetsResponseDto>> {
    const { limit, page, sortOrder } = query;

    let sortBy = query.sortBy;
    if (!(sortBy in Asset)) {
      sortBy = 'createdAt';
    }

    // Get raw data from the database
    const rawData = await this.repo.query(
      `
      WITH latest_job AS (
        SELECT DISTINCT ON ("assetId")
          "assetId",
          "workerName",
          "rawResult",
          "createdAt"
        FROM jobs
        WHERE "rawResult" IS NOT NULL
        ORDER BY "assetId", "createdAt" DESC
      )
      SELECT
        a.id,
        a.value,
        a."targetId",
        a."isPrimary",
        a."createdAt",
        a."updatedAt",
        a."dnsRecords",
        j."workerName",
        j."rawResult" AS "workerResult"
      FROM assets a
      LEFT JOIN latest_job j ON j."assetId" = a.id
      WHERE a."targetId" = $1
      ORDER BY a."${sortBy}" ${sortOrder}
      LIMIT $2 OFFSET $3
    `,
      [id, limit, (page - 1) * limit],
    );

    const total = await this.repo.count({ where: { target: { id } } });

    // Map raw data to GetAssetsResponseDto
    const data: GetAssetsResponseDto[] = rawData.map((item: any) => {
      let asset = new GetAssetsResponseDto();
      asset.id = item.id;
      asset.value = item.value;
      asset.targetId = item.targetId;
      asset.isPrimary = item.isPrimary;
      asset.createdAt = item.createdAt;
      asset.updatedAt = item.updatedAt;
      asset.dnsRecords = item.dnsRecords;
      asset.workerResults = item.workerName
        ? { [item.workerName]: item.workerResult }
        : {};
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
}
