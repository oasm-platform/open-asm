import { getManyResponse } from '@/utils/getManyResponse';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssetsService } from '../assets/assets.service';
import { User } from '../auth/entities/user.entity';
import { StatisticService } from '../statistic/statistic.service';
import { TargetsService } from '../targets/targets.service';
import {
  GetManySearchHistoryDto,
  SearchAssetsTargetsDto,
  SearchResponseDto,
} from './dto/search.dto';
import { SearchHistory } from './entities/search-history.entity';

/**
 * Service for managing search operations and search history.
 * It allows searching for assets and targets within a workspace,
 * retrieving search history, and managing search history entries.
 */
@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(SearchHistory)
    private readonly searchHistoryRepo: Repository<SearchHistory>,

    private readonly assetService: AssetsService,
    private readonly targetService: TargetsService,
    private readonly statisticService: StatisticService,
  ) {}

  /**
   * Searches for assets and targets in a workspace based on the provided query.
   *
   * @param query - The query parameters for the search, including workspace ID, limit, page, and search value.
   * @returns A promise that resolves to an object containing the combined results of assets and targets, along with pagination information.
   */
  public async searchAssetsTargets(
    user: User,
    query: SearchAssetsTargetsDto,
    workspaceId: string,
  ): Promise<SearchResponseDto> {
    // First, get the total count for both assets and targets
    const [assetsCount, targetsCount] = await Promise.all([
      this.statisticService.getTotalAssets(query),
      this.statisticService.getTotalTargets(query),
    ]);

    const totalItems = assetsCount + targetsCount;
    const { assetsLimit, targetsLimit } = this.calculateLimits(
      assetsCount,
      targetsCount,
      query.limit,
    );

    // Fetch the actual data with calculated limits
    const [assets, targets] = await Promise.all([
      assetsLimit > 0
        ? this.assetService.getManyAsssetServices(
            {
              ...query,
              limit: assetsLimit,
            },
            workspaceId,
          )
        : { data: [], total: 0, page: 1, pageCount: 0 },
      targetsLimit > 0
        ? this.targetService.getTargetsInWorkspace(
            {
              ...query,
              limit: targetsLimit,
            },
            workspaceId,
          )
        : { data: [], total: 0, page: 1, pageCount: 0 },
    ]);

    // Combine and sort by relevance (you might want to adjust sorting based on your needs)
    const combinedResults = {
      assets: assets.data || [],
      targets: targets.data || [],
    };

    const response = {
      data: combinedResults,
      total: (assets.total || 0) + (targets.total || 0),
      page: +query.page,
      limit: +query.limit,
      pageCount: Math.ceil((assets.total + targets.total) / query.limit),
      hasNextPage: query.page * query.limit < totalItems,
    };

    if (query.isSaveHistory === true) {
      const existingHistory = await this.searchHistoryRepo.findOne({
        where: {
          query: query.value,
          userId: user.id,
        },
      });

      if (existingHistory) {
        // Update existing history
        await this.searchHistoryRepo.update(existingHistory.id, {
          updatedAt: new Date(),
          createdAt: new Date(),
        });
      } else {
        // Create new history
        const searchHistory = this.searchHistoryRepo.create({
          query: query.value,
          userId: user.id,
        });
        await this.searchHistoryRepo.save(searchHistory);
      }
    }
    return response as unknown as SearchResponseDto;
  }

  private calculateLimits(
    assetsCount: number,
    targetsCount: number,
    limit: number,
  ): { assetsLimit: number; targetsLimit: number } {
    const totalItems = assetsCount + targetsCount;
    let assetsLimit = 0;
    let targetsLimit = 0;

    if (totalItems > 0) {
      // Calculate the ratio of assets to targets
      const targetsRatio = targetsCount / totalItems;
      targetsLimit = Math.max(1, Math.round(limit * targetsRatio));
      assetsLimit = limit - targetsLimit;

      // Adjust if we went over the limit due to rounding
      if (assetsLimit + targetsLimit > limit) {
        assetsLimit = Math.max(1, assetsLimit - 1);
        targetsLimit = Math.max(1, targetsLimit - 1);
      }
    }

    return { assetsLimit, targetsLimit };
  }

  /**
   * Retrieves a paginated list of search history for a specific workspace.
   *
   * @param user - The user object containing the user ID.
   * @param query - The query parameters to filter and paginate the search history.
   * @returns A promise that resolves to a paginated list of search history, including total count and pagination information.
   */
  public async getSearchHistory(user: User, query: GetManySearchHistoryDto) {
    const { query: searchQuery } = query;

    const queryBuilder = this.searchHistoryRepo
      .createQueryBuilder('searchHistory')
      .where('searchHistory.userId = :userId', { userId: user.id })
      .orderBy('searchHistory.createdAt', 'DESC')
      .take(query.limit)
      .skip((query.page - 1) * query.limit);

    if (searchQuery) {
      queryBuilder.andWhere('searchHistory.query LIKE :query', {
        query: `%${searchQuery}%`,
      });
    }

    const [searchHistory, total] = await queryBuilder.getManyAndCount();

    return getManyResponse({ query, data: searchHistory, total });
  }

  /**
   * Deletes a specific search history entry by its ID.
   *
   * @param user - The user object containing the user ID.
   * @param id - The ID of the search history entry to be deleted.
   * @returns A promise that resolves to an object containing the success status.
   */
  async deleteSearchHistory(user: User, id: string) {
    const searchHistory = await this.searchHistoryRepo.findOne({
      where: {
        id,
        user: { id: user.id },
      },
    });

    if (!searchHistory) {
      throw new NotFoundException('Search history not found');
    }

    await this.searchHistoryRepo.delete(id);
    return { success: true };
  }

  /**
   * Deletes all search history entries for the user.
   *
   * @param user - The user object containing the user ID.
   * @returns A promise that resolves to an object containing the success status.
   */
  async deleteAllSearchHistories(user: User) {
    await this.searchHistoryRepo.delete({ user });
    return { success: true };
  }
}
