import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { getManyResponse } from 'src/utils/getManyResponse';
import { Repository } from 'typeorm';
import { AssetsService } from '../assets/assets.service';
import { User } from '../auth/entities/user.entity';
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
  ): Promise<SearchResponseDto> {
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

    const response = {
      data: combinedResults,
      total: (assets.total || 0) + (targets.total || 0),
      page: +query.page,
      limit: +query.limit,
      pageCount: Math.ceil((assets.total + targets.total) / query.limit),
      hasNextPage: query.page * query.limit < totalItems,
    };

    // Check if search history already exists
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

    return response as any;
  }

  /**
   * Retrieves a paginated list of search history for a specific workspace.
   *
   * @param user - The user object containing the user ID.
   * @param query - The query parameters to filter and paginate the search history.
   * @returns A promise that resolves to a paginated list of search history, including total count and pagination information.
   */
  public async getSearchHistory(user: User, query: GetManySearchHistoryDto) {
    const [searchHistory, total] = await this.searchHistoryRepo
      .createQueryBuilder('searchHistory')
      .where('searchHistory.userId = :userId', { userId: user.id })
      .orderBy('searchHistory.createdAt', 'DESC')
      .take(query.limit)
      .skip((query.page - 1) * query.limit)
      .getManyAndCount();

    return getManyResponse(query, searchHistory, total);
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
