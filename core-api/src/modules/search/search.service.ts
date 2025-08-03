import { Injectable } from '@nestjs/common';
import {
  SearchAssetsTargetsDto,
  SearchAssetsTargetsResponseDto,
} from './dto/search.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { SearchHistory } from './entities/search-history.entity';
import { Repository } from 'typeorm';
import { AssetsService } from '../assets/assets.service';
import { TargetsService } from '../targets/targets.service';
import { getManyResponse } from 'src/utils/getManyResponse';

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(SearchHistory)
    private readonly searchHistoryRepo: Repository<SearchHistory>,

    private readonly assetService: AssetsService,
    private readonly targetService: TargetsService,
  ) {}

  /**
   * Searches for assets and targets in a workspace based on the provided query.
   *
   * @param query - The query parameters for the search, including workspace ID, limit, page, and search value.
   * @returns A promise that resolves to an object containing the combined results of assets and targets, along with pagination information.
   */
  public async searchAssetsTargets(
    query: SearchAssetsTargetsDto,
  ): Promise<SearchAssetsTargetsResponseDto> {
    // First, get the total count for both assets and targets
    const [assetsCount, targetsCount] = await Promise.all([
      this.assetService.countAssetsInWorkspace(query.workspaceId),
      this.targetService.countTargetsInWorkspace(query.workspaceId),
    ]);

    const totalItems = assetsCount + targetsCount;
    let assetsLimit = 0;
    let targetsLimit = 0;

    if (totalItems > 0) {
      // Calculate the ratio of assets to targets
      const targetsRatio = targetsCount / totalItems;
      targetsLimit = Math.max(1, Math.round(query.limit * targetsRatio));
      assetsLimit = query.limit - targetsLimit;

      // Adjust if we went over the limit due to rounding
      if (assetsLimit + targetsLimit > query.limit) {
        assetsLimit = Math.max(1, assetsLimit - 1);
        targetsLimit = Math.max(1, targetsLimit - 1);
      }
    }

    // Fetch the actual data with calculated limits
    const [assets, targets] = await Promise.all([
      assetsLimit > 0
        ? this.assetService.getAssetsInWorkspace({
            ...query,
            limit: assetsLimit,
          })
        : { data: [], total: 0, page: 1, pageCount: 0 },
      targetsLimit > 0
        ? this.targetService.getTargetsInWorkspace({
            ...query,
            limit: targetsLimit,
          })
        : { data: [], total: 0, page: 1, pageCount: 0 },
    ]);

    // Combine and sort by relevance (you might want to adjust sorting based on your needs)
    const combinedResults = {
      assets: assets.data || [],
      targets: targets.data || [],
    };

    return {
      data: combinedResults,
      total: (assets.total || 0) + (targets.total || 0),
      page: +query.page,
      limit: +query.limit,
      pageCount: Math.ceil((assets.total + targets.total) / query.limit),
      hasNextPage: query.page * query.limit < totalItems,
    };
  }
}
