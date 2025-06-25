import { Injectable, Get } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Asset } from './entities/assets.entity';
import { Target } from '../targets/entities/target.entity';
import { JobsRegistryService } from '../jobs-registry/jobs-registry.service';
import { randomUUID } from 'crypto';
import { WorkerName } from 'src/common/enums/enum';
import { IdQueryParamDto } from 'src/common/dtos/id-query-param.dto';
import {
  GetManyBaseQueryParams,
  GetManyResponseDto,
} from 'src/common/dtos/get-many-base.dto';
import { getManyResponse } from 'src/utils/getManyResponse';

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
  ): Promise<GetManyResponseDto<Asset>> {
    const { limit, page, sortOrder } = query;
    let { sortBy } = query;

    if (!(sortBy in Asset)) {
      sortBy = 'createdAt';
    }

    const [data, total] = await this.repo.findAndCount({
      where: { target: { id } },
      take: limit,
      skip: (page - 1) * limit,
      order: {
        [sortBy]: sortOrder,
      },
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
    this.jobRegistryService.createJob(asset, WorkerName.SUBFINDER);
    return asset;
  }
}
