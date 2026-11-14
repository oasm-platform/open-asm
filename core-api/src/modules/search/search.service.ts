import type { GetManyBaseResponseDto } from '@/common/dtos/get-many-base.dto';
import { containsLikePattern } from '@/common/utils/like-pattern.util';
import { getManyResponse } from '@/utils/getManyResponse';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssetsService } from '../assets/assets.service';
import { User } from '../auth/entities/user.entity';
import { TargetsService } from '../targets/targets.service';
import { Vulnerability } from '../vulnerabilities/entities/vulnerability.entity';
import {
  GetManySearchHistoryDto,
  SearchAssetsTargetsDto,
  SearchResponseDto,
} from './dto/search.dto';
import { SearchHistory } from './entities/search-history.entity';
import { approvedVulnerabilityCondition } from '../vulnerabilities/open-vulnerability';

const VULNERABILITY_SEARCH_LIMIT = 5;

type ResultPage = Pick<GetManyBaseResponseDto<unknown>, 'data' | 'total'>;

const EMPTY_PAGE: ResultPage = { data: [], total: 0 };

/**
 * Per-type page sizes, derived only from the filtered totals so they stay the
 * same on every page of one search (pages never overlap or skip rows).
 * Targets get up to half of the page; whatever one side cannot fill goes to
 * the other.
 */
export function splitSearchLimit(
  limit: number,
  assetsTotal: number,
  targetsTotal: number,
): { assetsLimit: number; targetsLimit: number } {
  let targetsLimit = Math.min(targetsTotal, Math.floor(limit / 2));
  const assetsLimit = Math.min(assetsTotal, limit - targetsLimit);
  targetsLimit = Math.min(targetsTotal, limit - assetsLimit);
  return { assetsLimit, targetsLimit };
}

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

    @InjectRepository(Vulnerability)
    private readonly vulnerabilityRepo: Repository<Vulnerability>,

    private readonly assetService: AssetsService,
    private readonly targetService: TargetsService,
  ) {}

  /**
   * Searches for assets, targets and findings in a workspace.
   *
   * The first round fetches page 1 of assets and targets at the full limit,
   * which also yields their filtered totals; the page is then split between
   * them with `splitSearchLimit`. Later pages need a second round at the
   * per-type limits.
   */
  public async searchAssetsTargets(
    user: User,
    query: SearchAssetsTargetsDto,
    workspaceId: string,
  ): Promise<SearchResponseDto> {
    const value = query.value?.trim() ?? '';
    const page = +query.page || 1;
    const limit = +query.limit;

    const fetchPage = (
      pageNo: number,
      assetsLimit: number,
      targetsLimit: number,
    ): Promise<[ResultPage, ResultPage]> =>
      Promise.all([
        value && assetsLimit > 0
          ? this.assetService.getManyAsssetServices(
              { ...query, value, page: pageNo, limit: assetsLimit },
              workspaceId,
            )
          : EMPTY_PAGE,
        value && targetsLimit > 0
          ? this.targetService.getTargetsInWorkspace(
              { ...query, value, page: pageNo, limit: targetsLimit },
              workspaceId,
            )
          : EMPTY_PAGE,
      ]);

    const [[firstAssets, firstTargets], vulnerabilities] = await Promise.all([
      fetchPage(1, limit, limit),
      this.searchVulnerabilities(value, query, workspaceId),
      query.isSaveHistory === true && value
        ? this.saveHistory(user, value)
        : undefined,
    ]);

    const { assetsLimit, targetsLimit } = splitSearchLimit(
      limit,
      firstAssets.total,
      firstTargets.total,
    );

    let assets = firstAssets.data.slice(0, assetsLimit);
    let targets = firstTargets.data.slice(0, targetsLimit);
    if (page > 1) {
      const [pagedAssets, pagedTargets] = await fetchPage(
        page,
        assetsLimit,
        targetsLimit,
      );
      assets = pagedAssets.data;
      targets = pagedTargets.data;
    }

    const pageCount = Math.max(
      assetsLimit > 0 ? Math.ceil(firstAssets.total / assetsLimit) : 0,
      targetsLimit > 0 ? Math.ceil(firstTargets.total / targetsLimit) : 0,
    );

    const response = {
      data: { assets, targets, vulnerabilities },
      total: firstAssets.total + firstTargets.total + vulnerabilities.length,
      page,
      limit,
      pageCount,
      hasNextPage: page < pageCount,
    };

    return response as unknown as SearchResponseDto;
  }

  /** Upserts the query by (query, userId); a repeat moves it to the top. */
  private async saveHistory(user: User, value: string): Promise<void> {
    const existingHistory = await this.searchHistoryRepo.findOne({
      where: { query: value, userId: user.id },
    });

    if (existingHistory) {
      await this.searchHistoryRepo.update(existingHistory.id, {
        updatedAt: new Date(),
        createdAt: new Date(),
      });
      return;
    }

    await this.searchHistoryRepo.save(
      this.searchHistoryRepo.create({ query: value, userId: user.id }),
    );
  }

  /** Top findings matching name, CVE or affected URL, scoped to the workspace. */
  private async searchVulnerabilities(
    value: string,
    query: SearchAssetsTargetsDto,
    workspaceId: string,
  ): Promise<Vulnerability[]> {
    const hasSeverity = Array.isArray(query.severity) && query.severity.length > 0;
    if (!value && !hasSeverity) return [];

    const qb = this.vulnerabilityRepo
      .createQueryBuilder('v')
      .leftJoin('v.asset', 'assets')
      .addSelect(['assets.id', 'assets.value'])
      .leftJoin('assets.target', 'targets')
      .where('targets.workspaceId = :workspaceId', { workspaceId })
      // AI proposals under review (or rejected) are not findings yet
      .andWhere(approvedVulnerabilityCondition('v'))
      .orderBy('v.createdAt', 'DESC')
      .take(VULNERABILITY_SEARCH_LIMIT);

    if (value) {
      // array_to_string instead of EXISTS (unnest ...): one expression per
      // row, no per-row set-returning subquery.
      qb.andWhere(
        `(v.name ILIKE :q OR v."affectedUrl" ILIKE :q OR array_to_string(v."cveId", ' ') ILIKE :q)`,
        { q: containsLikePattern(value) },
      );
    }

    if (hasSeverity) {
      qb.andWhere('v.severity IN (:...severity)', {
        severity: query.severity,
      });
    }

    return qb.getMany();
  }

  /**
   * Retrieves a paginated list of search history for a specific workspace.
   *
   * @param user - The user object containing the user ID.
   * @param query - The query parameters to filter and paginate the search history.
   * @returns A promise that resolves to a paginated list of search history, including total count and pagination information.
   */
  public async getSearchHistory(user: User, query: GetManySearchHistoryDto) {
    const searchQuery = query.query?.trim();

    const queryBuilder = this.searchHistoryRepo
      .createQueryBuilder('searchHistory')
      .where('searchHistory.userId = :userId', { userId: user.id })
      .orderBy('searchHistory.createdAt', 'DESC')
      .take(query.limit)
      .skip((query.page - 1) * query.limit);

    if (searchQuery) {
      queryBuilder.andWhere('searchHistory.query ILIKE :query', {
        query: containsLikePattern(searchQuery),
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
    await this.searchHistoryRepo.delete({ userId: user.id });
    return { success: true };
  }
}
